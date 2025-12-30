import { useMemo, memo } from 'react'
import {
  LANGUAGE_HIGHLIGHT_COLORS,
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

const KaraokeWord = memo(({
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
})

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
    const time = Math.max(0, Number(currentTime) || 0)
    const lastWord = activeSegment.words[activeSegment.words.length - 1]
    const isInGap = activeWordIndex === -1 && time > lastWord?.end

    return (
      <div
        className="karaoke-subtitles"
        onMouseUp={onWordSelect}
        style={{ cursor: 'pointer', userSelect: 'text' }}
      >
        <div className={`karaoke-line${isInGap ? ' karaoke-line--gap' : ''}`}>
          {activeSegment.words.map((word, index) => {
            const normalised = word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
            const entry = vocabEntries[normalised]
            const status = entry?.status || 'new'

            return (
              <KaraokeWord
                key={`${word.start}-${index}`}
                word={word}
                isActive={index === activeWordIndex}
                isPast={index < activeWordIndex || isInGap}
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

  // Fallback: no word-level timing - tokenize text and apply word status colors
  const tokens = (activeSegment.text || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)

  return (
    <div
      className="karaoke-subtitles"
      onMouseUp={onWordSelect}
      style={{ cursor: 'pointer', userSelect: 'text' }}
    >
      <div className="karaoke-line karaoke-line--no-words">
        {tokens.map((token, index) => {
          if (!token) return null

          const isWord = /[\p{L}\p{N}]/u.test(token)
          if (!isWord) {
            // Punctuation/whitespace - render as-is
            return <span key={index}>{token}</span>
          }

          // Word token - look up status and apply color
          const normalised = token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
          const entry = vocabEntries[normalised]
          const status = entry?.status || 'new'
          const color = getWordColor({ language, status })

          return (
            <span
              key={index}
              className="karaoke-word"
              style={{ color }}
              onClick={(e) => onWordClick?.(token, e)}
            >
              {token}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default KaraokeSubtitles
