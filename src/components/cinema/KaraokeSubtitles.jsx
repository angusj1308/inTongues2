import { useMemo, memo, useState } from 'react'

// Eye icon for tracking toggle
const EyeIcon = ({ open }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
)

// Soft pastel colors for subtitles (better on dark backgrounds)
const SOFT_SUBTITLE_COLORS = {
  new: '#FFB088', // soft peach/coral instead of harsh orange
  // Soft versions of language colors (mixed with white)
  blue: '#93B5F5',    // soft blue
  red: '#F5A3A3',     // soft red/pink
  green: '#8ED5A8',   // soft green
  orange: '#FFCC99',  // soft orange
  grey: '#B8BCC2',    // soft grey
}

// Helper to get soft language color for subtitles
const getSoftLanguageColor = (language) => {
  if (!language) return SOFT_SUBTITLE_COLORS.blue
  const lang = language.toLowerCase()

  // Blue languages
  if (['english', 'french', 'swedish', 'norwegian', 'finnish', 'greek', 'ukrainian', 'romanian', 'malay', 'filipino'].includes(lang)) {
    return SOFT_SUBTITLE_COLORS.blue
  }
  // Red languages
  if (['spanish', 'mandarin', 'japanese', 'korean', 'russian', 'polish', 'vietnamese', 'czech', 'thai', 'turkish', 'danish', 'indonesian'].includes(lang)) {
    return SOFT_SUBTITLE_COLORS.red
  }
  // Green languages
  if (['italian', 'portuguese', 'arabic', 'hindi', 'swahili', 'zulu', 'hungarian'].includes(lang)) {
    return SOFT_SUBTITLE_COLORS.green
  }
  // Orange
  if (lang === 'dutch') return SOFT_SUBTITLE_COLORS.orange
  // Grey
  if (['german', 'hebrew'].includes(lang)) return SOFT_SUBTITLE_COLORS.grey

  return SOFT_SUBTITLE_COLORS.blue
}

// Get highlight color directly based on word status (soft colors for subtitles)
function getWordColor({ language, status }) {
  // Known words are white
  if (status === 'known') return '#ffffff'
  // New words get soft peach
  if (status === 'new') return SOFT_SUBTITLE_COLORS.new
  // Learning words use soft language color
  return getSoftLanguageColor(language)
}

const KaraokeWord = memo(({
  word,
  isActive,
  isPast,
  status,
  language,
  onWordClick,
  trackingEnabled,
}) => {
  const color = getWordColor({ language, status })

  const classNames = ['karaoke-word']
  if (trackingEnabled && isActive) classNames.push('karaoke-word--active')
  if (trackingEnabled && isPast) classNames.push('karaoke-word--past')
  if (trackingEnabled && !isActive && !isPast) classNames.push('karaoke-word--future')

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
  const [trackingEnabled, setTrackingEnabled] = useState(false)

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
        <button
          className={`karaoke-tracking-toggle${trackingEnabled ? ' karaoke-tracking-toggle--active' : ''}`}
          onClick={() => setTrackingEnabled(!trackingEnabled)}
          title={trackingEnabled ? 'Disable word tracking' : 'Enable word tracking'}
        >
          <EyeIcon open={trackingEnabled} />
        </button>
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
                trackingEnabled={trackingEnabled}
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
