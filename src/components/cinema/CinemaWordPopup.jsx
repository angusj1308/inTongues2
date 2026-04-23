import { useCallback, useRef } from 'react'

const STATUS_LEVELS = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'U', 'R', 'F', 'K']

// Per-status colors. N/U share the 'new' palette color; R/F pull from the
// palette's recognised/familiar stops; K is a mastered-green constant.
// The palette vars (--hlt-*) are set by AuthProvider based on user's
// highlightPalette (terracotta / sage / slate) and theme.
const STATUS_COLORS = {
  new: 'var(--hlt-new)',
  unknown: 'var(--hlt-new)',
  recognised: 'var(--hlt-recognised)',
  familiar: 'var(--hlt-familiar)',
  known: '#4CAF50',
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

// Inactive pill: status color muted against the popup bg so the row reads as
// a scale preview. Active pill: tinted fill + raw status color as text.
const getStatusStyle = (statusLevel, isActive) => {
  const color = STATUS_COLORS[statusLevel]

  if (isActive) {
    return {
      background: `color-mix(in srgb, ${color} 45%, black)`,
      color,
    }
  }

  return {
    color: `color-mix(in srgb, ${color} 55%, black)`,
  }
}

const CinemaWordPopup = ({
  word,
  translation,
  status = 'new',
  audioBase64,
  audioUrl,
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
      className={`cinema-word-popup is-dark${isClosing ? ' is-closing' : ''}`}
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
          const statusStyle = getStatusStyle(STATUS_LEVELS[i], isActive)

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
