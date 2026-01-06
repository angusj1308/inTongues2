import React from 'react'

/**
 * Recording control buttons with consistent styling
 */
export function RecordingControls({
  isRecording,
  isPaused,
  hasRecording,
  onStart,
  onStop,
  onPause,
  onResume,
  onReset,
  onRetry,
  disabled = false,
  showPauseResume = true,
  className = ''
}) {
  return (
    <div className={`recording-controls ${className}`}>
      {!isRecording && !hasRecording && (
        <button
          className="btn-record btn-record-start"
          onClick={onStart}
          disabled={disabled}
          title="Start recording"
        >
          <span className="record-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </span>
          <span>Record</span>
        </button>
      )}

      {isRecording && (
        <>
          {showPauseResume && (
            <button
              className="btn-record btn-record-pause"
              onClick={isPaused ? onResume : onPause}
              disabled={disabled}
              title={isPaused ? 'Resume recording' : 'Pause recording'}
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
            </button>
          )}

          <button
            className="btn-record btn-record-stop"
            onClick={onStop}
            disabled={disabled}
            title="Stop recording"
          >
            <span className="stop-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </span>
            <span>Stop</span>
          </button>
        </>
      )}

      {!isRecording && hasRecording && (
        <>
          <button
            className="btn-record btn-record-retry"
            onClick={onRetry || onReset}
            disabled={disabled}
            title="Record again"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            <span>Retry</span>
          </button>

          <button
            className="btn-record btn-record-start"
            onClick={onStart}
            disabled={disabled}
            title="Record new"
          >
            <span className="record-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="6" />
              </svg>
            </span>
            <span>New</span>
          </button>
        </>
      )}
    </div>
  )
}

export default RecordingControls
