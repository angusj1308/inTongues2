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
const speedPresets = [0.75, 1, 1.25, 1.5]

const Icon = ({ name, filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'filled' : ''}`} aria-hidden="true">
    {name}
  </span>
)

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
  const rewindButtonRef = useRef(null)
  const scrubMenuRef = useRef(null)
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

  const scrubIconName = (direction = 'back') => {
    const suffix = scrubSeconds === 5 ? '5' : scrubSeconds === 10 ? '10' : scrubSeconds === 15 ? '15' : '30'
    return `${direction === 'back' ? 'replay' : 'forward'}_${suffix}`
  }

  const cyclePlaybackRate = () => {
    if (!onPlaybackRateChange) return
    const currentIndex = speedPresets.indexOf(playbackRate)
    const nextRate = speedPresets[(currentIndex + 1) % speedPresets.length]
    onPlaybackRateChange(nextRate)
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
      if (
        scrubMenuRef.current &&
        !scrubMenuRef.current.contains(event.target) &&
        !rewindButtonRef.current?.contains(event.target)
      ) {
        setScrubMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  useEffect(() => () => clearLongPress(), [])

  const renderTransportButtons = () => (
    <div className="transport-row transport-row-icons" role="group" aria-label="Playback controls">
      <button
        type="button"
        className="icon-btn ghost"
        onClick={handleStart}
        aria-label="Start from beginning"
        title="Start from beginning"
      >
        <Icon name="skip_previous" />
      </button>
      <div className="icon-btn-popover-wrap">
        <button
          ref={rewindButtonRef}
          type="button"
          className="icon-btn ghost"
          onClick={handleRewindClick}
          onContextMenu={handleRewindContextMenu}
          onPointerDown={handleRewindPressStart}
          onPointerUp={handleRewindPressEnd}
          onPointerLeave={handleRewindPressEnd}
          aria-label={`Rewind ${scrubSeconds} seconds`}
          title="Long-press or right-click to change interval"
        >
          <Icon name={scrubIconName('back')} />
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
        <Icon name={isPlaying ? 'pause' : 'play_arrow'} />
      </button>
      <button
        type="button"
        className="icon-btn ghost"
        onClick={handleForward}
        aria-label={`Forward ${scrubSeconds} seconds`}
        title={`Forward ${scrubSeconds} seconds`}
      >
        <Icon name={scrubIconName('forward')} />
      </button>
      <button
        type="button"
        className="icon-btn ghost"
        onClick={handleSkipToEnd}
        aria-label="Skip to end"
        title="Skip to end"
      >
        <Icon name="skip_next" />
      </button>
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
    <div className="extensive-player-shell">
      <div className="player-stack">
        <div className={`player-visual-stage ${subtitlesEnabled ? 'show-transcript' : ''}`}>
          <div className="player-cover" aria-hidden>
            <div className="player-cover-art">{storyMeta.title?.slice(0, 1) || 'A'}</div>
          </div>
          <div className="player-transcript" aria-hidden={!subtitlesEnabled}>
            <TranscriptRoller segments={transcriptSegments} activeIndex={activeTranscriptIndex} />
          </div>
        </div>
        <h2 className="player-title">{storyMeta.title || 'Audiobook'}</h2>
        <div className="player-surface">
          {renderProgressBar()}
          <div className="player-transport-shell">{renderTransportButtons()}</div>
          <div className="player-secondary-row chip-row" role="group" aria-label="Secondary controls">
            <button
              type="button"
              className={`control-chip ${playbackRate && playbackRate !== 1 ? 'active' : ''}`}
              onClick={cyclePlaybackRate}
              aria-label={`Playback speed ${playbackRate || 1}x`}
              title="Change playback speed"
            >
              <Icon name="speed" />
              <span className="chip-label">Speed</span>
              {playbackRate && playbackRate !== 1 ? <span className="chip-badge">{`${playbackRate}x`}</span> : null}
            </button>
            <button
              type="button"
              className="control-chip"
              aria-label="Sleep timer"
              title="Sleep timer (coming soon)"
            >
              <Icon name="timer" />
              <span className="chip-label">Timer</span>
            </button>
            <button
              type="button"
              className={`control-chip ${subtitlesEnabled ? 'active' : ''}`}
              onClick={onToggleSubtitles}
              aria-label={subtitlesEnabled ? 'Hide subtitles' : 'Show subtitles'}
              title="Toggle subtitles"
            >
              <Icon name="subtitles" filled={subtitlesEnabled} />
              <span className="chip-label">Subs</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExtensiveMode
