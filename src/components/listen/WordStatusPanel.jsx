import { useCallback, useRef } from 'react'

const STATUS_LEVELS = ['new', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'R', 'F', 'K']

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const WordRow = ({
  word,
  translation,
  status = 'new',
  audioBase64,
  audioUrl,
  onStatusChange,
  onPlayAudio,
}) => {
  const statusIndex = STATUS_LEVELS.indexOf(status)
  const validStatusIndex = statusIndex >= 0 ? statusIndex : 0
  const hasAudio = Boolean(audioBase64 || audioUrl)

  const handleSliderChange = (e) => {
    const newIndex = parseInt(e.target.value, 10)
    const newStatus = STATUS_LEVELS[newIndex]
    if (onStatusChange) {
      onStatusChange(word, newStatus)
    }
  }

  const handlePlayClick = () => {
    if (onPlayAudio && hasAudio) {
      onPlayAudio(audioBase64, audioUrl)
    }
  }

  return (
    <div className="word-status-row">
      <div className="word-status-row-left">
        <button
          type="button"
          className={`word-status-row-audio ${hasAudio ? '' : 'word-status-row-audio--disabled'}`}
          onClick={handlePlayClick}
          disabled={!hasAudio}
          aria-label={`Play pronunciation of ${word}`}
        >
          <PlayIcon />
        </button>
        <span className="word-status-row-word">{word}</span>
        <span className="word-status-row-translation">{translation || '...'}</span>
      </div>
      <div className="word-status-row-slider">
        <input
          type="range"
          min="0"
          max="3"
          step="1"
          value={validStatusIndex}
          onChange={handleSliderChange}
          className="word-status-slider-input"
          aria-label={`Status for ${word}`}
        />
        <div className="word-status-slider-ticks">
          {STATUS_ABBREV.map((abbrev, i) => (
            <span
              key={abbrev}
              className={`word-status-slider-tick ${i === validStatusIndex ? 'active' : ''}`}
            >
              {abbrev}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

const WordStatusPanel = ({
  words = [],
  onStatusChange,
  onSaveAndContinue,
  passNavigation,
}) => {
  const audioRef = useRef(null)

  const handlePlayAudio = useCallback((audioBase64, audioUrl) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio()
    if (audioBase64) {
      audio.src = `data:audio/mp3;base64,${audioBase64}`
    } else if (audioUrl) {
      audio.src = audioUrl
    }
    audio.play().catch((err) => console.error('Audio playback failed:', err))
    audioRef.current = audio
  }, [])

  const filteredWords = words.filter((w) => w.status !== 'known')

  return (
    <div className="word-status-panel">
      <div className="word-status-panel-header">
        <span className="word-status-panel-label">PASS 3 OF 4</span>
        <span className="word-status-panel-title">Read + Adjust</span>
      </div>

      <div className="word-status-panel-body">
        {filteredWords.length === 0 ? (
          <div className="word-status-panel-empty">
            <p>No new words to review in this chunk.</p>
            <p className="muted small">All words are already marked as known.</p>
          </div>
        ) : (
          <div className="word-status-row-list">
            {filteredWords.map((wordData) => (
              <WordRow
                key={wordData.normalised || wordData.word}
                word={wordData.word}
                translation={wordData.translation}
                status={wordData.status}
                audioBase64={wordData.audioBase64}
                audioUrl={wordData.audioUrl}
                onStatusChange={onStatusChange}
                onPlayAudio={handlePlayAudio}
              />
            ))}
          </div>
        )}
      </div>

      <div className="word-status-panel-footer">
        <button
          type="button"
          className="button word-status-save-btn"
          onClick={onSaveAndContinue}
        >
          Save and continue
        </button>
        {passNavigation}
      </div>
    </div>
  )
}

export default WordStatusPanel
