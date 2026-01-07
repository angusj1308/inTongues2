import { useState, useEffect, useRef, useCallback } from 'react'
import useAudioRecorder from '../../hooks/useAudioRecorder'

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
)

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
)

const WaveformVisualizer = ({ analyserNode, isRecording }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !analyserNode || !isRecording) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const bufferLength = analyserNode.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyserNode.getByteFrequencyData(dataArray)

      ctx.fillStyle = 'transparent'
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = 3
      const gap = 2
      const barCount = Math.floor(canvas.width / (barWidth + gap))
      const step = Math.floor(bufferLength / barCount)

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step]
        const barHeight = (value / 255) * canvas.height * 0.8
        const x = i * (barWidth + gap)
        const y = (canvas.height - barHeight) / 2

        ctx.fillStyle = '#10a37f'
        ctx.fillRect(x, y, barWidth, barHeight)
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [analyserNode, isRecording])

  return (
    <canvas
      ref={canvasRef}
      className="tutor-voice-waveform"
      width={200}
      height={40}
    />
  )
}

const TutorVoiceInput = ({ onSend, onCancel, disabled, activeLanguage }) => {
  const {
    isRecording,
    isPaused,
    recordingTime,
    formattedTime,
    audioBlob,
    audioUrl,
    analyserNode,
    permissionState,
    requestPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
  } = useAudioRecorder({ maxDuration: 120 }) // 2 minute max

  const [isPlaying, setIsPlaying] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const audioRef = useRef(null)
  const resetRecordingRef = useRef(resetRecording)
  const stopRecordingRef = useRef(stopRecording)

  // Keep refs updated
  useEffect(() => {
    resetRecordingRef.current = resetRecording
    stopRecordingRef.current = stopRecording
  }, [resetRecording, stopRecording])

  // Auto-start recording when component mounts
  useEffect(() => {
    let isMounted = true

    const initRecording = async () => {
      if (permissionState === 'prompt') {
        await requestPermission()
      }
      if (isMounted && permissionState !== 'denied') {
        startRecording()
      }
    }
    initRecording()

    // Cleanup when component unmounts - ensure all recording stops
    return () => {
      isMounted = false
      // Stop any active recording and clean up resources
      stopRecordingRef.current()
      resetRecordingRef.current()
    }
  }, [])

  const handleStop = useCallback(() => {
    stopRecording()
  }, [stopRecording])

  const handleSend = useCallback(async () => {
    if (!audioBlob) return

    setTranscribing(true)
    try {
      // Transcribe audio
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('language', activeLanguage || 'en')

      const response = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        onSend(data.text, audioBlob, audioUrl)
      } else {
        // Fallback: send without transcription
        console.error('Transcription failed, sending audio only')
        onSend('[Audio message]', audioBlob, audioUrl)
      }
    } catch (err) {
      console.error('Failed to transcribe:', err)
      onSend('[Audio message]', audioBlob, audioUrl)
    } finally {
      setTranscribing(false)
    }
  }, [audioBlob, audioUrl, activeLanguage, onSend])

  const handleDiscard = useCallback(() => {
    resetRecording()
    onCancel()
  }, [resetRecording, onCancel])

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onended = () => setIsPlaying(false)
    }
  }, [audioUrl])

  if (permissionState === 'denied') {
    return (
      <div className="tutor-voice-input tutor-voice-denied">
        <p>Microphone access denied</p>
        <p className="muted small">Please enable microphone access in your browser settings</p>
        <button className="button ghost small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="tutor-voice-input">
      {isRecording ? (
        // Recording state
        <div className="tutor-voice-recording">
          <div className="tutor-voice-indicator">
            <span className="tutor-voice-dot recording" />
            <span className="tutor-voice-time">{formattedTime}</span>
          </div>
          <WaveformVisualizer analyserNode={analyserNode} isRecording={isRecording} />
          <div className="tutor-voice-actions">
            <button
              className="tutor-voice-btn stop"
              onClick={handleStop}
              title="Stop recording"
            >
              <StopIcon />
            </button>
          </div>
        </div>
      ) : audioBlob ? (
        // Review state
        <div className="tutor-voice-review">
          <audio ref={audioRef} src={audioUrl} />
          <button
            className="tutor-voice-btn play"
            onClick={togglePlayback}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <span className="tutor-voice-time">{formattedTime}</span>
          <div className="tutor-voice-review-actions">
            <button
              className="tutor-voice-btn discard"
              onClick={handleDiscard}
              title="Discard"
              disabled={transcribing}
            >
              <TrashIcon />
            </button>
            <button
              className="tutor-voice-btn send"
              onClick={handleSend}
              title="Send"
              disabled={transcribing}
            >
              {transcribing ? (
                <span className="tutor-voice-sending">...</span>
              ) : (
                <SendIcon />
              )}
            </button>
          </div>
        </div>
      ) : (
        // Initializing
        <div className="tutor-voice-init">
          <span className="tutor-voice-dot" />
          <span>Starting microphone...</span>
        </div>
      )}
    </div>
  )
}

export default TutorVoiceInput
