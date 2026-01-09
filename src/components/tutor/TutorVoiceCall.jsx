import { useState, useEffect, useRef, useCallback } from 'react'
import useRealtimeTranscription from '../../hooks/useRealtimeTranscription'

const PhoneOffIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const MicOffIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
)

const TextIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

const TutorVoiceCall = ({
  onEnd,
  onMessage,
  activeLanguage,
  nativeLanguage,
  tutorProfile,
  settings,
  conversationHistory,
  userName,
}) => {
  const [callState, setCallState] = useState('connecting') // connecting, listening, processing, speaking
  const [isMuted, setIsMuted] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)
  const [userText, setUserText] = useState('')
  const [tutorText, setTutorText] = useState('')
  const [error, setError] = useState(null)
  const [callDuration, setCallDuration] = useState(0)

  const {
    isConnected,
    isStreaming,
    transcript,
    finalTranscript,
    analyserNode,
    startStreaming,
    stopStreaming,
    reset: resetTranscription
  } = useRealtimeTranscription({
    language: activeLanguage || 'en',
    onTranscription: (text) => {
      setUserText(text)
    },
    onFinalTranscription: (text) => {
      console.log('Final user transcript:', text)
    }
  })

  const silenceTimeoutRef = useRef(null)
  const callTimerRef = useRef(null)
  const audioSourceRef = useRef(null)
  const audioContextRef = useRef(null)
  const localConversationRef = useRef([...conversationHistory])
  const mountedRef = useRef(true)
  const initCalledRef = useRef(false)

  // Format call duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Stop any currently playing audio
  const stopCurrentAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop()
      } catch (e) {}
      audioSourceRef.current = null
    }
    window.speechSynthesis.cancel()
  }

  // Helper: wrap promise with timeout
  const withTimeout = (promise, ms, fallback) => {
    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        console.warn(`Promise timed out after ${ms}ms`)
        resolve(fallback)
      }, ms)
    })
    return Promise.race([promise, timeout])
  }

  // Initialize call with tutor greeting
  useEffect(() => {
    // Reset mountedRef in case Strict Mode cleanup set it to false
    mountedRef.current = true

    // Prevent double-execution from React Strict Mode
    if (initCalledRef.current) {
      console.log('[VoiceCall] Init already called, skipping')
      return
    }
    initCalledRef.current = true

    const initCall = async () => {
      console.log('[VoiceCall] Starting init, mountedRef:', mountedRef.current)

      // Start call timer
      callTimerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1)
      }, 1000)

      // Get tutor greeting first (with timeout)
      let greeting = null
      try {
        console.log('[VoiceCall] Fetching greeting...')
        const greetingRes = await withTimeout(
          fetch('/api/tutor/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetLanguage: activeLanguage,
              sourceLanguage: nativeLanguage || 'English',
              memory: tutorProfile?.memory,
              voiceCall: true,
              userName: userName,
            }),
          }),
          10000,
          null
        )

        console.log('[VoiceCall] After greeting fetch, mountedRef:', mountedRef.current)

        if (greetingRes && greetingRes.ok) {
          const data = await greetingRes.json()
          greeting = data.greeting
          console.log('[VoiceCall] Got greeting:', greeting)
        } else {
          console.warn('[VoiceCall] Greeting fetch failed or timed out')
        }
      } catch (greetingErr) {
        console.error('[VoiceCall] Error fetching greeting:', greetingErr)
      }

      // Speak greeting if we got one
      if (greeting && mountedRef.current) {
        try {
          setTutorText(greeting)
          onMessage({ role: 'tutor', content: greeting })
          localConversationRef.current.push({ role: 'tutor', content: greeting })

          setCallState('speaking')
          await speakText(greeting)
          console.log('[VoiceCall] Finished speaking greeting')
        } catch (speakErr) {
          console.error('[VoiceCall] Error speaking greeting:', speakErr)
        }
      }

      // Always try to start listening (React ignores state updates on unmounted components)
      console.log('[VoiceCall] Starting to listen, mountedRef:', mountedRef.current)
      setTutorText('')
      resetTranscription()
      setCallState('listening')

      try {
        await startStreaming()
        console.log('[VoiceCall] Streaming started successfully')
      } catch (streamErr) {
        console.error('[VoiceCall] Error starting stream:', streamErr)
        setError('Microphone error. Please check permissions and refresh.')
      }
    }

    initCall()

    return () => {
      console.log('[VoiceCall] Cleanup running')
      mountedRef.current = false
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
      // Stop any playing audio
      stopCurrentAudio()
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Detect silence to trigger processing
  useEffect(() => {
    if (!analyserNode || !isStreaming || isMuted || callState !== 'listening') {
      console.log('[VoiceCall] Silence detection skipped:', { analyserNode: !!analyserNode, isStreaming, isMuted, callState })
      return
    }

    console.log('[VoiceCall] Silence detection started')

    const checkSilence = () => {
      const dataArray = new Uint8Array(analyserNode.frequencyBinCount)
      analyserNode.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      // If very quiet and we have some transcript, process it
      if (average < 5 && (transcript || finalTranscript)) {
        if (!silenceTimeoutRef.current) {
          console.log('[VoiceCall] Silence detected, will process in 0.8s. Transcript:', transcript || finalTranscript)
          silenceTimeoutRef.current = setTimeout(async () => {
            if (isStreaming && (transcript || finalTranscript)) {
              console.log('[VoiceCall] Processing speech after silence')
              await processUserSpeech()
            }
          }, 800) // 0.8 seconds of silence for faster response
        }
      } else {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = null
        }
      }
    }

    const interval = setInterval(checkSilence, 200)
    return () => {
      console.log('[VoiceCall] Silence detection cleanup')
      clearInterval(interval)
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }
    }
  }, [analyserNode, isStreaming, isMuted, callState, transcript, finalTranscript])

  // Audio queue for streaming playback
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)

  // Play next audio chunk from queue
  const playNextChunk = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return

    isPlayingRef.current = true
    const audioBase64 = audioQueueRef.current.shift()

    try {
      const binaryString = atob(audioBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext

      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer)
      const source = audioContext.createBufferSource()
      audioSourceRef.current = source

      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.onended = () => {
        isPlayingRef.current = false
        audioSourceRef.current = null
        playNextChunk() // Play next chunk
      }
      source.start()
    } catch (err) {
      console.error('Error playing audio chunk:', err)
      isPlayingRef.current = false
      playNextChunk() // Try next chunk
    }
  }

  // Process user speech with streaming response
  const processUserSpeech = async () => {
    // Stop streaming and get final transcript
    const result = await stopStreaming()
    const userSpeech = result.text || transcript || finalTranscript

    if (!userSpeech || !userSpeech.trim()) {
      // No speech detected, restart listening
      resetTranscription()
      await startStreaming()
      return
    }

    setCallState('processing')
    setUserText(userSpeech)

    // Add user message to history
    onMessage({ role: 'user', content: userSpeech })
    localConversationRef.current.push({ role: 'user', content: userSpeech })

    // Reset audio queue
    audioQueueRef.current = []
    isPlayingRef.current = false

    try {
      // Use streaming endpoint for faster response
      const response = await fetch('/api/tutor/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userSpeech,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage || 'English',
          conversationHistory: localConversationRef.current,
          memory: tutorProfile?.memory,
          settings: {
            languageLevel: settings?.languageLevel,
          },
        }),
      })

      if (!response.ok) throw new Error('Stream failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamingText = ''

      setCallState('speaking')
      setTutorText('')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'text') {
                // Update streaming text display
                streamingText += data.text
                setTutorText(streamingText)
              } else if (data.type === 'audio') {
                // Queue audio for playback
                audioQueueRef.current.push(data.audio)
                playNextChunk() // Start playing if not already
              } else if (data.type === 'done') {
                // Add final message to history
                onMessage({ role: 'tutor', content: data.fullText })
                localConversationRef.current.push({ role: 'tutor', content: data.fullText })
              }
            } catch (parseErr) {
              // Ignore parse errors from partial chunks
            }
          }
        }
      }

      // Wait for audio to finish playing
      const waitForAudio = () => new Promise((resolve) => {
        const check = () => {
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
            resolve()
          } else {
            setTimeout(check, 100)
          }
        }
        check()
      })

      await withTimeout(waitForAudio(), 15000, 'timeout')

      // Go back to listening
      console.log('[VoiceCall] Response complete, restarting listening...')
      setUserText('')
      setTutorText('')
      resetTranscription()
      setCallState('listening')
      await startStreaming()
      console.log('[VoiceCall] Streaming restarted, ready for next input')

    } catch (err) {
      console.error('Voice call error:', err)
      setError('Something went wrong. Trying again...')

      // Try to recover
      setTimeout(async () => {
        setError(null)
        setUserText('')
        setTutorText('')
        resetTranscription()
        setCallState('listening')
        await startStreaming()
      }, 2000)
    }
  }

  // Text-to-speech using ElevenLabs
  const speakText = async (text) => {
    // Stop any currently playing audio first
    stopCurrentAudio()

    try {
      const response = await fetch('/api/tutor/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: activeLanguage || 'English',
          voiceGender: 'female',
        }),
      })

      if (!response.ok) {
        console.warn('TTS API returned non-OK, falling back to browser TTS')
        return speakWithBrowserTTS(text)
      }

      const { audioBase64 } = await response.json()

      // Decode base64 to ArrayBuffer
      const binaryString = atob(audioBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const audioData = bytes.buffer

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext

      const audioBuffer = await audioContext.decodeAudioData(audioData)
      const source = audioContext.createBufferSource()
      audioSourceRef.current = source

      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start()

      // Promise with timeout - audio should complete within 30 seconds max
      const audioPromise = new Promise((resolve) => {
        source.onended = () => {
          audioSourceRef.current = null
          resolve('completed')
        }
      })

      return withTimeout(audioPromise, 30000, 'timeout')
    } catch (err) {
      console.error('TTS error:', err)
      return speakWithBrowserTTS(text)
    }
  }

  const speakWithBrowserTTS = (text) => {
    const ttsPromise = new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = activeLanguage === 'Spanish' ? 'es' : activeLanguage === 'French' ? 'fr' : activeLanguage === 'Italian' ? 'it' : 'en'
      utterance.rate = settings?.speechSpeed === 'slow' ? 0.8 : settings?.speechSpeed === 'fast' ? 1.2 : 1.0
      utterance.onend = () => resolve('completed')
      utterance.onerror = (e) => {
        console.warn('Browser TTS error:', e)
        resolve('error')
      }
      window.speechSynthesis.speak(utterance)
    })
    // Timeout after 15 seconds for browser TTS
    return withTimeout(ttsPromise, 15000, 'timeout')
  }

  const handleMuteToggle = async () => {
    if (isMuted) {
      // Unmute - restart streaming
      setIsMuted(false)
      if (!isStreaming && callState === 'listening') {
        await startStreaming()
      }
    } else {
      // Mute - stop streaming
      setIsMuted(true)
      if (isStreaming) {
        await stopStreaming()
        resetTranscription()
      }
    }
  }

  // Barge-in: interrupt tutor while speaking
  const handleBargeIn = async () => {
    if (callState === 'speaking') {
      // Stop TTS
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop()
        } catch (e) {}
        audioSourceRef.current = null
      }
      window.speechSynthesis.cancel() // Stop browser TTS if active

      // Switch to listening
      setTutorText('')
      resetTranscription()
      setCallState('listening')
      await startStreaming()
    }
  }

  const handleEndCall = async () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop()
      } catch (e) {}
    }
    window.speechSynthesis.cancel()
    await stopStreaming()
    onEnd()
  }

  const getStateMessage = () => {
    switch (callState) {
      case 'connecting':
        return 'Connecting...'
      case 'listening':
        return isMuted ? 'Muted' : 'Listening...'
      case 'processing':
        return 'Thinking...'
      case 'speaking':
        return 'Speaking...'
      default:
        return ''
    }
  }

  // Current text to display (live transcript or user text)
  const displayUserText = userText || transcript || ''

  return (
    <div className="tutor-voice-call">
      <div className="tutor-call-header">
        <div className="tutor-call-status">
          <span className={`tutor-call-dot ${callState}`} />
          <span className="tutor-call-state">{getStateMessage()}</span>
        </div>
        <span className="tutor-call-duration">{formatDuration(callDuration)}</span>
      </div>

      <div className="tutor-call-content">
        <div className="tutor-call-avatar" onClick={handleBargeIn}>
          <div className={`tutor-call-avatar-ring ${callState === 'speaking' ? 'speaking' : ''} ${callState === 'listening' && !isMuted ? 'listening' : ''}`}>
            <div className="tutor-call-avatar-inner">
              <VolumeIcon />
            </div>
          </div>
          <span className="tutor-call-name">{activeLanguage} Tutor</span>
          {callState === 'speaking' && (
            <span className="tutor-call-hint">Tap to interrupt</span>
          )}
        </div>

        {showTranscript && (displayUserText || tutorText) && (
          <div className="tutor-call-messages">
            {displayUserText && (
              <div className="tutor-call-bubble user">
                <p>{displayUserText}</p>
              </div>
            )}
            {tutorText && (
              <div className="tutor-call-bubble tutor">
                <p>{tutorText}</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="tutor-call-error">
            {error}
          </div>
        )}
      </div>

      <div className="tutor-call-controls">
        <button
          className={`tutor-call-btn mute ${isMuted ? 'active' : ''}`}
          onClick={handleMuteToggle}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>

        <button
          className="tutor-call-btn end"
          onClick={handleEndCall}
          title="End call"
        >
          <PhoneOffIcon />
        </button>

        <button
          className={`tutor-call-btn transcript ${showTranscript ? 'active' : ''}`}
          onClick={() => setShowTranscript(!showTranscript)}
          title={showTranscript ? 'Hide transcript' : 'Show transcript'}
        >
          <TextIcon />
        </button>
      </div>
    </div>
  )
}

export default TutorVoiceCall
