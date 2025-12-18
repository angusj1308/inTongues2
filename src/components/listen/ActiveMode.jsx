import React, { useEffect, useRef, useState } from 'react'
import ActiveStepGate from './ActiveStepGate'
import ActiveTranscript from './ActiveTranscript'
import ChunkTimeline from './ChunkTimeline'

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const floored = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(floored / 60)
  const secs = floored % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const Icon = ({ name, filled = false, className = '' }) => (
  <span
    className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`.trim()}
    aria-hidden="true"
  >
    {name}
  </span>
)

const PlayPauseIcon = ({ isPlaying }) =>
  isPlaying ? (
    <svg className="playpause-icon" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <rect x="9" y="8" width="6" height="20" rx="2" />
      <rect x="21" y="8" width="6" height="20" rx="2" />
    </svg>
  ) : (
    <svg className="playpause-icon" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <path d="M11 7.5v21l16-10.5z" />
    </svg>
  )

const TimerIcon = ({ className = '' }) => (
  <svg
    className={`secondary-icon ${className}`.trim()}
    viewBox="0 0 28 28"
    aria-hidden="true"
    focusable="false"
  >
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="14" cy="15" r="8" />
      <path d="M14 11v4.5l3 2.2" />
      <path d="M10.5 6h7" />
      <path d="M12.2 4h3.6" />
    </g>
  </svg>
)

const speedPresets = [0.75, 0.9, 1, 1.25, 1.5, 2]

const formatRate = (rate) => {
  if (!Number.isFinite(rate)) return '1.0'
  return Number.isInteger(rate) ? `${rate.toFixed(1)}` : `${rate}`
}

const ScrubIcon = ({ direction = 'back', seconds }) => {
  const isBack = direction === 'back'
  const mirrorBack = isBack ? 'translate(36 0) scale(-1 1)' : undefined

  const arrowHeadPath = 'M 22 6 L 16 4 L 16 8 Z'

  return (
    <svg
      className="scrub-svg"
      viewBox="-2 -2 40 40"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <g transform={mirrorBack}>
        <circle className="scrub-arc" cx="18" cy="18" r="12" />
        <path className="scrub-arrowhead" d={arrowHeadPath} />
      </g>
      <text className="scrub-text" x="18" y="19" textAnchor="middle" dominantBaseline="middle">
        {seconds}
      </text>
    </svg>
  )
}

const ActiveMode = ({
  storyMeta,
  chunks = [],
  activeChunkIndex = 0,
  completedChunks = new Set(),
  activeStep = 1,
  isPlaying = false,
  playbackPositionSeconds = 0,
  playbackDurationSeconds = 0,
  scrubSeconds = 10,
  onPlayPause,
  onSeek,
  playbackRate,
  onPlaybackRateChange,
  subtitlesEnabled,
  onToggleSubtitles,
  transcriptSegments = [],
  activeTranscriptIndex = -1,
  onBeginFinalListen,
  onRestartChunk,
  onSelectChunk,
  onScrubChange,
}) => {
  const rewindButtonRef = useRef(null)
  const scrubMenuRef = useRef(null)
  const longPressTimeoutRef = useRef(null)
  const longPressTriggeredRef = useRef(false)
  const [scrubMenuOpen, setScrubMenuOpen] = useState(false)
  const speedButtonRef = useRef(null)
  const speedMenuRef = useRef(null)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)

  const currentChunk = chunks[activeChunkIndex]
  const chunkStart = currentChunk?.start ?? 0
  const chunkEnd = currentChunk?.end ?? playbackDurationSeconds
  const chunkDuration = Math.max(0, chunkEnd - chunkStart)

  const stepAllowsTranscript = activeStep === 2 || activeStep === 3
  const allowEditing = activeStep === 3
  const showWordStatus = activeStep === 2 || activeStep === 3

  const clampedPosition = Math.min(Math.max(playbackPositionSeconds, chunkStart), chunkEnd)
  const chunkProgress = chunkDuration
    ? Math.min(100, ((clampedPosition - chunkStart) / chunkDuration) * 100)
    : 0
  const progressPercent = chunkProgress

  const filteredSegments = transcriptSegments.filter((segment) => {
    if (typeof segment.start !== 'number' || typeof segment.end !== 'number') return true
    return segment.start >= chunkStart && segment.start < chunkEnd
  })

  const isChunkLocked = (index) => index > activeChunkIndex
  const handleSelectChunk = (index) => {
    if (typeof onSelectChunk === 'function') {
      onSelectChunk(index)
    }
  }

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const handleSeek = (nextTime) => {
    if (!onSeek) return
    const boundedTime = Math.min(chunkEnd, Math.max(chunkStart, nextTime))
    onSeek(boundedTime)
  }

  const handleStart = () => {
    if (onRestartChunk) {
      onRestartChunk()
      return
    }
    handleSeek(chunkStart)
  }

  const handleBack = () => handleSeek(clampedPosition - scrubSeconds)

  const handleForward = () => handleSeek(clampedPosition + scrubSeconds)

  const handleSkipToEnd = () => handleSeek(chunkEnd)

  const handlePlaybackRateChange = (nextRate) => {
    if (!onPlaybackRateChange) return
    onPlaybackRateChange(nextRate)
    setSpeedMenuOpen(false)
  }

  const handleRewindPressStart = () => {
    longPressTriggeredRef.current = false
    longPressTimeoutRef.current = setTimeout(() => {
      setScrubMenuOpen(true)
      longPressTriggeredRef.current = true
    }, 650)
  }

  const handleRewindPressEnd = () => {
    clearLongPress()
  }

  const handleRewindClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    handleBack()
  }

  const handleRewindContextMenu = (event) => {
    event.preventDefault()
    setScrubMenuOpen((prev) => !prev)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      const scrubTarget =
        scrubMenuRef.current?.contains(event.target) || rewindButtonRef.current?.contains(event.target)
      const speedTarget =
        speedMenuRef.current?.contains(event.target) || speedButtonRef.current?.contains(event.target)

      if (!scrubTarget) setScrubMenuOpen(false)
      if (!speedTarget) setSpeedMenuOpen(false)
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  useEffect(() => () => clearLongPress(), [])

  const renderTransportButtons = () => (
    <div className="transport-row" role="group" aria-label="Playback controls">
      <div className="transport-row-icons">
        <button
          type="button"
          className="transport-icon"
          onClick={handleStart}
          aria-label="Start from beginning"
          title="Start from beginning"
        >
          <Icon name="skip_previous" className="skip-icon" />
        </button>
        <div className="icon-btn-popover-wrap">
          <button
            ref={rewindButtonRef}
            type="button"
            className="transport-icon"
            onClick={handleRewindClick}
            onContextMenu={handleRewindContextMenu}
            onPointerDown={handleRewindPressStart}
            onPointerUp={handleRewindPressEnd}
            onPointerLeave={handleRewindPressEnd}
            aria-label={`Rewind ${scrubSeconds} seconds`}
            title="Long-press or right-click to change interval"
          >
            <ScrubIcon direction="back" seconds={scrubSeconds} />
          </button>
          {scrubMenuOpen && (
            <div ref={scrubMenuRef} className="scrub-popover" role="dialog" aria-label="Rewind interval">
              <p className="scrub-popover-title">Rewind interval</p>
              <div className="scrub-popover-options" role="group" aria-label="Choose rewind interval">
                {[5, 10, 15, 30].map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    className={`scrub-popover-chip ${seconds === scrubSeconds ? 'active' : ''}`}
                    onClick={() => {
                      onScrubChange?.(seconds)
                      setScrubMenuOpen(false)
                    }}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`transport-primary ${isPlaying ? 'is-playing' : ''}`}
          onClick={onPlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <PlayPauseIcon isPlaying={isPlaying} />
        </button>
        <button
          type="button"
          className="transport-icon"
          onClick={handleForward}
          aria-label={`Forward ${scrubSeconds} seconds`}
          title={`Forward ${scrubSeconds} seconds`}
        >
          <ScrubIcon direction="forward" seconds={scrubSeconds} />
        </button>
        <button
          type="button"
          className="transport-icon"
          onClick={handleSkipToEnd}
          aria-label="Skip to end"
          title="Skip to end"
        >
          <Icon name="skip_next" className="skip-icon" />
        </button>
      </div>
    </div>
  )

  const renderProgressBar = () => (
    <div className="progress-shell audible-progress-shell">
      <input
        className="audible-progress"
        type="range"
        min={chunkStart}
        max={chunkEnd || 0}
        step="0.1"
        value={clampedPosition}
        onChange={(event) => handleSeek(Number(event.target.value))}
        aria-label="Playback position"
        style={{ '--progress': `${progressPercent}%` }}
      />
      <div className="progress-times ui-text">
        <span className="muted tiny">{formatTime(clampedPosition)}</span>
        <span className="muted tiny">{chunkEnd ? formatTime(chunkEnd) : '0:00'}</span>
      </div>
    </div>
  )

  return (
    <div className="active-layout">
      <aside className="active-col active-col--left">
        <ChunkTimeline
          chunks={chunks}
          activeIndex={activeChunkIndex}
          completedSet={completedChunks}
          onSelectChunk={handleSelectChunk}
          isChunkLocked={isChunkLocked}
        />
      </aside>

      <section className="active-col active-col--center">
        <div className="active-surface">
          <ActiveStepGate step={activeStep} />

          <div className="active-meta-row">
            <div className="active-meta">Chunk {String((currentChunk?.index || 0) + 1).padStart(2, '0')}</div>
            <div className="active-range">
              {formatTime(chunkStart)} → {formatTime(chunkEnd)}
            </div>
            <div className="muted tiny">{storyMeta.title || 'Audiobook'}</div>
          </div>

          <div className="pass-inline-rail" aria-label="Passes">
            <div className="pass-inline-heading">Passes</div>
            <ol className="pass-inline-list">
              {[1, 2, 3, 4].map((step) => {
                const isCurrent = step === activeStep
                const isCompleted = step < activeStep
                const isUpcoming = step > activeStep

                return (
                  <li
                    key={step}
                    className={`pass-inline-item ${isCurrent ? 'current' : ''} ${
                      isCompleted ? 'completed' : ''
                    } ${isUpcoming ? 'upcoming' : ''}`}
                  >
                    {isCompleted ? (
                      <span className="pass-inline-icon" aria-hidden="true">
                        ✓
                      </span>
                    ) : (
                      <span className="pass-inline-icon" aria-hidden="true" />
                    )}
                    <span className="pass-inline-label">
                      {step}.{' '}
                      {step === 1 || step === 4
                        ? 'Listen'
                        : step === 2
                        ? 'Listen + Read'
                        : 'Read'}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="active-step-panel">
            {stepAllowsTranscript ? (
              <ActiveTranscript
                segments={filteredSegments}
                activeSegmentIndex={activeTranscriptIndex}
                showWordStatus={showWordStatus}
                allowEditing={allowEditing}
              />
            ) : null}

            {activeStep === 3 && (
              <div className="active-cta">
                <button type="button" className="button" onClick={onBeginFinalListen}>
                  Begin final listen
                </button>
              </div>
            )}
          </div>

          <div className="active-progress-indicator">
            <div className="active-progress-bar">
              <div className="active-progress-fill" style={{ width: `${chunkProgress}%` }} />
            </div>
          </div>

          <div className="player-surface active-player-surface">
            {renderProgressBar()}
            <div className="player-transport-shell">{renderTransportButtons()}</div>
            <div className="player-secondary-row secondary-controls" role="group" aria-label="Secondary controls">
              <span className="secondary-spacer" aria-hidden />
              <div className="secondary-btn-popover-wrap">
                <button
                  ref={speedButtonRef}
                  type="button"
                  className={`secondary-btn ${playbackRate && playbackRate !== 1 ? 'active' : ''}`}
                  onClick={() => setSpeedMenuOpen((prev) => !prev)}
                  aria-label={`Playback speed ${playbackRate || 1}x`}
                  title="Change playback speed"
                >
                  <span className="secondary-glyph">
                    <span className="secondary-speed-icon">x{formatRate(playbackRate || 1)}</span>
                  </span>
                  <span className="secondary-label">Speed</span>
                </button>
                {speedMenuOpen ? (
                  <div ref={speedMenuRef} className="scrub-popover speed-popover" role="dialog" aria-label="Playback speed">
                    <div className="speed-popover-options" role="group" aria-label="Choose playback speed">
                      {speedPresets.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          className={`speed-option ${rate === playbackRate ? 'active' : ''}`}
                          onClick={() => handlePlaybackRateChange(rate)}
                        >
                          <span className="speed-option-indicator" aria-hidden="true" />
                          <span className="speed-option-label">x{formatRate(rate)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="secondary-btn"
                aria-label="Sleep timer"
                title="Sleep timer (coming soon)"
              >
                <span className="secondary-glyph">
                  <TimerIcon />
                </span>
                <span className="secondary-label">Timer</span>
              </button>
              <button
                type="button"
                className={`secondary-btn ${subtitlesEnabled ? 'active' : ''}`}
                onClick={onToggleSubtitles}
                aria-label={subtitlesEnabled ? 'Hide transcript' : 'Show transcript'}
                title="Toggle transcript"
              >
                <span className="secondary-glyph">
                  <Icon name="subtitles" className="secondary-icon" filled={subtitlesEnabled} />
                </span>
                <span className="secondary-label">Transcript</span>
              </button>
              <span className="secondary-spacer" aria-hidden />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ActiveMode
