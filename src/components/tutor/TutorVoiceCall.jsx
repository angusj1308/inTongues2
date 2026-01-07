import { useState, useEffect, useRef, useCallback } from 'react'
import useAudioRecorder from '../../hooks/useAudioRecorder'

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

const VOICE_IDS = {
  English: { male: 'NFG5qt843uXKj4pFvR7C', female: 'ZF6FPAbjXT4488VcRRnw' },
  Spanish: { male: 'kulszILr6ees0ArU8miO', female: '1WXz8v08ntDcSTeVXMN2' },
  French: { male: 'UBXZKOKbt62aLQHhc1Jm', female: 'sANWqF1bCMzR6eyZbCGw' },
  Italian: { male: 'W71zT1VwIFFx3mMGH2uZ', female: 'gfKKsLN1k0oYYN9n2dXX' },
}

const TutorVoiceCall = ({
  onEnd,
  onMessage,
  activeLanguage,
  nativeLanguage,
  tutorProfile,
  settings,
  conversationHistory,
}) => {
  const [callState, setCallState] = useState('connecting') // connecting, listening, processing, speaking
  const [isMuted, setIsMuted] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [tutorText, setTutorText] = useState('')
  const [error, setError] = useState(null)
  const [callDuration, setCallDuration] = useState(0)

  const {
    isRecording,
    audioBlob,
    analyserNode,
    permissionState,
    requestPermission,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder({ maxDuration: 30 }) // 30 seconds per turn

  const audioContextRef = useRef(null)
  const silenceTimeoutRef = useRef(null)
  const callTimerRef = useRef(null)

  // Format call duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Initialize call
  useEffect(() => {
    const initCall = async () => {
      try {
        if (permissionState === 'prompt') {
          await requestPermission()
        }
        if (permissionState === 'denied') {
          setError('Microphone access required for voice call')
          return
        }

        // Start call timer
        callTimerRef.current = setInterval(() => {
          setCallDuration((d) => d + 1)
        }, 1000)

        setCallState('listening')
        startRecording()
      } catch (err) {
        console.error('Failed to start call:', err)
        setError('Failed to start call')
      }
    }

    initCall()

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [])

  // Detect silence to auto-stop recording
  useEffect(() => {
    if (!analyserNode || !isRecording || isMuted) return

    const checkSilence = () => {
      const dataArray = new Uint8Array(analyserNode.frequencyBinCount)
      analyserNode.getByteFrequencyData(dataArray)

      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      // If very quiet for a while, stop recording
      if (average < 5) {
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(() => {
            if (isRecording) {
              stopRecording()
            }
          }, 2000) // 2 seconds of silence
        }
      } else {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = null
        }
      }
    }

    const interval = setInterval(checkSilence, 200)
    return () => clearInterval(interval)
  }, [analyserNode, isRecording, isMuted, stopRecording])

  // Process recorded audio when stopped
  useEffect(() => {
    if (!audioBlob || callState !== 'listening') return

    const processAudio = async () => {
      setCallState('processing')

      try {
        // Transcribe audio
        const formData = new FormData()
        formData.append('audio', audioBlob, 'recording.webm')
        formData.append('language', activeLanguage || 'en')

        const transcribeRes = await fetch('/api/speech/transcribe', {
          method: 'POST',
          body: formData,
        })

        if (!transcribeRes.ok) throw new Error('Transcription failed')

        const { text } = await transcribeRes.json()
        setTranscript(text)

        if (!text.trim()) {
          // No speech detected, go back to listening
          resetRecording()
          setCallState('listening')
          startRecording()
          return
        }

        // Add user message to history
        onMessage({ role: 'user', content: text })

        // Get tutor response
        const tutorRes = await fetch('/api/tutor/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            targetLanguage: activeLanguage,
            sourceLanguage: nativeLanguage || 'English',
            conversationHistory: [...conversationHistory, { role: 'user', content: text }],
            memory: tutorProfile?.memory,
            voiceCall: true,
            settings: {
              correctionsEnabled: settings?.correctionsEnabled,
              languageLevel: settings?.languageLevel,
              responseStyle: settings?.responseStyle,
              responseLength: 'short', // Keep responses short for voice
              focusAreas: settings?.focusAreas,
            },
          }),
        })

        if (!tutorRes.ok) throw new Error('Failed to get tutor response')

        const { response: tutorResponse } = await tutorRes.json()
        setTutorText(tutorResponse)

        // Add tutor message to history
        onMessage({ role: 'tutor', content: tutorResponse })

        // Speak the response
        setCallState('speaking')
        await speakText(tutorResponse)

        // Go back to listening
        resetRecording()
        setTranscript('')
        setTutorText('')
        setCallState('listening')
        startRecording()

      } catch (err) {
        console.error('Voice call error:', err)
        setError('Something went wrong. Trying again...')

        // Try to recover
        setTimeout(() => {
          setError(null)
          resetRecording()
          setCallState('listening')
          startRecording()
        }, 2000)
      }
    }

    processAudio()
  }, [audioBlob])

  // Text-to-speech using ElevenLabs
  const speakText = async (text) => {
    try {
      const voiceId = VOICE_IDS[activeLanguage]?.female || VOICE_IDS.English.female

      const response = await fetch('/api/tts/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId,
          speed: settings?.speechSpeed === 'slow' ? 0.8 : settings?.speechSpeed === 'fast' ? 1.2 : 1.0,
        }),
      })

      if (!response.ok) {
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = activeLanguage === 'Spanish' ? 'es' : activeLanguage === 'French' ? 'fr' : activeLanguage === 'Italian' ? 'it' : 'en'
        window.speechSynthesis.speak(utterance)

        return new Promise((resolve) => {
          utterance.onend = resolve
        })
      }

      const audioData = await response.arrayBuffer()
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContext.decodeAudioData(audioData)

      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start()

      return new Promise((resolve) => {
        source.onended = resolve
      })
    } catch (err) {
      console.error('TTS error:', err)
      // Fallback to browser TTS
      const utterance = new SpeechSynthesisUtterance(text)
      window.speechSynthesis.speak(utterance)

      return new Promise((resolve) => {
        utterance.onend = resolve
      })
    }
  }

  const handleMuteToggle = () => {
    setIsMuted(!isMuted)
    if (isRecording && !isMuted) {
      stopRecording()
    } else if (!isRecording && isMuted) {
      resetRecording()
      startRecording()
    }
  }

  const handleEndCall = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }
    stopRecording()
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
        <div className="tutor-call-avatar">
          <div className={`tutor-call-avatar-ring ${callState === 'speaking' ? 'speaking' : ''}`}>
            <div className="tutor-call-avatar-inner">
              <VolumeIcon />
            </div>
          </div>
          <span className="tutor-call-name">{activeLanguage} Tutor</span>
        </div>

        {transcript && (
          <div className="tutor-call-transcript">
            <span className="tutor-call-label">You said:</span>
            <p>{transcript}</p>
          </div>
        )}

        {tutorText && (
          <div className="tutor-call-response">
            <span className="tutor-call-label">Tutor:</span>
            <p>{tutorText}</p>
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
      </div>
    </div>
  )
}

export default TutorVoiceCall
