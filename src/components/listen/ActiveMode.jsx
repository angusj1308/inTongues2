import React, { useEffect, useRef, useState } from 'react'
import ActiveTranscript from './ActiveTranscript'
import ChunkTimeline from './ChunkTimeline'

const PASS_LABELS = {
  1: 'Listen',
  2: 'Listen + Read',
  3: 'Read + Adjust',
  4: 'Final Listen',
}

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
  transcriptSegments = [],
  activeTranscriptIndex = -1,
  onBeginFinalListen,
  onRestartChunk,
  onSelectChunk,
  onSelectStep,
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
  const [showChunkList, setShowChunkList] = useState(false)

  const currentChunk = chunks[activeChunkIndex]
  const chunkStart = currentChunk?.start ?? 0
  const chunkEnd = currentChunk?.end ?? playbackDurationSeconds
  const chunkDuration = Math.max(0, chunkEnd - chunkStart)

  const showTranscript = activeStep === 2 || activeStep === 3
  const allowEditing = activeStep === 3
  const showWordStatus = activeStep === 3

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
    setShowChunkList(false)
  }

  const handleSelectStep = (step) => {
    if (typeof onSelectStep === 'function') {
      onSelectStep(step)
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

  useEffect(() => {
    if (!showChunkList) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowChunkList(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showChunkList])

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

  const passLabel = PASS_LABELS[activeStep] || PASS_LABELS[1]
  const chunkLabel = String((currentChunk?.index || 0) + 1).padStart(2, '0')

  if (activeStep === 1) {
    return (
      <>
        <div className="extensive-shell">
          <div className="extensive-shell-inner">
            <div className="extensive-pane extensive-pane-left">
              <div className="extensive-player-shell">
                <div className="player-stack">
                  <div className="player-visual-stage">
                    <div className="player-cover" aria-hidden>
                      <div className="player-cover-art">{storyMeta.title?.slice(0, 1) || 'A'}</div>
                    </div>
                  </div>
                  <h2 className="player-title">{storyMeta.title || 'Audiobook'}</h2>
                  <div className="player-surface">
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
                          <div
                            ref={speedMenuRef}
                            className="scrub-popover speed-popover"
                            role="dialog"
                            aria-label="Playback speed"
                          >
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
                        className="secondary-btn is-disabled"
                        aria-label="Transcript (available in Pass 2)"
                        title="Transcript (available in Pass 2)"
                        disabled
                      >
                        <span className="secondary-glyph">
                          <Icon name="subtitles" className="secondary-icon" />
                        </span>
                        <span className="secondary-label">Transcript</span>
                      </button>
                      <span className="secondary-spacer" aria-hidden />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="extensive-pane extensive-pane-right" aria-hidden />
          </div>
        </div>
        <nav className="active-pass-indicator" aria-label="Pass progress">
          <ol className="active-pass-indicator-list">
            {[1, 2, 3, 4].map((step) => (
              <li
                key={step}
                className={`active-pass-indicator-item ${step === activeStep ? 'is-current' : ''}`}
              >
                <span className="active-pass-indicator-dot" aria-hidden="true">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      </>
    )
  }

  return (
    <div className={`active-flow active-step-${activeStep}`}>
      <>
        <header className="active-topbar">
          <div className="active-topbar-context">
            <div className="active-topbar-title">{storyMeta.title || 'Audiobook'}</div>
            <div className="active-topbar-meta">
              <span className="active-topbar-chunk">Chunk {chunkLabel}</span>
              <span className="active-topbar-divider" aria-hidden="true">
                ·
              </span>
              <span className="active-topbar-range">
                {formatTime(chunkStart)} → {formatTime(chunkEnd)}
              </span>
            </div>
          </div>
          <nav className="active-pass-nav" aria-label="Pass navigation">
            <div className="active-pass-label">
              Pass {activeStep} · {passLabel}
            </div>
            <ol className="active-pass-steps">
              {[1, 2, 3, 4].map((step) => {
                const isCurrent = step === activeStep
                const isCompleted = step < activeStep
                const isUpcoming = step > activeStep
                return (
                  <li
                    key={step}
                    className={`active-pass-step ${isCurrent ? 'is-current' : ''} ${
                      isCompleted ? 'is-completed' : ''
                    } ${isUpcoming ? 'is-upcoming' : ''}`}
                  >
                    <button
                      type="button"
                      className="active-pass-button"
                      onClick={() => handleSelectStep(step)}
                      disabled={isUpcoming}
                      aria-label={`Pass ${step}`}
                    >
                      <span className="active-pass-dot" aria-hidden="true">
                        {isCompleted ? '✓' : step}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
        </header>

        <section className="active-pass-layout" aria-live="polite">
          <div className="active-pass-main">
            {activeStep === 3 && (
              <div className="active-pass-block">
                <ActiveTranscript
                  segments={filteredSegments}
                  activeSegmentIndex={activeTranscriptIndex}
                  showWordStatus={showWordStatus}
                  allowEditing={allowEditing}
                />
                <div className="active-cta">
                  <button type="button" className="button" onClick={onBeginFinalListen}>
                    Begin final listen
                  </button>
                </div>
              </div>
            )}

            {activeStep !== 3 && (
              <div className="active-pass-block">
                <div className="active-player-surface">
                  {renderProgressBar()}
                  <div className="player-transport-shell">{renderTransportButtons()}</div>
                  <div
                    className="player-secondary-row secondary-controls"
                    role="group"
                    aria-label="Secondary controls"
                  >
                    <span className="secondary-spacer" aria-hidden />
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setShowChunkList(true)}
                      aria-label="Chunks"
                      title="Chunks"
                    >
                      <span className="secondary-glyph">
                        <Icon name="list" className="secondary-icon" />
                      </span>
                      <span className="secondary-label">Chunks</span>
                    </button>
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
                        <div
                          ref={speedMenuRef}
                          className="scrub-popover speed-popover"
                          role="dialog"
                          aria-label="Playback speed"
                        >
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
                    <span className="secondary-spacer" aria-hidden />
                    <span className="secondary-spacer" aria-hidden />
                  </div>
                </div>
              </div>
            )}
          </div>

          {showTranscript && activeStep !== 3 && (
            <aside className="active-pass-side">
              <ActiveTranscript
                segments={filteredSegments}
                activeSegmentIndex={activeTranscriptIndex}
                showWordStatus={showWordStatus}
                allowEditing={allowEditing}
              />
            </aside>
          )}
        </section>

        {showChunkList && (
          <div
            className="active-chunk-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Chunk navigation"
            onClick={() => setShowChunkList(false)}
          >
            <div className="active-chunk-drawer" onClick={(event) => event.stopPropagation()}>
              <div className="active-chunk-drawer-header">
                <div>
                  <div className="active-chunk-drawer-title">{storyMeta.title || 'Audiobook'}</div>
                  <div className="active-chunk-drawer-subtitle">Choose a chunk</div>
                </div>
                <button
                  type="button"
                  className="active-chunk-close"
                  onClick={() => setShowChunkList(false)}
                  aria-label="Close chunk navigation"
                >
                  <Icon name="close" />
                </button>
              </div>
              <ChunkTimeline
                chunks={chunks}
                activeIndex={activeChunkIndex}
                completedSet={completedChunks}
                onSelectChunk={handleSelectChunk}
                isChunkLocked={isChunkLocked}
              />
            </div>
          </div>
        )}
      </>
    </div>
  )
}

export default ActiveMode
