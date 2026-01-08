import React, { useRef, useState, useEffect } from 'react'
import { WaveformVisualizer } from '../shared/WaveformVisualizer'

/**
 * Floating recording card overlay with start/stop/submit controls
 * Appears on top of blurred transcript document
 */
export function FloatingRecordingCard({
  isRecording,
  isPaused,
  recordingTime,
  analyserNode,
  onStart,
  onStop,
  onPause,
  onResume,
  onSubmit,
  onCancel,
  hasRecording,
  permissionStatus,
  error
}) {
  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Permission denied state
  if (permissionStatus === 'denied') {
    return (
      <div className="floating-recording-card">
        <div className="floating-recording-permission-denied">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
            <line x1="1" y1="1" x2="23" y2="23" stroke="#ef4444" />
          </svg>
          <h4>Microphone Access Required</h4>
          <p className="muted">
            Please enable microphone access in your browser settings.
          </p>
          <button className="btn btn-secondary" onClick={onStart}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="floating-recording-card">
      {error && (
        <div className="floating-recording-error">
          {error}
        </div>
      )}

      {/* Waveform visualization */}
      <div className="floating-recording-waveform">
        <WaveformVisualizer
          analyserNode={analyserNode}
          isRecording={isRecording && !isPaused}
          height={80}
          barColor={isRecording ? '#ef4444' : '#64748b'}
        />
      </div>

      {/* Timer display */}
      <div className={`floating-recording-timer ${isRecording ? 'recording' : ''}`}>
        {isRecording && !isPaused && (
          <span className="recording-indicator">
            <span className="recording-dot"></span>
          </span>
        )}
        <span className="timer-display">{formatTime(recordingTime)}</span>
      </div>

      {/* Controls */}
      <div className="floating-recording-controls">
        {!isRecording && !hasRecording ? (
          // Initial state - show record button
          <button
            className="floating-btn floating-btn-record"
            onClick={onStart}
            title="Start recording"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            <span>Start Recording</span>
          </button>
        ) : isRecording ? (
          // Recording state - show pause and stop
          <>
            <button
              className="floating-btn floating-btn-secondary"
              onClick={isPaused ? onResume : onPause}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              )}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>
            <button
              className="floating-btn floating-btn-stop"
              onClick={onStop}
              title="Stop recording"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span>Stop</span>
            </button>
          </>
        ) : hasRecording ? (
          // Has recording - show retry and submit
          <>
            <button
              className="floating-btn floating-btn-secondary"
              onClick={onCancel}
              title="Record again"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>Record Again</span>
            </button>
            <button
              className="floating-btn floating-btn-submit"
              onClick={onSubmit}
              title="Get feedback"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Get Feedback</span>
            </button>
          </>
        ) : null}
      </div>

      {/* Tip text */}
      <p className="floating-recording-tip">
        {!isRecording && !hasRecording
          ? 'Speak freely about any topic in your target language'
          : isRecording
          ? 'Your speech is being transcribed in real-time'
          : 'Review your transcript below, then get feedback'}
      </p>
    </div>
  )
}

export default FloatingRecordingCard
