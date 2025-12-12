import TranscriptRoller from './TranscriptRoller'

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const floored = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(floored / 60)
  const secs = floored % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const scrubOptions = [5, 10, 15, 30]

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

  const renderScrubSelector = (compact = false) => (
    <div className={`scrub-selector ${compact ? 'scrub-selector-compact' : ''}`}>
      <span className="muted tiny">Scrub:</span>
      <div className="scrub-options" role="group" aria-label="Scrub seconds selector">
        {scrubOptions.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className={`scrub-chip ${seconds === scrubSeconds ? 'active' : ''}`}
            onClick={() => onScrubChange(seconds)}
          >
            {seconds}s
          </button>
        ))}
      </div>
    </div>
  )

  const renderTransportButtons = (size = 'default') => (
    <div className={`transport-row transport-row-${size}`}>
      <button type="button" className="transport-btn" onClick={handleStart}>
        Start again
      </button>
      <button type="button" className="transport-btn" onClick={handleBack}>
        -{scrubSeconds}s
      </button>
      <button type="button" className="transport-btn transport-btn-primary" onClick={onPlayPause}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button type="button" className="transport-btn" onClick={handleForward}>
        +{scrubSeconds}s
      </button>
      <button type="button" className="transport-btn" onClick={handleSkipToEnd}>
        Skip to end
      </button>
    </div>
  )

  const renderProgressBar = (compact = false) => (
    <div className={`progress-shell ${compact ? 'progress-shell-compact' : ''}`}>
      <span className="muted tiny">{formatTime(playbackPositionSeconds)}</span>
      <input
        type="range"
        min="0"
        max={playbackDurationSeconds || 0}
        step="0.1"
        value={playbackPositionSeconds || 0}
        onChange={(event) => handleSeek(Number(event.target.value))}
        aria-label="Playback position"
      />
      <span className="muted tiny">{playbackDurationSeconds ? formatTime(playbackDurationSeconds) : '0:00'}</span>
    </div>
  )

  if (subtitlesEnabled) {
    return (
      <div className="extensive-subs-on">
        <TranscriptRoller segments={transcriptSegments} activeIndex={activeTranscriptIndex} />
        <div className="mini-controls-bar">
          {renderTransportButtons('compact')}
          {renderProgressBar(true)}
          <div className="mini-controls-meta">
            <label className="toggle-row" htmlFor="subtitle-toggle">
              <span className="muted tiny">Subtitles</span>
              <input
                id="subtitle-toggle"
                type="checkbox"
                checked={subtitlesEnabled}
                onChange={onToggleSubtitles}
              />
            </label>
            {renderScrubSelector(true)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="extensive-player-shell">
      <div className="player-stack">
        <div className="player-cover" aria-hidden>
          <div className="player-cover-art">{storyMeta.title?.slice(0, 1) || 'A'}</div>
        </div>
        <h2 className="player-title">{storyMeta.title || 'Audiobook'}</h2>
        {renderProgressBar()}
        {renderTransportButtons()}
        <div className="player-secondary-row">
          <div className="speed-controls">
            <span className="muted tiny">Speed</span>
            <div className="speed-chips">
              {[0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`speed-chip ${playbackRate === rate ? 'active' : ''}`}
                  onClick={() => onPlaybackRateChange(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
          <div className="timer-placeholder">
            <span className="muted tiny">Timer</span>
            <select aria-label="Sleep timer placeholder" defaultValue="off">
              <option value="off">Off</option>
              <option value="todo">Coming soon</option>
            </select>
          </div>
          <label className="toggle-row" htmlFor="subtitle-toggle">
            <span className="muted tiny">Subtitles</span>
            <input
              id="subtitle-toggle"
              type="checkbox"
              checked={subtitlesEnabled}
              onChange={onToggleSubtitles}
            />
          </label>
        </div>
        {renderScrubSelector()}
      </div>
    </div>
  )
}

export default ExtensiveMode
