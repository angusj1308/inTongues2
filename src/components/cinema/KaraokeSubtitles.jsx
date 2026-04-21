import { useMemo, memo, useState } from 'react'
import { LIGHT_HIGHLIGHTS } from '../../constants/highlightColors'
import { normaliseExpression } from '../../services/vocab'

// Eye icon for tracking toggle. Inactive vs active is signalled via CSS
// opacity on `currentColor`, not a separate closed/slashed variant — the eye
// stays legibly an eye in both states.
const EyeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12 C 6 5, 9 4, 12 4 C 15 4, 18 5, 21 12" strokeWidth="2" />
    <path d="M3 12 C 6 17, 9 18, 12 18 C 15 18, 18 17, 21 12" strokeWidth="1.2" />
    <path d="M3 12 L 4.6 11.3 M3 12 L 4.6 12.7" strokeWidth="1.2" />
    <circle cx="12" cy="12" r="3.2" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <line x1="7" y1="4.8" x2="6" y2="2.8" strokeWidth="1.2" />
    <line x1="10" y1="4" x2="9.6" y2="1.8" strokeWidth="1.2" />
    <line x1="14" y1="4" x2="14.4" y2="1.8" strokeWidth="1.2" />
    <line x1="17" y1="4.8" x2="18" y2="2.8" strokeWidth="1.2" />
  </svg>
)

// Map vocab status to a CSS color reference. The `var(--hlt-…)` references
// resolve at render time against whatever palette the user has chosen
// (terracotta / sage / slate, light or dark variant), so cinema stays
// visually consistent with the reader's word highlights.
//
// Previously this used JS hex blending (parseInt on HIGHLIGHT_COLOR.slice(1,3)
// then mixing with white), which broke when HIGHLIGHT_COLOR was refactored
// from a hex literal into a CSS-variable reference string ('var(--hlt-new)').
// `parseInt('ar', 16)` is NaN; the inline `color: rgb(NaN,NaN,NaN)` was
// invalid; the browser fell through to .karaoke-word's default white. Every
// word rendered white regardless of status — which is the bug the user saw.
function getWordColor({ status, showWordStatus = true }) {
  // Header toggle / panel toggle is OFF → render every word as plain white.
  // Honoured by both render branches below (word-timed karaoke + fallback).
  if (!showWordStatus) return '#ffffff'
  if (status === 'known') return '#ffffff'
  return LIGHT_HIGHLIGHTS[status] || LIGHT_HIGHLIGHTS.new
}

const KaraokeWord = memo(({
  word,
  isActive,
  isPast,
  status,
  showWordStatus,
  onWordClick,
  trackingEnabled,
}) => {
  const color = getWordColor({ status, showWordStatus })

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

  // Find active segment based on current time.
  // MUST be declared before `wordExpressionMap` below — that useMemo
  // references activeSegment in its callback body AND in its deps array.
  // Previously declared after wordExpressionMap, which hit the let/const
  // temporal dead zone during render and threw "Cannot access 'activeSegment'
  // before initialization", crashing the whole cinema page.
  const activeSegment = useMemo(() => {
    if (!segments.length) return null
    const time = Math.max(0, Number(currentTime) || 0)

    return segments.find(
      (segment) => time >= segment.start && time < segment.end
    ) || null
  }, [segments, currentTime])

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
            <EyeIcon />
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
                showWordStatus={showWordStatus}
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
            const color = getWordColor({ status: segment.status, showWordStatus })
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
            const color = getWordColor({ status, showWordStatus })

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
