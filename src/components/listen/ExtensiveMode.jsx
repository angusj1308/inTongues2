import { useEffect, useRef, useState } from 'react'
import TranscriptRoller from './TranscriptRoller'

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const floored = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(floored / 60)
  const secs = floored % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const scrubOptions = [5, 10, 15, 30]
const speedPresets = [0.75, 0.9, 1, 1.25, 1.5, 2]

const formatRate = (rate) => {
  if (!Number.isFinite(rate)) return '1.0'
  return Number.isInteger(rate) ? `${rate.toFixed(1)}` : `${rate}`
}

const Icon = ({ name, filled = false, className = '' }) => (
  <span
    className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`.trim()}
    aria-hidden="true"
  >
    {name}
  </span>
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

const ExtensiveMode = ({
  storyMeta,
  isPlaying,
  playbackPositionSeconds,
  playbackDurationSeconds,
  onPlayPause,
  onSeek,
  playbackRate,
  onPlaybackRateChange,
  subtitlesEnabled,
  onToggleSubtitles,
  scrubSeconds,
  onScrubChange,
  transcriptSegments = [],
  activeTranscriptIndex = 0,
}) => {
  const [scrubMenuOpen, setScrubMenuOpen] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const rewindButtonRef = useRef(null)
  const scrubMenuRef = useRef(null)
  const speedButtonRef = useRef(null)
  const speedMenuRef = useRef(null)
  const longPressTimeoutRef = useRef(null)
  const longPressTriggeredRef = useRef(false)

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const handleSeek = (nextTime) => {
    if (!onSeek) return
    onSeek(nextTime)
  }

  const handleStart = () => handleSeek(0)

  const handleBack = () => handleSeek(Math.max(0, (playbackPositionSeconds || 0) - scrubSeconds))

  const handleForward = () =>
    handleSeek(
      Math.min(playbackDurationSeconds || playbackPositionSeconds || 0, (playbackPositionSeconds || 0) + scrubSeconds),
    )

  const handleSkipToEnd = () => handleSeek(playbackDurationSeconds || playbackPositionSeconds || 0)

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
                {scrubOptions.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    className={`scrub-popover-chip ${seconds === scrubSeconds ? 'active' : ''}`}
                    onClick={() => {
                      onScrubChange(seconds)
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

  const renderProgressBar = () => {
    const progressPercent = playbackDurationSeconds
      ? Math.min(100, Math.max(0, ((playbackPositionSeconds || 0) / playbackDurationSeconds) * 100))
      : 0

    return (
      <div className="progress-shell audible-progress-shell">
        <input
          className="audible-progress"
          type="range"
          min="0"
          max={playbackDurationSeconds || 0}
          step="0.1"
          value={playbackPositionSeconds || 0}
          onChange={(event) => handleSeek(Number(event.target.value))}
          aria-label="Playback position"
          style={{ '--progress': `${progressPercent}%` }}
        />
        <div className="progress-times ui-text">
          <span className="muted tiny">{formatTime(playbackPositionSeconds)}</span>
          <span className="muted tiny">{playbackDurationSeconds ? formatTime(playbackDurationSeconds) : '0:00'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`extensive-shell ${subtitlesEnabled ? 'extensive-shell--split' : ''}`}>
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
                      <div ref={speedMenuRef} className="scrub-popover speed-popover" role="dialog" aria-label="Playback speed">
                        <p className="speed-popover-title">Playback speed</p>
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
          </div>
        </div>
        <div className="extensive-pane extensive-pane-right" aria-hidden={!subtitlesEnabled}>
          {subtitlesEnabled ? (
            <div className="transcript-panel">
              <div className="transcript-panel-header">
                <h3 className="transcript-panel-title">Transcript</h3>
              </div>
              <div className="transcript-panel-body">
                <TranscriptRoller segments={transcriptSegments} activeIndex={activeTranscriptIndex} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default ExtensiveMode
