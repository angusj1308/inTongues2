import { useState, useEffect, useRef, useCallback } from 'react'
import useRealtimeTranscription from '../../hooks/useRealtimeTranscription'

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

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const WaveformVisualizer = ({ analyserNode, isActive }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !analyserNode || !isActive) return

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
  }, [analyserNode, isActive])

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
  const [recordingTime, setRecordingTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [reviewData, setReviewData] = useState(null) // { text, audioBlob, audioUrl }

  const audioRef = useRef(null)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  const {
    isConnected,
    isStreaming,
    transcript,
    finalTranscript,
    error,
    analyserNode,
    startStreaming,
    stopStreaming,
    reset
  } = useRealtimeTranscription({
    language: activeLanguage || 'en',
    onTranscription: (text) => {
      console.log('Live transcription:', text)
    },
    onFinalTranscription: (text) => {
      console.log('Final transcription:', text)
    },
    onError: (err) => {
      console.error('Transcription error:', err)
    }
  })

  // Auto-start streaming when component mounts
  useEffect(() => {
    startStreaming()

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // Start timer when streaming begins
  useEffect(() => {
    if (isStreaming && !timerRef.current) {
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setRecordingTime(elapsed)
      }, 100)
    } else if (!isStreaming && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [isStreaming])

  // Format time as MM:SS
  const formattedTime = useCallback(() => {
    const minutes = Math.floor(recordingTime / 60)
    const seconds = recordingTime % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [recordingTime])

  const handleStop = useCallback(async () => {
    const result = await stopStreaming()
    setReviewData({
      text: result.text || '',
      audioBlob: result.audioBlob,
      audioUrl: result.audioUrl
    })
    setEditedText(result.text || '')
  }, [stopStreaming])

  const handleSend = useCallback(async () => {
    if (!reviewData) return

    setIsSending(true)
    try {
      // Upload audio to Firebase Storage for persistent URL
      let persistentAudioUrl = reviewData.audioUrl
      if (reviewData.audioBlob) {
        const uploadFormData = new FormData()
        uploadFormData.append('audio', reviewData.audioBlob, 'recording.webm')
        uploadFormData.append('userId', 'tutor-voice')
        uploadFormData.append('language', activeLanguage || 'en')

        try {
          const uploadResponse = await fetch('/api/speech/upload', {
            method: 'POST',
            body: uploadFormData,
          })
          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json()
            persistentAudioUrl = uploadData.audioUrl
            console.log('Audio uploaded:', persistentAudioUrl)
          }
        } catch (uploadErr) {
          console.error('Failed to upload audio:', uploadErr)
        }
      }

      // Use edited text if user modified it, otherwise use transcription
      const textToSend = isEditing ? editedText : (reviewData.text || '[Audio message]')
      onSend(textToSend, reviewData.audioBlob, persistentAudioUrl)
    } catch (err) {
      console.error('Failed to send:', err)
      onSend('[Audio message]', reviewData.audioBlob, reviewData.audioUrl)
    } finally {
      setIsSending(false)
    }
  }, [reviewData, editedText, isEditing, activeLanguage, onSend])

  const handleDiscard = useCallback(() => {
    reset()
    setReviewData(null)
    setEditedText('')
    setIsEditing(false)
    onCancel()
  }, [reset, onCancel])

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
  }, [reviewData?.audioUrl])

  // Display current transcription
  const displayText = transcript || finalTranscript || ''

  if (error) {
    return (
      <div className="tutor-voice-input tutor-voice-denied">
        <p>Microphone error</p>
        <p className="muted small">{error}</p>
        <button className="button ghost small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    )
  }

  // Review state - after stopping
  if (reviewData) {
    return (
      <div className="tutor-voice-input">
        <div className="tutor-voice-review">
          {reviewData.audioUrl && (
            <>
              <audio ref={audioRef} src={reviewData.audioUrl} />
              <button
                className="tutor-voice-btn play"
                onClick={togglePlayback}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
            </>
          )}
          <span className="tutor-voice-time">{formattedTime()}</span>
          <div className="tutor-voice-review-actions">
            <button
              className="tutor-voice-btn discard"
              onClick={handleDiscard}
              title="Discard"
              disabled={isSending}
            >
              <TrashIcon />
            </button>
            <button
              className="tutor-voice-btn send"
              onClick={handleSend}
              title="Send"
              disabled={isSending}
            >
              {isSending ? (
                <span className="tutor-voice-sending">...</span>
              ) : (
                <SendIcon />
              )}
            </button>
          </div>
        </div>

        {/* Transcription preview/edit */}
        <div className="tutor-voice-transcript">
          {isEditing ? (
            <textarea
              className="tutor-voice-transcript-edit"
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              placeholder="Edit transcription..."
              rows={2}
            />
          ) : (
            <div className="tutor-voice-transcript-preview">
              <span className="tutor-voice-transcript-text">
                {reviewData.text || 'No transcription available'}
              </span>
              <button
                className="tutor-voice-transcript-edit-btn"
                onClick={() => setIsEditing(true)}
                title="Edit transcription"
              >
                <EditIcon />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Recording state - streaming
  if (isStreaming) {
    return (
      <div className="tutor-voice-input">
        <div className="tutor-voice-recording">
          <div className="tutor-voice-indicator">
            <span className="tutor-voice-dot recording" />
            <span className="tutor-voice-time">{formattedTime()}</span>
          </div>
          <WaveformVisualizer analyserNode={analyserNode} isActive={isStreaming} />
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

        {/* Live transcription preview */}
        {displayText && (
          <div className="tutor-voice-live-transcript">
            <span className="tutor-voice-live-label">Live:</span>
            <span className="tutor-voice-live-text">{displayText}</span>
          </div>
        )}
      </div>
    )
  }

  // Initializing state
  return (
    <div className="tutor-voice-input">
      <div className="tutor-voice-init">
        <span className="tutor-voice-dot" />
        <span>{isConnected ? 'Starting microphone...' : 'Connecting...'}</span>
      </div>
    </div>
  )
}

export default TutorVoiceInput
