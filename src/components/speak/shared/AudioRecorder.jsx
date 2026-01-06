import React, { useRef, useEffect, useState } from 'react'
import { useAudioRecorder } from '../../../hooks/useAudioRecorder'
import { WaveformVisualizer } from './WaveformVisualizer'
import { RecordingControls } from './RecordingControls'

/**
 * Complete audio recording component with visualization and playback
 */
export function AudioRecorder({
  onRecordingComplete,
  onRecordingStart,
  maxDuration = 300,
  showPlayback = true,
  showTimer = true,
  autoSubmit = false,
  className = ''
}) {
  const {
    isRecording,
    isPaused,
    formattedTime,
    audioBlob,
    audioUrl,
    error,
    permissionStatus,
    requestPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    analyserNode
  } = useAudioRecorder({
    maxDuration,
    onRecordingComplete: (blob, url) => {
      if (autoSubmit && onRecordingComplete) {
        onRecordingComplete(blob, url)
      }
    }
  })

  const audioPlayerRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Handle permission request
  const handleStart = async () => {
    if (permissionStatus === 'denied') {
      // Show instructions to enable permission
      return
    }

    if (permissionStatus === 'prompt') {
      const granted = await requestPermission()
      if (!granted) return
    }

    if (onRecordingStart) {
      onRecordingStart()
    }

    await startRecording()
  }

  const handleStop = () => {
    stopRecording()
  }

  const handleReset = () => {
    setIsPlaying(false)
    resetRecording()
  }

  const handleSubmit = () => {
    if (onRecordingComplete && audioBlob) {
      onRecordingComplete(audioBlob, audioUrl)
    }
  }

  // Playback controls
  const togglePlayback = () => {
    if (!audioPlayerRef.current) return

    if (isPlaying) {
      audioPlayerRef.current.pause()
    } else {
      audioPlayerRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  useEffect(() => {
    const audio = audioPlayerRef.current
    if (audio) {
      const handleEnded = () => setIsPlaying(false)
      audio.addEventListener('ended', handleEnded)
      return () => audio.removeEventListener('ended', handleEnded)
    }
  }, [audioUrl])

  // Permission denied state
  if (permissionStatus === 'denied') {
    return (
      <div className={`audio-recorder audio-recorder-permission-denied ${className}`}>
        <div className="permission-denied-message">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
            <line x1="1" y1="1" x2="23" y2="23" stroke="#ef4444" />
          </svg>
          <h4>Microphone Access Required</h4>
          <p className="muted">
            Please enable microphone access in your browser settings to record audio.
          </p>
          <button className="btn btn-secondary" onClick={requestPermission}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`audio-recorder ${className}`}>
      {error && (
        <div className="audio-recorder-error">
          {error}
        </div>
      )}

      <div className="audio-recorder-main">
        {/* Waveform visualization */}
        <div className="audio-recorder-waveform">
          <WaveformVisualizer
            analyserNode={analyserNode}
            audioUrl={!isRecording ? audioUrl : null}
            isRecording={isRecording}
            height={60}
            barColor={isRecording ? '#ef4444' : '#3b82f6'}
          />
        </div>

        {/* Timer */}
        {showTimer && (
          <div className={`audio-recorder-timer ${isRecording ? 'recording' : ''}`}>
            {isRecording && (
              <span className="recording-indicator">
                <span className="recording-dot"></span>
                REC
              </span>
            )}
            <span className="timer-display">{formattedTime}</span>
            {isRecording && maxDuration && (
              <span className="timer-max">/ {Math.floor(maxDuration / 60)}:{(maxDuration % 60).toString().padStart(2, '0')}</span>
            )}
          </div>
        )}

        {/* Recording controls */}
        <RecordingControls
          isRecording={isRecording}
          isPaused={isPaused}
          hasRecording={!!audioBlob}
          onStart={handleStart}
          onStop={handleStop}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onReset={handleReset}
          showPauseResume={false}
        />

        {/* Playback controls (after recording) */}
        {showPlayback && audioUrl && !isRecording && (
          <div className="audio-recorder-playback">
            <audio ref={audioPlayerRef} src={audioUrl} />
            <button
              className="btn-playback"
              onClick={togglePlayback}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <span className="playback-label">
              {isPlaying ? 'Playing...' : 'Play recording'}
            </span>
          </div>
        )}

        {/* Submit button (if not auto-submit) */}
        {!autoSubmit && audioBlob && !isRecording && onRecordingComplete && (
          <div className="audio-recorder-actions">
            <button className="btn btn-primary" onClick={handleSubmit}>
              Use This Recording
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AudioRecorder
