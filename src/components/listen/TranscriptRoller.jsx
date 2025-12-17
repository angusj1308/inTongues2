import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normaliseExpression } from '../../services/vocab'
import WordTokenListening from './WordTokenListening'

const getDisplayStatus = (status) => {
  if (!status || status === 'unknown') return 'new'
  if (status === 'recognised' || status === 'familiar' || status === 'known') return status
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
  pageTranslations = {},
  onWordClick,
  showWordStatus = false,
  isSynced = true,
  onUserScroll,
  syncToken = 0,
}) => {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const itemRefs = useRef([])
  const [isAtTop, setIsAtTop] = useState(true)
  const programmaticScrollRef = useRef(false)
  const clearProgrammaticTimerRef = useRef(null)

  itemRefs.current = []

  const renderedSegments = useMemo(() => {
    const expressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))
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
          const status = getDisplayStatus(entry?.status || pageTranslations[normalised]?.status)

          elements.push(
            <WordTokenListening
              key={`word-${segmentIndex}-${index}`}
              text={token}
              status={status}
              language={language}
              listeningMode="extensive"
              enableHighlight={showWordStatus}
              onWordClick={onWordClick}
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
  }, [activeIndex, language, onWordClick, pageTranslations, segments, showWordStatus, vocabEntries])

  const scrollToActive = useCallback(() => {
    const container = containerRef.current
    const track = trackRef.current
    const activeItem = itemRefs.current[activeIndex]

    if (!container || !track || !activeItem) return

    const containerHeight = container.clientHeight
    const trackHeight = track.scrollHeight
    const itemCenter = activeItem.offsetTop + activeItem.offsetHeight / 2
    const targetCenter = containerHeight * 0.35
    const desiredScrollTop = itemCenter - targetCenter

    const maxScroll = Math.max(0, trackHeight - containerHeight)
    const nextScrollTop = Math.min(Math.max(0, desiredScrollTop), maxScroll)

    programmaticScrollRef.current = true
    try {
      if (typeof container.scrollTo === 'function') {
        try {
          container.scrollTo({ top: nextScrollTop, behavior: 'smooth' })
        } catch (err) {
          container.scrollTo(0, nextScrollTop)
        }
      } else {
        container.scrollTop = nextScrollTop
      }
    } catch (err) {
      container.scrollTop = nextScrollTop
    }

    if (clearProgrammaticTimerRef.current) {
      clearTimeout(clearProgrammaticTimerRef.current)
    }

    clearProgrammaticTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false
    }, 450)
  }, [activeIndex])

  useEffect(() => {
    if (isSynced) {
      scrollToActive()
    }
  }, [activeIndex, isSynced, scrollToActive, segments, syncToken])

  useEffect(() => {
    const handleResize = () => {
      if (isSynced) {
        scrollToActive()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isSynced, scrollToActive])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const handleScroll = () => {
      const atTop = container.scrollTop <= 2
      setIsAtTop(atTop)

      if (programmaticScrollRef.current) return

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

  useEffect(() => () => {
    if (clearProgrammaticTimerRef.current) {
      clearTimeout(clearProgrammaticTimerRef.current)
    }
  }, [])

  return (
    <div className={`transcript-roller ${isAtTop ? 'transcript-roller--at-top' : ''}`} ref={containerRef}>
      <div className="transcript-track" ref={trackRef}>
        {renderedSegments.map((segment, index) => (
          <div
            key={segment.key}
            ref={(el) => {
              itemRefs.current[index] = el
            }}
            className={`transcript-line ${segment.isActive ? 'active' : ''}`}
          >
            {segment.content}
          </div>
        ))}
      </div>
    </div>
  )
}

export default TranscriptRoller
