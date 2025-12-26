import { useCallback, useRef, useState } from 'react'

const STATUS_LEVELS = ['new', 'recognised', 'familiar', 'known']
const STATUS_LABELS = {
  new: 'New',
  recognised: 'Recognised',
  familiar: 'Familiar',
  known: 'Known',
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const WordCard = ({
  word,
  translation,
  status = 'new',
  audioBase64,
  audioUrl,
  isExpanded,
  onStatusChange,
  onPlayAudio,
  onClick,
}) => {
  const statusIndex = STATUS_LEVELS.indexOf(status)
  const validStatusIndex = statusIndex >= 0 ? statusIndex : 0

  const handleSliderChange = (e) => {
    const newIndex = parseInt(e.target.value, 10)
    const newStatus = STATUS_LEVELS[newIndex]
    if (onStatusChange) {
      onStatusChange(word, newStatus)
    }
  }

  const handlePlayClick = (e) => {
    e.stopPropagation()
    if (onPlayAudio && (audioBase64 || audioUrl)) {
      onPlayAudio(audioBase64, audioUrl)
    }
  }

  return (
    <div
      className={`word-status-card ${isExpanded ? 'word-status-card--expanded' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <div className="word-status-card-header">
        <div className="word-status-card-word">
          <span className="word-status-card-text">{word}</span>
          {(audioBase64 || audioUrl) && (
            <button
              type="button"
              className="word-status-card-audio"
              onClick={handlePlayClick}
              aria-label={`Play pronunciation of ${word}`}
            >
              <PlayIcon />
            </button>
          )}
        </div>
        <span className="word-status-card-translation">{translation || '...'}</span>
      </div>
      <div className="word-status-card-slider">
        <input
          type="range"
          min="0"
          max="3"
          step="1"
          value={validStatusIndex}
          onChange={handleSliderChange}
          className="word-status-slider"
          aria-label={`Status for ${word}`}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="word-status-slider-labels">
          {STATUS_LEVELS.map((level, i) => (
            <span
              key={level}
              className={`word-status-slider-label ${i === validStatusIndex ? 'active' : ''}`}
            >
              {STATUS_LABELS[level]}
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
  highlightedWord,
  onWordClick,
}) => {
  const [expandedWord, setExpandedWord] = useState(null)
  const audioRef = useRef(null)
  const listRef = useRef(null)

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

  const handleCardClick = useCallback((word) => {
    setExpandedWord((prev) => (prev === word ? null : word))
    if (onWordClick) {
      onWordClick(word)
    }
  }, [onWordClick])

  const filteredWords = words.filter((w) => w.status !== 'known')

  return (
    <div className="word-status-panel">
      <div className="word-status-panel-header">
        <span className="word-status-panel-label">PASS 3 OF 4</span>
        <span className="word-status-panel-title">Read + Adjust</span>
      </div>

      <div className="word-status-panel-body" ref={listRef}>
        {filteredWords.length === 0 ? (
          <div className="word-status-panel-empty">
            <p>No new words to review in this chunk.</p>
            <p className="muted small">All words are already marked as known.</p>
          </div>
        ) : (
          <div className="word-status-card-list">
            {filteredWords.map((wordData) => (
              <WordCard
                key={wordData.word}
                word={wordData.word}
                translation={wordData.translation}
                status={wordData.status}
                audioBase64={wordData.audioBase64}
                audioUrl={wordData.audioUrl}
                isExpanded={expandedWord === wordData.word || highlightedWord === wordData.word}
                onStatusChange={onStatusChange}
                onPlayAudio={handlePlayAudio}
                onClick={() => handleCardClick(wordData.word)}
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
