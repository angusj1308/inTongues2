import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TranscriptPanel from '../listen/TranscriptPanel'
import WordStatusPanel from '../listen/WordStatusPanel'
import ChunkTimeline from '../listen/ChunkTimeline'
import CinemaSubtitles from '../CinemaSubtitles'
import { normaliseExpression } from '../../services/vocab'

const PASS_LABELS = {
  1: 'Watch',
  2: 'Watch + Read',
  3: 'Read + Adjust',
  4: 'Final Watch',
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

const ActiveCinemaMode = ({
  videoTitle,
  chunks = [],
  activeChunkIndex = 0,
  completedChunks = new Set(),
  activeStep = 1,
  completedPasses = new Set(),
  canAdvanceToNextStep = false,
  canMoveToNextChunk = false,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  scrubSeconds = 5,
  onPlayPause,
  onSeek,
  playbackRate,
  onPlaybackRateChange,
  transcriptSegments = [],
  activeTranscriptIndex = -1,
  vocabEntries = {},
  language,
  wordTranslations = {},
  onWordStatusChange,
  onBeginFinalWatch,
  onRestartChunk,
  onSelectChunk,
  onSelectStep,
  onScrubChange,
  onAdvanceChunk,
  renderHighlightedText,
  onSubtitleWordClick,
  children: videoPlayer,
}) => {
  const rewindButtonRef = useRef(null)
  const scrubMenuRef = useRef(null)
  const longPressTimeoutRef = useRef(null)
  const longPressTriggeredRef = useRef(false)
  const chunkDrawerCloseTimeoutRef = useRef(null)
  const [scrubMenuOpen, setScrubMenuOpen] = useState(false)
  const speedButtonRef = useRef(null)
  const speedMenuRef = useRef(null)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [chunkDrawerOpen, setChunkDrawerOpen] = useState(false)
  const [chunkDrawerMounted, setChunkDrawerMounted] = useState(false)
  const [isTranscriptSynced, setIsTranscriptSynced] = useState(true)
  const [syncToken, setSyncToken] = useState(0)
  const [showPassThreeWarning, setShowPassThreeWarning] = useState(false)
  const [passThreeWarningAcknowledged, setPassThreeWarningAcknowledged] = useState(false)

  const hasChunks = Array.isArray(chunks) && chunks.length > 0
  const safeDuration = Number.isFinite(duration) ? duration : 0
  const safeChunkIndex = hasChunks ? Math.min(Math.max(activeChunkIndex, 0), chunks.length - 1) : 0

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const clearChunkDrawerTimeout = () => {
    if (chunkDrawerCloseTimeoutRef.current) {
      clearTimeout(chunkDrawerCloseTimeoutRef.current)
      chunkDrawerCloseTimeoutRef.current = null
    }
  }

  // Click outside handler
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
  useEffect(() => () => clearChunkDrawerTimeout(), [])

  // Reset transcript sync on pass/chunk change
  useEffect(() => {
    if (activeStep !== 2 && activeStep !== 3) return
    setIsTranscriptSynced(true)
    setSyncToken((prev) => prev + 1)
  }, [activeStep, safeChunkIndex])

  // Reset warning on chunk change
  useEffect(() => {
    setPassThreeWarningAcknowledged(false)
    setShowPassThreeWarning(false)
  }, [safeChunkIndex])

  const handleTranscriptUnsync = useCallback(() => {
    setIsTranscriptSynced(false)
  }, [])

  const handleTranscriptResync = useCallback(() => {
    setIsTranscriptSynced(true)
    setSyncToken((prev) => prev + 1)
  }, [])

  const handleWordStatusChangeInternal = useCallback(
    (word, newStatus) => {
      if (onWordStatusChange) {
        onWordStatusChange(word, newStatus)
      }
    },
    [onWordStatusChange]
  )

  // Extract unique words from chunk for Pass 3 Word Status Panel
  const chunkWords = useMemo(() => {
    if (!hasChunks) return []

    const currentChunk = chunks[safeChunkIndex]
    const chunkStart = Number.isFinite(currentChunk?.start) ? currentChunk.start : 0
    const rawChunkEnd = Number.isFinite(currentChunk?.end) ? currentChunk.end : safeDuration
    const chunkEnd = Math.max(rawChunkEnd, chunkStart)

    const hasValidChunkBounds = Number.isFinite(chunkStart) && Number.isFinite(chunkEnd) && chunkEnd > chunkStart
    const segments = hasValidChunkBounds
      ? transcriptSegments.filter((segment) => {
          if (typeof segment.start !== 'number' || typeof segment.end !== 'number') return true
          return segment.start >= chunkStart && segment.start < chunkEnd
        })
      : transcriptSegments

    const wordSet = new Map()

    segments.forEach((segment) => {
      const text = segment.text || ''
      const tokens = text.split(/([^\p{L}\p{N}]+)/gu)

      tokens.forEach((token) => {
        if (!token || !/[\p{L}\p{N}]/u.test(token)) return

        const normalised = normaliseExpression(token)
        if (wordSet.has(normalised)) return

        const entry = vocabEntries[normalised]
        const status = entry?.status || 'new'

        const translationData = wordTranslations[normalised] || {}

        wordSet.set(normalised, {
          word: token,
          normalised,
          status,
          translation: translationData.translation || entry?.translation || null,
          audioBase64: translationData.audioBase64 || null,
          audioUrl: translationData.audioUrl || null,
        })
      })
    })

    return Array.from(wordSet.values())
  }, [hasChunks, chunks, safeChunkIndex, safeDuration, transcriptSegments, vocabEntries, wordTranslations])

  const scheduleChunkDrawerUnmount = () => {
    clearChunkDrawerTimeout()
    chunkDrawerCloseTimeoutRef.current = setTimeout(() => {
      setChunkDrawerMounted(false)
      chunkDrawerCloseTimeoutRef.current = null
    }, 280)
  }

  if (!hasChunks) {
    return (
      <div className="cinema-active-loading" role="status" aria-live="polite">
        Loading chunks…
      </div>
    )
  }

  const currentChunk = chunks[safeChunkIndex]
  const chunkStart = Number.isFinite(currentChunk?.start) ? currentChunk.start : 0
  const rawChunkEnd = Number.isFinite(currentChunk?.end) ? currentChunk.end : safeDuration
  const chunkEnd = Math.max(rawChunkEnd, chunkStart)
  const chunkDuration = Math.max(0, chunkEnd - chunkStart)

  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : chunkStart
  const clampedPosition = Math.min(Math.max(safeCurrentTime, chunkStart), chunkEnd)
  const chunkProgress = chunkDuration ? Math.min(100, ((clampedPosition - chunkStart) / chunkDuration) * 100) : 0

  const hasValidChunkBounds = Number.isFinite(chunkStart) && Number.isFinite(chunkEnd) && chunkEnd > chunkStart
  const filteredSegments = hasValidChunkBounds
    ? transcriptSegments.filter((segment) => {
        if (typeof segment.start !== 'number' || typeof segment.end !== 'number') return true
        return segment.start >= chunkStart && segment.start < chunkEnd
      })
    : transcriptSegments

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

  const handleChunkToggle = () => {
    if (chunkDrawerOpen) {
      setChunkDrawerOpen(false)
      scheduleChunkDrawerUnmount()
      return
    }
    clearChunkDrawerTimeout()
    setChunkDrawerMounted(true)
    requestAnimationFrame(() => setChunkDrawerOpen(true))
  }

  const handleChunkDrawerTransitionEnd = (event) => {
    if (event.target !== event.currentTarget) return
    if (chunkDrawerOpen) return
    if (event.propertyName !== 'transform') return
    clearChunkDrawerTimeout()
    setChunkDrawerMounted(false)
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

  const isChunkLocked = (index) => index > safeChunkIndex
  const handleSelectChunk = (index) => {
    if (typeof onSelectChunk === 'function') {
      onSelectChunk(index)
    }
    setChunkDrawerOpen(false)
    scheduleChunkDrawerUnmount()
  }

  const handleSelectStep = (step) => {
    if (typeof onSelectStep === 'function') {
      onSelectStep(step)
    }
  }

  const handlePreviousPass = () => {
    if (activeStep <= 1) return
    handleSelectStep(activeStep - 1)
  }

  const handleNextPass = () => {
    if (!canAdvanceToNextStep || activeStep >= 4) return
    handleSelectStep(activeStep + 1)
  }

  const handlePassThreeContinue = () => {
    if (!passThreeWarningAcknowledged) {
      setShowPassThreeWarning(true)
      return
    }
    onBeginFinalWatch?.()
    handleSelectStep(4)
  }

  const handleConfirmPassThreeWarning = () => {
    setPassThreeWarningAcknowledged(true)
    setShowPassThreeWarning(false)
    onBeginFinalWatch?.()
    handleSelectStep(4)
  }

  const passLabel = PASS_LABELS[activeStep] || PASS_LABELS[1]
  const chunkPosition = (currentChunk?.index || 0) + 1
  const totalChunks = chunks.length
  const chunkSuffix = `Chunk ${chunkPosition} of ${totalChunks}`

  const heroTitles = {
    1: 'Just watch',
    2: 'Watch + Read',
    3: 'Read + Adjust',
    4: 'Final Watch',
  }

  const isSubtitlesVisible = activeStep >= 2
  const heroTitle = heroTitles[activeStep] || heroTitles[1]

  // Determine if video should show subtitles (Pass 2 and 4 only - not Pass 3 which is paused)
  const showVideoSubtitles = activeStep === 2 || activeStep === 4

  const chunkOverlay = hasChunks && chunkDrawerMounted ? (
    <div className={`cinema-active-chunk-shell ${chunkDrawerOpen ? 'is-open' : ''}`} aria-hidden={!chunkDrawerOpen}>
      <div
        className="cinema-active-chunk-drawer"
        role="dialog"
        aria-label="Chunk navigation"
        onTransitionEnd={handleChunkDrawerTransitionEnd}
      >
        <ChunkTimeline
          chunks={chunks}
          activeIndex={safeChunkIndex}
          completedSet={completedChunks}
          onSelectChunk={handleSelectChunk}
          isChunkLocked={isChunkLocked}
        />
      </div>
    </div>
  ) : null

  const passNavigation = (
    <nav className="active-pass-footer ui-text" aria-label="Pass navigation">
      <button
        type="button"
        className="active-pass-arrow"
        onClick={handlePreviousPass}
        disabled={activeStep === 1}
        aria-label="Previous pass"
      >
        {'<'}
      </button>
      <ol className="active-pass-footer-steps" aria-label="Pass steps">
        {[1, 2, 3, 4].map((step) => {
          const isCurrent = step === activeStep
          const isCompleted = completedPasses.has(step)
          const isNext = step === activeStep + 1
          const isBeyondNext = step > activeStep + 1
          const isDisabled = isBeyondNext || (isNext && !canAdvanceToNextStep)
          return (
            <li
              key={step}
              className={`active-pass-footer-step ${isCurrent ? 'is-current' : ''} ${
                isCompleted ? 'is-completed' : ''
              } ${isDisabled ? 'is-locked' : ''}`}
            >
              <button
                type="button"
                className="active-pass-footer-button"
                onClick={() => handleSelectStep(step)}
                disabled={isDisabled}
                aria-label={`Pass ${step}`}
              >
                {step}
              </button>
            </li>
          )
        })}
      </ol>
      {activeStep === 4 ? (
        <button
          type="button"
          className="button active-pass-next-chunk"
          onClick={onAdvanceChunk}
          disabled={!canMoveToNextChunk}
        >
          Move to next chunk
        </button>
      ) : (
        <button
          type="button"
          className="active-pass-arrow"
          onClick={handleNextPass}
          disabled={!canAdvanceToNextStep || activeStep === 4}
          aria-label="Next pass"
        >
          {'>'}
        </button>
      )}
    </nav>
  )

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

  return (
    <div className={`cinema-active-flow cinema-active-step-${activeStep}`}>
      <section className={`cinema-active-stage cinema-active-stage--pass-${activeStep}`} aria-live="polite">
        <div className="cinema-active-stage-inner">
          {/* Video + Controls pane */}
          <div className="cinema-active-stage-player">
            {/* Pass header */}
            <div className="cinema-active-pass-header">
              <div className="cinema-active-pass-context">
                <span className="cinema-active-title">{videoTitle || 'Video'}</span>
                <span className="cinema-active-divider" aria-hidden="true"> — </span>
                <span className="cinema-active-chunk-suffix">{chunkSuffix}</span>
              </div>
              <div className="cinema-active-pass-hero" aria-live="polite">
                <span className="cinema-active-pass-hero-label">PASS {activeStep} OF 4</span>
                <span className="cinema-active-pass-hero-title">{heroTitle}</span>
              </div>
            </div>

            {/* Video container */}
            <div className="cinema-active-video-container">
              <div className="cinema-active-video-frame">
                {videoPlayer}
                {/* Show subtitles on video only in Pass 2 and 4 */}
                {showVideoSubtitles && (
                  <div className="subtitle-overlay">
                    <CinemaSubtitles
                      transcript={{ segments: filteredSegments }}
                      currentTime={clampedPosition}
                      renderHighlightedText={renderHighlightedText}
                      onWordSelect={onSubtitleWordClick}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Player controls */}
            <div className="cinema-active-player-surface">
              {/* Progress bar */}
              <div className="progress-shell audible-progress-shell">
                <input
                  className="audible-progress"
                  type="range"
                  min={chunkStart}
                  max={chunkEnd}
                  step="0.1"
                  value={clampedPosition}
                  onChange={(event) => handleSeek(Number(event.target.value))}
                  aria-label="Playback position"
                  style={{ '--progress': `${chunkProgress}%` }}
                />
                <div className="progress-times ui-text">
                  <span className="muted tiny">{formatTime(clampedPosition)}</span>
                  <span className="muted tiny">{formatTime(chunkEnd)}</span>
                </div>
              </div>

              {/* Transport */}
              <div className="player-transport-shell">{renderTransportButtons()}</div>

              {/* Secondary controls */}
              <div className="player-secondary-row secondary-controls" role="group" aria-label="Secondary controls">
                <span className="secondary-spacer" aria-hidden />
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleChunkToggle}
                  disabled={!hasChunks}
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
                  {speedMenuOpen && (
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
                  )}
                </div>
                <button
                  type="button"
                  className={`secondary-btn ${isSubtitlesVisible ? 'is-locked active' : 'is-disabled'}`}
                  aria-label={isSubtitlesVisible ? 'Subtitles (locked on)' : 'Subtitles (available in Pass 2)'}
                  title={isSubtitlesVisible ? 'Subtitles (locked on)' : 'Subtitles (available in Pass 2)'}
                  disabled
                >
                  <span className="secondary-glyph">
                    <Icon name="subtitles" className="secondary-icon" filled={isSubtitlesVisible} />
                  </span>
                  <span className="secondary-label">Subtitles</span>
                </button>
                <span className="secondary-spacer" aria-hidden />
              </div>

              {/* Pass navigation - inside card for Pass 1-3 */}
              {activeStep < 4 && passNavigation}
            </div>

            {/* Chunk drawer overlay */}
            {chunkOverlay}
          </div>

          {/* Transcript pane - visible in Pass 2+ */}
          {activeStep >= 2 && (
            <div className="cinema-active-stage-transcript">
              <div className="cinema-active-stage-transcript-card">
                <TranscriptPanel
                  segments={filteredSegments}
                  activeIndex={activeTranscriptIndex}
                  vocabEntries={vocabEntries}
                  language={language}
                  showWordStatus={activeStep >= 3}
                  showWordStatusToggle={activeStep >= 2}
                  wordStatusDisabled={activeStep === 2}
                  isSynced={isTranscriptSynced}
                  onUserScroll={handleTranscriptUnsync}
                  onResync={handleTranscriptResync}
                  syncToken={syncToken}
                />
              </div>
            </div>
          )}

          {/* Word Status Panel - Pass 3 only */}
          {activeStep === 3 && (
            <div className="cinema-active-stage-word-status">
              <WordStatusPanel
                words={chunkWords}
                language={language}
                onStatusChange={handleWordStatusChangeInternal}
                onSaveAndContinue={handlePassThreeContinue}
                passNavigation={passNavigation}
              />
            </div>
          )}
        </div>
      </section>

      {/* Dock for Pass 4 navigation */}
      {activeStep === 4 && <div className="cinema-active-pass-nav-dock">{passNavigation}</div>}

      {/* Pass 3 Warning Modal */}
      {showPassThreeWarning && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Confirm word status changes">
            <div className="section-header" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3>Save word status changes?</h3>
                <p className="muted small">Continuing will mark all untouched new words as Known.</p>
              </div>
            </div>
            <div className="cinema-active-stage-warning-actions">
              <button type="button" className="button ghost" onClick={() => setShowPassThreeWarning(false)}>
                Cancel
              </button>
              <button type="button" className="button" onClick={handleConfirmPassThreeWarning}>
                Save and continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ActiveCinemaMode
