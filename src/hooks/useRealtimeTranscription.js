import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Hook for real-time audio transcription using WebSocket streaming
 * Streams audio to server and receives live transcription updates
 */
export function useRealtimeTranscription(options = {}) {
  const {
    language = 'en',
    onTranscription,
    onFinalTranscription,
    onError
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [error, setError] = useState(null)
  const [analyserNode, setAnalyserNode] = useState(null)

  const wsRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const chunksRef = useRef([])

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.hostname}:4000/ws/transcribe`

    console.log('Connecting to WebSocket:', wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
      setError(null)

      // Send config
      ws.send(JSON.stringify({
        type: 'config',
        language: language
      }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'ready') {
          console.log('Server ready for audio')
        }

        if (data.type === 'transcription') {
          console.log('Transcription received:', data.text, 'isFinal:', data.isFinal)

          if (data.isFinal) {
            setFinalTranscript(data.text)
            onFinalTranscription?.(data.text)
          } else {
            setTranscript(data.text)
            onTranscription?.(data.text)
          }
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err)
      }
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
      setError('Connection error')
      onError?.(err)
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
      setIsStreaming(false)
    }
  }, [language, onTranscription, onFinalTranscription, onError])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  // Start streaming audio
  const startStreaming = useCallback(async () => {
    try {
      setError(null)
      setTranscript('')
      setFinalTranscript('')
      chunksRef.current = []

      // Connect if not connected
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect()
        // Wait for connection
        await new Promise((resolve, reject) => {
          const checkConnection = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              clearInterval(checkConnection)
              resolve()
            }
          }, 100)
          setTimeout(() => {
            clearInterval(checkConnection)
            reject(new Error('Connection timeout'))
          }, 5000)
        })
      } else {
        // WebSocket already open - send config to reset server state
        console.log('WebSocket already open, sending config to restart transcription')
        wsRef.current.send(JSON.stringify({
          type: 'config',
          language: language
        }))
      }

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      })
      audioStreamRef.current = stream

      // Set up audio context for visualization
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser
      setAnalyserNode(analyser)

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      // Determine supported mime type
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        const fallbacks = ['audio/webm', 'audio/mp4', 'audio/ogg']
        mimeType = fallbacks.find(type => MediaRecorder.isTypeSupported(type)) || ''
      }

      // Create MediaRecorder to capture audio chunks
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined
      })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          // Store chunk for blob creation
          chunksRef.current.push(event.data)

          // Send audio data to server
          event.data.arrayBuffer().then(buffer => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(buffer)
            }
          })
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error)
        setError('Recording error')
      }

      // Start recording with small timeslice for frequent data
      mediaRecorder.start(250) // Send chunk every 250ms
      setIsStreaming(true)
      console.log('Started streaming audio')

    } catch (err) {
      console.error('Error starting stream:', err)
      setError(err.message)
      onError?.(err)
    }
  }, [connect, onError, language])

  // Stop streaming and get final transcription
  const stopStreaming = useCallback(async () => {
    return new Promise((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }

      // Stop audio stream
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
        audioStreamRef.current = null
      }

      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      analyserRef.current = null
      setAnalyserNode(null)

      setIsStreaming(false)

      // Request final transcription
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Set up listener for final transcription
        const originalOnMessage = wsRef.current.onmessage
        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'transcription' && data.isFinal) {
              setFinalTranscript(data.text)
              onFinalTranscription?.(data.text)

              // Create blob from chunks
              const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
              const blob = new Blob(chunksRef.current, { type: mimeType })
              const url = URL.createObjectURL(blob)

              resolve({ text: data.text, audioBlob: blob, audioUrl: url })

              // Restore original handler
              if (wsRef.current) {
                wsRef.current.onmessage = originalOnMessage
              }
            }
          } catch (err) {
            console.error('Error parsing final message:', err)
            resolve({ text: transcript, audioBlob: null, audioUrl: null })
          }
        }

        wsRef.current.send(JSON.stringify({ type: 'stop' }))

        // Timeout fallback
        setTimeout(() => {
          const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
          const blob = chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mimeType })
            : null
          const url = blob ? URL.createObjectURL(blob) : null
          resolve({ text: transcript || finalTranscript, audioBlob: blob, audioUrl: url })
        }, 3000)
      } else {
        resolve({ text: transcript || finalTranscript, audioBlob: null, audioUrl: null })
      }
    })
  }, [transcript, finalTranscript, onFinalTranscription])

  // Reset state
  const reset = useCallback(() => {
    setTranscript('')
    setFinalTranscript('')
    setError(null)
    chunksRef.current = []
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return {
    // State
    isConnected,
    isStreaming,
    transcript,
    finalTranscript,
    error,

    // Actions
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
    reset,

    // For visualizations
    analyserNode
  }
}

export default useRealtimeTranscription
