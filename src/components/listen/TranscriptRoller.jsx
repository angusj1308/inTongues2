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

// Must match the line-activation offset in AudioPlayer.jsx so the
// predictive scroll lands exactly when the highlight flips.
const ACTIVE_LINE_OFFSET_S = 0.25
// Match the duration used in the rAF scroll animation below — the
// lookahead window for predictive scroll has to equal the scroll's
// settle time so it arrives just as the new line lights up.
const SCROLL_DURATION_MS = 750

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
  currentTime = null,
}) => {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const itemRefs = useRef([])
  const [hasTopFade, setHasTopFade] = useState(false)
  const [hasBottomFade, setHasBottomFade] = useState(false)
  const programmaticScrollRef = useRef(false)
  const clearProgrammaticTimerRef = useRef(null)
  const scrollAnimationFrameRef = useRef(null)

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
  }, [activeIndex, contentExpressions, language, onSelectionTranslate, onWordClick, segments, showWordStatus, vocabEntries])

  const scrollToIndex = useCallback((index) => {
    const container = containerRef.current
    const track = trackRef.current
    const targetItem = itemRefs.current[index]

    if (!container || !track || !targetItem) return

    const containerHeight = container.clientHeight
    const trackHeight = track.scrollHeight
    const itemCenter = targetItem.offsetTop + targetItem.offsetHeight / 2
    const targetCenter = containerHeight * 0.40
    const desiredScrollTop = itemCenter - targetCenter

    const maxScroll = Math.max(0, trackHeight - containerHeight)
    const nextScrollTop = Math.min(Math.max(0, desiredScrollTop), maxScroll)

    programmaticScrollRef.current = true

    // Custom rAF-driven scroll over SCROLL_DURATION_MS with a cubic-out
    // ease — paired with the predictive trigger below, the animation
    // settles right when the highlight flips to this index, so the user
    // never has to read a line that's still in motion.
    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current)
      scrollAnimationFrameRef.current = null
    }
    const startTop = container.scrollTop
    const distance = nextScrollTop - startTop
    if (Math.abs(distance) < 1) {
      container.scrollTop = nextScrollTop
    } else {
      const startTime = performance.now()
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
      const step = (now) => {
        const progress = Math.min((now - startTime) / SCROLL_DURATION_MS, 1)
        container.scrollTop = startTop + distance * easeOutCubic(progress)
        if (progress < 1) {
          scrollAnimationFrameRef.current = requestAnimationFrame(step)
        } else {
          scrollAnimationFrameRef.current = null
        }
      }
      scrollAnimationFrameRef.current = requestAnimationFrame(step)
    }

    if (clearProgrammaticTimerRef.current) {
      clearTimeout(clearProgrammaticTimerRef.current)
    }

    clearProgrammaticTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false
    }, 1000)
  }, [])

  // Segment-level activation times: when the active-line highlight will
  // flip to each segment, equal to segment.start + the offset we use in
  // AudioPlayer's activeTranscriptIndex calculation. Used for predictive
  // scroll lookahead so the scroll lands exactly on each flip.
  const segmentActivationTimes = useMemo(() => {
    return segments.map((segment) =>
      Number.isFinite(segment?.start) ? segment.start + ACTIVE_LINE_OFFSET_S : null,
    )
  }, [segments])

  const lastScrolledIndexRef = useRef(-1)

  // Predictive scroll: at each playback tick figure out which segment
  // will be active SCROLL_DURATION_MS from now, and start scrolling to
  // it. The motion runs DURING the tail of the current line and arrives
  // settled exactly when the next line lights up — so the user never
  // reads a line that's still in motion. Falls back to scrolling to the
  // currently-active index when timestamps aren't available.
  useEffect(() => {
    if (!isSynced) return
    if (!segments.length) return

    let targetIndex = activeIndex
    if (Number.isFinite(currentTime)) {
      const lookAhead = currentTime + SCROLL_DURATION_MS / 1000
      let predicted = -1
      for (let i = 0; i < segmentActivationTimes.length; i += 1) {
        const t = segmentActivationTimes[i]
        if (t === null) continue
        if (t <= lookAhead) predicted = i
        else break
      }
      if (predicted >= 0) targetIndex = predicted
    }

    if (targetIndex === lastScrolledIndexRef.current) return
    lastScrolledIndexRef.current = targetIndex
    scrollToIndex(targetIndex)
  }, [activeIndex, currentTime, isSynced, segments, segmentActivationTimes, syncToken, scrollToIndex])

  // Re-scroll on resize and on sync-restore (user clicked Sync after
  // manual scroll) to make sure the active line is back in view.
  useEffect(() => {
    const handleResize = () => {
      if (isSynced) {
        lastScrolledIndexRef.current = -1 // force re-scroll on next effect
        scrollToIndex(activeIndex)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isSynced, activeIndex, scrollToIndex])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 2

      setHasTopFade(scrollTop > threshold)
      setHasBottomFade(scrollTop + clientHeight < scrollHeight - threshold)

      if (programmaticScrollRef.current) return

      if (container.matches(':hover')) {
        if (onUserScroll) {
          onUserScroll()
        }
      }
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll()

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [onUserScroll])

  useEffect(() => () => {
    if (clearProgrammaticTimerRef.current) {
      clearTimeout(clearProgrammaticTimerRef.current)
    }
    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current)
    }
  }, [])

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
            return (
              <div
                key={segment.key}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                className={`transcript-line ${forceAllActive || segment.isActive ? 'active' : ''}`}
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
