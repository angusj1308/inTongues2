import { useMemo, memo, useState } from 'react'
import { HIGHLIGHT_COLOR } from '../../constants/highlightColors'
import { normaliseExpression } from '../../services/vocab'

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

// Blend intensity based on status (how much of the orange color vs white)
// Higher = more color, lower = more white
const STATUS_INTENSITY = {
  new: 1.0,          // full orange intensity
  unknown: 1.0,      // full orange intensity
  recognised: 0.7,   // 70% color, 30% white
  familiar: 0.4,     // 40% color, 60% white
}

// Blend a hex color with white based on intensity (0-1)
const blendWithWhite = (hex, intensity) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const blendedR = Math.round(r * intensity + 255 * (1 - intensity))
  const blendedG = Math.round(g * intensity + 255 * (1 - intensity))
  const blendedB = Math.round(b * intensity + 255 * (1 - intensity))

  return `rgb(${blendedR}, ${blendedG}, ${blendedB})`
}

// Get highlight color based on word status - all orange, fading to white
function getWordColor({ status }) {
  // Known words are white
  if (status === 'known') return '#ffffff'

  // All learning statuses use orange blended with white based on status
  const intensity = STATUS_INTENSITY[status] || 1.0
  return blendWithWhite(HIGHLIGHT_COLOR, intensity)
}

const KaraokeWord = memo(({
  word,
  isActive,
  isPast,
  status,
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
  defaultTrackingEnabled = false,
  showTrackingToggle = true,
  contentExpressions = [],
}) => {
  const [trackingEnabled, setTrackingEnabled] = useState(defaultTrackingEnabled)

  // Build set of detected expression texts for matching
  const detectedExpressionTexts = useMemo(() => {
    const userExpressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))

    const detected = (contentExpressions || [])
      .map((expr) => normaliseExpression(expr.text || ''))
      .filter((t) => t.includes(' '))

    return [...new Set([...userExpressions, ...detected])]
      .sort((a, b) => b.length - a.length)
  }, [contentExpressions, vocabEntries])

  // For word-timing path: map word indices to expression groups
  const wordExpressionMap = useMemo(() => {
    if (!activeSegment?.words?.length || !detectedExpressionTexts.length) return {}

    const words = activeSegment.words
    const lowerWords = words.map((w) => w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    const map = {} // index -> { expressionText, indices }

    for (const expr of detectedExpressionTexts) {
      const exprParts = expr.split(/\s+/)
      for (let i = 0; i <= lowerWords.length - exprParts.length; i++) {
        const match = exprParts.every((part, j) => lowerWords[i + j] === part)
        if (match) {
          const fullText = words.slice(i, i + exprParts.length).map((w) => w.text).join(' ')
          for (let j = 0; j < exprParts.length; j++) {
            map[i + j] = { expressionText: fullText, indices: Array.from({ length: exprParts.length }, (_, k) => i + k) }
          }
        }
      }
    }

    return map
  }, [activeSegment, detectedExpressionTexts])

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
    // Don't show anything when no segments - prevents empty black box
    return null
  }

  if (!activeSegment) {
    // Don't show anything when waiting - no black box
    return null
  }

  // If segment has no text content, don't show the box
  const hasContent = activeSegment.text?.trim() || activeSegment.words?.length > 0
  if (!hasContent) {
    return null
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
        {showTrackingToggle && (
          <button
            className={`karaoke-tracking-toggle${trackingEnabled ? ' karaoke-tracking-toggle--active' : ''}`}
            onClick={() => setTrackingEnabled(!trackingEnabled)}
            title={trackingEnabled ? 'Disable word tracking' : 'Enable word tracking'}
          >
            <EyeIcon open={trackingEnabled} />
          </button>
        )}
        <div className={`karaoke-line${isInGap ? ' karaoke-line--gap' : ''}`}>
          {activeSegment.words.map((word, index) => {
            const normalised = word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
            const entry = vocabEntries[normalised]
            const status = entry?.status || 'new'

            // If this word is part of an expression, clicking sends the full expression
            const exprInfo = wordExpressionMap[index]
            const handleWordClick = exprInfo
              ? (text, event) => onWordClick?.(exprInfo.expressionText, event)
              : onWordClick

            return (
              <KaraokeWord
                key={`${word.start}-${index}`}
                word={word}
                isActive={index === activeWordIndex}
                isPast={index < activeWordIndex || isInGap}
                status={status}
                onWordClick={handleWordClick}
                trackingEnabled={trackingEnabled}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // Fallback: no word-level timing - use expression-aware segmentation
  const fallbackText = activeSegment.text || ''
  const isWordChar = (ch) => ch && /\p{L}|\p{N}/u.test(ch)

  const fallbackSegments = (() => {
    if (!fallbackText || !detectedExpressionTexts.length) return [{ type: 'text', text: fallbackText }]

    const result = []
    let idx = 0
    const lower = fallbackText.toLowerCase()

    while (idx < fallbackText.length) {
      let matched = null
      for (const expr of detectedExpressionTexts) {
        if (lower.slice(idx, idx + expr.length) === expr) {
          const before = idx === 0 ? '' : lower[idx - 1]
          const after = idx + expr.length >= lower.length ? '' : lower[idx + expr.length]
          if (!isWordChar(before) && !isWordChar(after)) {
            matched = expr
            break
          }
        }
      }
      if (matched) {
        result.push({ type: 'phrase', text: fallbackText.slice(idx, idx + matched.length), status: vocabEntries[matched]?.status || 'new' })
        idx += matched.length
      } else {
        let next = fallbackText.length
        for (const expr of detectedExpressionTexts) {
          const fi = lower.indexOf(expr, idx)
          if (fi !== -1 && fi < next) next = fi
        }
        result.push({ type: 'text', text: fallbackText.slice(idx, next) })
        idx = next
      }
    }
    return result
  })()

  return (
    <div
      className="karaoke-subtitles"
      onMouseUp={onWordSelect}
      style={{ cursor: 'pointer', userSelect: 'text' }}
    >
      <div className="karaoke-line karaoke-line--no-words">
        {fallbackSegments.map((segment, segIdx) => {
          if (segment.type === 'phrase') {
            const color = getWordColor({ status: segment.status })
            return (
              <span
                key={`phrase-${segIdx}`}
                className="karaoke-word"
                style={{ color }}
                onClick={(e) => onWordClick?.(segment.text, e)}
              >
                {segment.text}
              </span>
            )
          }

          const tokens = (segment.text || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)
          return tokens.map((token, index) => {
            if (!token) return null

            const isW = /[\p{L}\p{N}]/u.test(token)
            if (!isW) return <span key={`${segIdx}-${index}`}>{token}</span>

            const normalised = token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
            const entry = vocabEntries[normalised]
            const status = entry?.status || 'new'
            const color = getWordColor({ status })

            return (
              <span
                key={`${segIdx}-${index}`}
                className="karaoke-word"
                style={{ color }}
                onClick={(e) => onWordClick?.(token, e)}
              >
                {token}
              </span>
            )
          })
        })}
      </div>
    </div>
  )
}

export default KaraokeSubtitles
