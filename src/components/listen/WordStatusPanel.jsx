import { useCallback, useMemo, useRef } from 'react'
import { HIGHLIGHT_COLOR, STATUS_OPACITY } from '../../constants/highlightColors'

const STATUS_LEVELS = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'U', 'R', 'F', 'K']

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

// Get background style for a status button when active
// Uses exact same color codes and opacity values as the word highlighting system
// Mixes with white (not transparent) to match highlight appearance on white text background
const getStatusStyle = (statusLevel, isActive) => {
  if (!isActive) return {}

  switch (statusLevel) {
    case 'new':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.new * 100}%, white)`,
        color: '#8B3A3A'
      }
    case 'unknown':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.unknown * 100}%, white)`,
        color: '#8B3A3A'
      }
    case 'recognised':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.recognised * 100}%, white)`,
        color: '#8B3A3A'
      }
    case 'familiar':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.familiar * 100}%, white)`,
        color: '#64748b'
      }
    case 'known':
      // Soft green - "mastered" indicator (UI control only, not text highlighting)
      return {
        background: 'color-mix(in srgb, #22c55e 40%, white)',
        color: '#166534'
      }
    default:
      return {}
  }
}

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

  const handleStatusClick = (newStatus) => {
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
      <div className="status-selector">
        {STATUS_ABBREV.map((abbrev, i) => {
          const isActive = i === validStatusIndex
          const style = getStatusStyle(STATUS_LEVELS[i], isActive)

          return (
            <button
              key={abbrev}
              type="button"
              className={`status-selector-option ${isActive ? 'active' : ''}`}
              style={style}
              onClick={() => handleStatusClick(STATUS_LEVELS[i])}
              aria-label={`Set status to ${STATUS_LEVELS[i]}`}
              aria-pressed={isActive}
            >
              {abbrev}
            </button>
          )
        })}
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
  const initialWordsRef = useRef(null)

  // Capture initial non-known words on first render
  // Words that start as 'known' are excluded, but words moved to 'known' during session stay visible
  if (initialWordsRef.current === null) {
    initialWordsRef.current = new Set(
      words
        .filter((w) => w.status !== 'known')
        .map((w) => w.normalised || w.word)
    )
  }

  // Filter to show only words that were initially not-known
  const visibleWords = useMemo(() => {
    return words.filter((w) => initialWordsRef.current.has(w.normalised || w.word))
  }, [words])

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

  return (
    <div className="word-status-panel">
      <div className="word-status-panel-header">
        <span className="word-status-panel-label">PASS 3 OF 4</span>
        <span className="word-status-panel-title">Read + Adjust</span>
      </div>

      <div className="word-status-panel-body">
        {visibleWords.length === 0 ? (
          <div className="word-status-panel-empty">
            <p>No words to review in this chunk.</p>
          </div>
        ) : (
          <div className="word-status-row-list">
            {visibleWords.map((wordData) => (
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
