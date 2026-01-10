import { useCallback, useRef } from 'react'
import { HIGHLIGHT_COLOR, STATUS_OPACITY } from '../../constants/highlightColors'

const STATUS_LEVELS = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'U', 'R', 'F', 'K']

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

// Get background style for a status button when active
// Light mode: mix with white, Dark mode: mix with black
const getStatusStyle = (statusLevel, isActive, darkMode) => {
  if (!isActive) return {}

  const mixBase = darkMode ? 'black' : 'white'
  const textHighlight = darkMode ? '#F0AAAA' : '#8B3A3A'
  const textMuted = darkMode ? '#94a3b8' : '#64748b'

  switch (statusLevel) {
    case 'new':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.new * 100}%, ${mixBase})`,
        color: textHighlight,
      }
    case 'unknown':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.unknown * 100}%, ${mixBase})`,
        color: textHighlight,
      }
    case 'recognised':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.recognised * 100}%, ${mixBase})`,
        color: textHighlight,
      }
    case 'familiar':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.familiar * 100}%, ${mixBase})`,
        color: textMuted,
      }
    case 'known':
      // Soft green - "mastered" indicator
      return {
        background: darkMode
          ? 'color-mix(in srgb, #22c55e 40%, black)'
          : 'color-mix(in srgb, #22c55e 40%, white)',
        color: darkMode ? '#86efac' : '#166534',
      }
    default:
      return {}
  }
}

const CinemaWordPopup = ({
  word,
  translation,
  status = 'new',
  audioBase64,
  audioUrl,
  darkMode = true,
  isClosing = false,
  onStatusChange,
  onClose,
  style = {},
}) => {
  const audioRef = useRef(null)
  const statusIndex = STATUS_LEVELS.indexOf(status)
  const validStatusIndex = statusIndex >= 0 ? statusIndex : 0
  const hasAudio = Boolean(audioBase64 || audioUrl)

  const handlePlayAudio = useCallback(() => {
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
  }, [audioBase64, audioUrl])

  const handleStatusClick = (newStatus) => {
    if (onStatusChange) {
      onStatusChange(word, newStatus)
    }
  }

  return (
    <div
      className={`cinema-word-popup ${darkMode ? 'is-dark' : 'is-light'}${isClosing ? ' is-closing' : ''}`}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Word and translation row */}
      <div className="cinema-word-popup-content">
        <button
          type="button"
          className={`cinema-word-popup-audio ${hasAudio ? '' : 'cinema-word-popup-audio--disabled'}`}
          onClick={handlePlayAudio}
          disabled={!hasAudio}
          aria-label={`Play pronunciation of ${word}`}
        >
          <PlayIcon />
        </button>
        <span className="cinema-word-popup-word">{word}</span>
        <span className="cinema-word-popup-translation">{translation || '...'}</span>
      </div>

      {/* Status selector row */}
      <div className="cinema-word-popup-status">
        {STATUS_ABBREV.map((abbrev, i) => {
          const isActive = i === validStatusIndex
          const statusStyle = getStatusStyle(STATUS_LEVELS[i], isActive, darkMode)

          return (
            <button
              key={abbrev}
              type="button"
              className={`cinema-word-popup-status-btn ${isActive ? 'is-active' : ''}`}
              style={statusStyle}
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

export default CinemaWordPopup
