import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normaliseExpression } from '../../services/vocab'
import WordTokenListening from './WordTokenListening'

const getDisplayStatus = (status) => {
  if (!status) return 'new'
  if (status === 'unknown' || status === 'recognised' || status === 'familiar' || status === 'known') return status
  return 'new'
}

const isWordChar = (char) => /[\p{L}\p{N}]/u.test(char)

const segmentTextByExpressions = (text, expressions = [], vocabEntries = {}) => {
  if (!text) return []

  const segments = []
  let index = 0
  const lowerText = text.toLowerCase()

  while (index < text.length) {
    let matchedExpression = null

    for (const expression of expressions) {
      const exprIndex = lowerText.indexOf(expression, index)

      if (exprIndex === index) {
        matchedExpression = expression
        break
      }

      if (exprIndex !== -1 && exprIndex < lowerText.length) {
        const before = lowerText[exprIndex - 1]
        const after = lowerText[exprIndex + expression.length]

        const isWholeWord = !isWordChar(before) && !isWordChar(after)
        if (isWholeWord && exprIndex === index) {
          matchedExpression = expression
          break
        }
      }
    }

    if (matchedExpression) {
      const status = vocabEntries[matchedExpression]?.status || 'new'
      segments.push({ type: 'phrase', text: text.slice(index, index + matchedExpression.length), status })
      index += matchedExpression.length
      continue
    }

    let nextIndex = text.length
    for (const expression of expressions) {
      const foundIndex = lowerText.indexOf(expression, index)
      if (foundIndex !== -1 && foundIndex < nextIndex) {
        nextIndex = foundIndex
      }
    }

    if (nextIndex === text.length) {
      segments.push({ type: 'text', text: text.slice(index) })
      break
    }

    segments.push({ type: 'text', text: text.slice(index, nextIndex) })
    index = nextIndex
  }

  return segments
}

const TranscriptRoller = ({
  segments = [],
  activeIndex = 0,
  vocabEntries = {},
  language,
  onWordClick,
  onSelectionTranslate,
  showWordStatus = false,
  isSynced = true,
  onUserScroll,
  syncToken = 0,
  contentExpressions = [],
  forceAllActive = false,
  lyricsTranslations = [],
  onLineClick = null,
}) => {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const itemRefs = useRef([])
  const [hasTopFade, setHasTopFade] = useState(false)
  const [hasBottomFade, setHasBottomFade] = useState(false)
  // Suppresses the onUserScroll callback for the brief moment after the
  // syncToken snap programmatically sets scrollTop — otherwise that
  // scroll event would immediately flip the user back out of sync.
  const suppressUserScrollRef = useRef(false)

  itemRefs.current = []

  const renderedSegments = useMemo(() => {
    const userExpressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))

    const detectedExpressions = (contentExpressions || [])
      .map((expr) => normaliseExpression(expr.text || ''))
      .filter((t) => t.includes(' '))

    const expressions = [...new Set([...userExpressions, ...detectedExpressions])]
      .sort((a, b) => b.length - a.length)

    const renderWordSegments = (text = '') => {
      const elements = []
      const segmentsWithExpressions = segmentTextByExpressions(text || '', expressions, vocabEntries)

      segmentsWithExpressions.forEach((segment, segmentIndex) => {
        if (segment.type === 'phrase') {
          elements.push(
            <WordTokenListening
              key={`phrase-${segmentIndex}`}
              text={segment.text}
              status={getDisplayStatus(segment.status)}
              language={language}
              listeningMode="extensive"
              enableHighlight={showWordStatus}
              onWordClick={onWordClick}
              onSelectionTranslate={onSelectionTranslate}
              requireDoubleClick={!!onLineClick}
            />,
          )
          return
        }

        const tokens = (segment.text || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)

        tokens.forEach((token, index) => {
          if (!token) return

          const isWord = /[\p{L}\p{N}]/u.test(token)

          if (!isWord) {
            elements.push(
              <span key={`separator-${segmentIndex}-${index}`}>{token}</span>,
            )
            return
          }

          const normalised = normaliseExpression(token)
          const entry = vocabEntries[normalised]
          const status = getDisplayStatus(entry?.status)

          elements.push(
            <WordTokenListening
              key={`word-${segmentIndex}-${index}`}
              text={token}
              status={status}
              language={language}
              listeningMode="extensive"
              enableHighlight={showWordStatus}
              onWordClick={onWordClick}
              onSelectionTranslate={onSelectionTranslate}
              requireDoubleClick={!!onLineClick}
            />,
          )
        })
      })

      return elements
    }

    return segments.map((segment, index) => ({
      key: `${segment.start ?? index}-${segment.text?.slice(0, 12) || index}`,
      content: renderWordSegments(segment.text || ''),
      isActive: index === activeIndex,
    }))
  }, [activeIndex, contentExpressions, language, onSelectionTranslate, onWordClick, onLineClick, segments, showWordStatus, vocabEntries])

  // Auto-scroll is killed for music: the active-line highlight still
  // tracks playback, but the transcript no longer follows it. The user
  // scrolls manually. The Sync button (in TranscriptPanel) bumps the
  // syncToken — when that happens, snap the active line back into view
  // so the user can re-locate after scrolling away. Instant set, no
  // animation, no rAF.
  useEffect(() => {
    if (!isSynced) return
    const container = containerRef.current
    const activeItem = itemRefs.current[activeIndex]
    if (!container || !activeItem) return
    const containerHeight = container.clientHeight
    const itemCenter = activeItem.offsetTop + activeItem.offsetHeight / 2
    const targetCenter = containerHeight * 0.40
    suppressUserScrollRef.current = true
    container.scrollTop = Math.max(0, itemCenter - targetCenter)
    setTimeout(() => { suppressUserScrollRef.current = false }, 100)
    // activeIndex intentionally not a dep — we don't want to snap on
    // every line change, only when the user re-syncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynced, syncToken])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 2

      setHasTopFade(scrollTop > threshold)
      setHasBottomFade(scrollTop + clientHeight < scrollHeight - threshold)

      // Any scroll while not suppressed is user-driven — flip sync
      // state so the Sync button can re-snap them to active later.
      if (suppressUserScrollRef.current) return
      if (onUserScroll) {
        onUserScroll()
      }
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll()

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [onUserScroll])

  return (
    <div
      className={`transcript-roller-window ${
        hasTopFade ? 'transcript-roller-window--has-top-fade' : ''
      } ${hasBottomFade ? 'transcript-roller-window--has-bottom-fade' : ''}`}
    >
      <div className="transcript-roller" ref={containerRef}>
        <div className="transcript-track" ref={trackRef}>
          {renderedSegments.map((segment, index) => {
            const translation = lyricsTranslations[index]
            const sourceSegment = segments[index]
            const handleLineClick = onLineClick && sourceSegment
              ? () => onLineClick(sourceSegment)
              : undefined
            return (
              <div
                key={segment.key}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                className={`transcript-line ${forceAllActive || segment.isActive ? 'active' : ''} ${handleLineClick ? 'is-clickable' : ''}`}
                onClick={handleLineClick}
                role={handleLineClick ? 'button' : undefined}
                tabIndex={handleLineClick ? 0 : undefined}
                onKeyDown={handleLineClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleLineClick()
                      }
                    }
                  : undefined}
              >
                {segment.content}
                {translation ? (
                  <div className="transcript-line-translation">{translation}</div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TranscriptRoller
