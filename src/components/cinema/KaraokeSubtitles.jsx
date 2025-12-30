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

// Soft pastel colors for subtitles by status (better on dark backgrounds)
// Progression: warm (needs attention) → cool (progressing) → white (mastered)
const SOFT_STATUS_COLORS = {
  new: '#FFB088',        // soft peach - never seen this word
  unknown: '#F5A3A3',    // soft red/pink - seen but don't know
  recognised: '#C4A3F5', // soft purple - starting to recognize
  familiar: '#93B5F5',   // soft blue - almost there
  known: '#ffffff',      // white - mastered
}

// Get highlight color based on word status
function getWordColor({ status }) {
  return SOFT_STATUS_COLORS[status] || SOFT_STATUS_COLORS.new
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
  const color = getWordColor({ status })

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
          const color = getWordColor({ status })

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
