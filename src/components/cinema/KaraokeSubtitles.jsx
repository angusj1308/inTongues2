import { useMemo } from 'react'
import {
  LANGUAGE_HIGHLIGHT_COLORS,
  STATUS_OPACITY,
} from '../../constants/highlightColors'

// Helper to get language color with case-insensitive lookup
const getLanguageColor = (language) => {
  if (!language) return LANGUAGE_HIGHLIGHT_COLORS.default
  const exactMatch = LANGUAGE_HIGHLIGHT_COLORS[language]
  if (exactMatch) return exactMatch
  const capitalized = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase()
  return LANGUAGE_HIGHLIGHT_COLORS[capitalized] || LANGUAGE_HIGHLIGHT_COLORS.default
}

// Get highlight color directly based on word status
function getWordColor({ language, status }) {
  // Known words are white, everything else gets color
  if (status === 'known') return '#ffffff'
  if (status === 'new') return '#F97316'
  // Learning words use language color
  return getLanguageColor(language)
}

const KaraokeWord = ({
  word,
  isActive,
  isPast,
  status,
  language,
  onWordClick,
}) => {
  const color = getWordColor({ language, status })

  const classNames = ['karaoke-word']
  if (isActive) classNames.push('karaoke-word--active')
  if (isPast) classNames.push('karaoke-word--past')

  const handleClick = (event) => {
    if (onWordClick) {
      onWordClick(word.text, event)
    }
  }

  return (
    <span
      className={classNames.join(' ')}
      style={{ color }}
      onClick={handleClick}
    >
      {word.text}
    </span>
  )
}

const KaraokeSubtitles = ({
  segments = [],
  currentTime = 0,
  language,
  vocabEntries = {},
  showWordStatus = true,
  onWordClick,
  onWordSelect,
}) => {
  // Find active segment based on current time
  const activeSegment = useMemo(() => {
    if (!segments.length) return null
    const time = Math.max(0, Number(currentTime) || 0)

    return segments.find(
      (segment) => time >= segment.start && time < segment.end
    ) || null
  }, [segments, currentTime])

  // Find active word within segment
  const activeWordIndex = useMemo(() => {
    if (!activeSegment?.words?.length) return -1
    const time = Math.max(0, Number(currentTime) || 0)

    for (let i = 0; i < activeSegment.words.length; i++) {
      const word = activeSegment.words[i]
      if (time >= word.start && time < word.end) {
        return i
      }
    }
    return -1
  }, [activeSegment, currentTime])

  if (!segments.length) {
    return (
      <div className="karaoke-subtitles karaoke-subtitles--empty">
        <span className="muted small">Subtitles will appear here once available.</span>
      </div>
    )
  }

  if (!activeSegment) {
    return (
      <div className="karaoke-subtitles karaoke-subtitles--waiting">
        <span className="muted small">...</span>
      </div>
    )
  }

  // If segment has word-level timing, render karaoke style
  if (activeSegment.words?.length > 0) {
    return (
      <div
        className="karaoke-subtitles"
        onMouseUp={onWordSelect}
        style={{ cursor: 'pointer', userSelect: 'text' }}
      >
        <div className="karaoke-line">
          {activeSegment.words.map((word, index) => {
            const normalised = word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
            const entry = vocabEntries[normalised]
            const status = entry?.status || 'new'

            return (
              <KaraokeWord
                key={`${word.start}-${index}`}
                word={word}
                isActive={index === activeWordIndex}
                isPast={index < activeWordIndex}
                status={status}
                language={language}
                onWordClick={onWordClick}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // Fallback: no word-level timing, just show the segment text
  return (
    <div
      className="karaoke-subtitles"
      onMouseUp={onWordSelect}
      style={{ cursor: 'pointer', userSelect: 'text' }}
    >
      <div className="karaoke-line karaoke-line--no-words">
        {activeSegment.text}
      </div>
    </div>
  )
}

export default KaraokeSubtitles
