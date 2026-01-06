import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Hook for recording audio using the MediaRecorder API
 * Provides recording controls, permission handling, and audio stream for visualizations
 */
export function useAudioRecorder(options = {}) {
  const {
    onRecordingComplete,
    maxDuration = 300, // 5 minutes default max
    mimeType = 'audio/webm;codecs=opus'
  } = options

  // State
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [error, setError] = useState(null)
  const [permissionStatus, setPermissionStatus] = useState('prompt') // 'granted' | 'denied' | 'prompt'

  // Refs
  const mediaRecorderRef = useRef(null)
  const audioStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  // Check permission status on mount
  useEffect(() => {
    checkPermission()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const checkPermission = async () => {
    try {
      // Check if permissions API is available
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'microphone' })
        setPermissionStatus(result.state)
        result.onchange = () => setPermissionStatus(result.state)
      }
    } catch (err) {
      // Permissions API not supported, will check on getUserMedia call
      console.log('Permissions API not supported')
    }
  }

  const cleanup = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Stop all tracks
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
    mediaRecorderRef.current = null
  }, [])

  const requestPermission = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })
      // Permission granted, stop the test stream
      stream.getTracks().forEach(track => track.stop())
      setPermissionStatus('granted')
      return true
    } catch (err) {
      console.error('Permission denied:', err)
      setPermissionStatus('denied')
      setError('Microphone access denied. Please enable microphone permissions.')
      return false
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      chunksRef.current = []

      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })
      audioStreamRef.current = stream
      setPermissionStatus('granted')

      // Set up audio context for visualizations
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      // Determine supported mime type
      let selectedMimeType = mimeType
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback options
        const fallbacks = ['audio/webm', 'audio/mp4', 'audio/ogg']
        selectedMimeType = fallbacks.find(type => MediaRecorder.isTypeSupported(type)) || ''
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType || undefined
      })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: selectedMimeType || 'audio/webm'
        })
        setAudioBlob(blob)

        // Create URL for playback
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)

        // Callback
        if (onRecordingComplete) {
          onRecordingComplete(blob, url)
        }

        // Cleanup stream
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error)
        setError('Recording error: ' + event.error.message)
        cleanup()
      }

      // Start recording
      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      setIsPaused(false)
      setRecordingTime(0)
      startTimeRef.current = Date.now()

      // Start timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setRecordingTime(elapsed)

        // Auto-stop at max duration
        if (elapsed >= maxDuration) {
          stopRecording()
        }
      }, 100)

    } catch (err) {
      console.error('Error starting recording:', err)
      if (err.name === 'NotAllowedError') {
        setPermissionStatus('denied')
        setError('Microphone access denied. Please enable microphone permissions.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.')
      } else {
        setError('Could not start recording: ' + err.message)
      }
    }
  }, [mimeType, maxDuration, onRecordingComplete, cleanup])

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    setIsRecording(false)
    setIsPaused(false)
  }, [])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)

      // Pause timer
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)

      // Resume timer
      const pausedTime = recordingTime
      startTimeRef.current = Date.now() - (pausedTime * 1000)
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setRecordingTime(elapsed)

        if (elapsed >= maxDuration) {
          stopRecording()
        }
      }, 100)
    }
  }, [recordingTime, maxDuration, stopRecording])

  const resetRecording = useCallback(() => {
    cleanup()

    // Revoke old URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }

    setIsRecording(false)
    setIsPaused(false)
    setRecordingTime(0)
    setAudioBlob(null)
    setAudioUrl(null)
    setError(null)
    chunksRef.current = []
  }, [audioUrl, cleanup])

  // Format time as MM:SS
  const formattedTime = useCallback(() => {
    const minutes = Math.floor(recordingTime / 60)
    const seconds = recordingTime % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [recordingTime])

  return {
    // State
    isRecording,
    isPaused,
    recordingTime,
    formattedTime: formattedTime(),
    audioBlob,
    audioUrl,
    error,
    permissionStatus,

    // Actions
    requestPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,

    // For visualizations
    audioStream: audioStreamRef.current,
    analyserNode: analyserRef.current
  }
}

export default useAudioRecorder
