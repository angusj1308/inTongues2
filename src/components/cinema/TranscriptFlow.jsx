import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normaliseExpression } from '../../services/vocab'
import WordTokenListening from '../listen/WordTokenListening'

// Cinema transcript in "flow" mode: the whole transcript is one continuous
// block of words that wraps to whatever width the panel currently is. The
// auto-scroll is driven by word-level timing via requestAnimationFrame —
// the scroll position interpolates between consecutive word positions so
// the transcript glides under the viewport at the pace of the speaker
// rather than snapping from segment to segment.
//
// Sync / unsync / click-to-translate / selection-to-translate are all
// preserved, same as the row-per-segment TranscriptRoller.

const TERMINAL_PUNCTUATION = /[.!?…。！？]\s*$/

const getDisplayStatus = (status) => {
  if (!status) return 'new'
  if (status === 'unknown' || status === 'recognised' || status === 'familiar' || status === 'known') return status
  return 'new'
}

const isWordToken = (token) => /[\p{L}\p{N}]/u.test(token)

// Flatten all segments into a single array of entries, each either a word
// (with timing) or a boundary marker between segments (used to decide soft
// paragraph breaks).
const buildFlowEntries = (segments) => {
  const entries = []
  segments.forEach((segment, segIdx) => {
    const segStart = Number.isFinite(segment.start) ? segment.start : 0
    const segEnd = Number.isFinite(segment.end) ? segment.end : segStart + 1
    const segDuration = Math.max(0.001, segEnd - segStart)

    const segmentWords = []
    if (Array.isArray(segment.words) && segment.words.length) {
      for (const w of segment.words) {
        const text = (w.text ?? '').toString()
        if (!text) continue
        const start = Number.isFinite(w.start) ? w.start : segStart
        const end = Number.isFinite(w.end) ? w.end : start + segDuration / segment.words.length
        segmentWords.push({ type: 'word', text, start, end, segIdx })
      }
    } else {
      // Fallback: split segment text into tokens and distribute time evenly
      const tokens = (segment.text || '').split(/(\s+)/).filter(Boolean)
      const wordTokens = tokens.filter((t) => !/^\s+$/.test(t))
      const step = segDuration / Math.max(1, wordTokens.length)
      let cursor = segStart
      for (const token of tokens) {
        if (/^\s+$/.test(token)) continue
        segmentWords.push({
          type: 'word',
          text: token,
          start: cursor,
          end: cursor + step,
          segIdx,
        })
        cursor += step
      }
    }

    if (!segmentWords.length) return

    entries.push(...segmentWords)

    // Soft paragraph break when the segment ended with terminal punctuation
    // or between every segment if we want stronger visual rhythm. We go with
    // terminal punctuation only — keeps related phrases on one run.
    const lastText = segmentWords[segmentWords.length - 1].text
    const isTerminal = TERMINAL_PUNCTUATION.test(lastText)
    entries.push({ type: 'break', soft: !isTerminal, segIdx })
  })
  return entries
}

// Find the active word index for a given time. Linear scan is fine — even
// at hour-long transcripts we're talking a few thousand words; the rAF loop
// eats nanoseconds. If it becomes hot we can switch to a binary search.
const findActiveWordIdx = (words, time) => {
  if (!words.length) return -1
  if (time < words[0].start) return -1
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (time >= w.start && time < w.end) return i
  }
  return words.length - 1
}

const TranscriptFlow = ({
  segments = [],
  vocabEntries = {},
  language,
  onWordClick,
  onSelectionTranslate,
  showWordStatus = false,
  currentTime = 0,
  isSynced = true,
  onUserScroll,
  syncToken = 0,
  contentExpressions = [],
}) => {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const wordRefs = useRef([]) // index → element
  const programmaticScrollRef = useRef(false)
  const clearProgrammaticTimerRef = useRef(null)
  const activeWordElRef = useRef(null)
  const currentTimeRef = useRef(currentTime)
  const [hasTopFade, setHasTopFade] = useState(false)
  const [hasBottomFade, setHasBottomFade] = useState(false)

  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  // Build the flat flow of entries. Words-only list used for scroll lookup.
  const entries = useMemo(() => buildFlowEntries(segments), [segments])
  const words = useMemo(() => entries.filter((e) => e.type === 'word'), [entries])

  // Detected expression set (same as TranscriptRoller — multi-word phrases
  // get the colour of the vocab entry). We match phrases at render time so
  // the inline flow keeps them as a single WordTokenListening.
  const expressions = useMemo(() => {
    const userExpressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))
    const detected = (contentExpressions || [])
      .map((expr) => normaliseExpression(expr.text || ''))
      .filter((t) => t.includes(' '))
    return [...new Set([...userExpressions, ...detected])].sort((a, b) => b.length - a.length)
  }, [contentExpressions, vocabEntries])

  wordRefs.current = []

  // Render the flow as inline spans with <br /> separators between
  // terminal-punctuation segment boundaries. Each word is a WordTokenListening
  // so click / selection / colour behaviour stays identical.
  const renderedFlow = useMemo(() => {
    const nodes = []

    // Pre-compute expression match ranges across the flat word sequence so
    // a multi-word expression like "por favor" renders as a single token.
    const lowerSequence = words.map((w) =>
      normaliseExpression(w.text.replace(/[^\p{L}\p{N}\s'-]/gu, '')),
    )

    const consumed = new Array(words.length).fill(false)
    const phraseSpans = [] // { startIdx, endIdx, text, status }

    for (const phrase of expressions) {
      const parts = phrase.split(/\s+/)
      for (let i = 0; i <= words.length - parts.length; i++) {
        let match = true
        for (let j = 0; j < parts.length; j++) {
          if (consumed[i + j] || lowerSequence[i + j] !== parts[j]) {
            match = false
            break
          }
        }
        if (match) {
          const fullText = words
            .slice(i, i + parts.length)
            .map((w) => w.text)
            .join(' ')
          const status = vocabEntries[phrase]?.status || 'new'
          phraseSpans.push({ startIdx: i, endIdx: i + parts.length - 1, text: fullText, status })
          for (let j = 0; j < parts.length; j++) consumed[i + j] = true
        }
      }
    }
    const phraseByStart = new Map(phraseSpans.map((p) => [p.startIdx, p]))

    let wordCursor = 0
    entries.forEach((entry, entryIdx) => {
      if (entry.type === 'break') {
        if (!entry.soft) {
          nodes.push(<span key={`brk-${entryIdx}`} className="transcript-flow-break" />)
        } else {
          nodes.push(
            <span key={`brk-${entryIdx}`}> </span>,
          )
        }
        return
      }

      const idx = wordCursor
      wordCursor += 1

      if (consumed[idx]) {
        // Either the start of a phrase (render it) or an internal word of
        // one (skip — rendered by the phrase start).
        const phrase = phraseByStart.get(idx)
        if (!phrase) return
        const refIdx = idx
        nodes.push(
          <WordTokenListening
            key={`w-${entryIdx}`}
            text={phrase.text}
            status={getDisplayStatus(phrase.status)}
            language={language}
            listeningMode="extensive"
            enableHighlight={showWordStatus}
            onWordClick={onWordClick}
            onSelectionTranslate={onSelectionTranslate}
            ref={(el) => {
              if (el) wordRefs.current[refIdx] = el
            }}
          />,
        )
        nodes.push(<span key={`sp-${entryIdx}`}> </span>)
        return
      }

      const word = words[idx]
      if (!isWordToken(word.text)) {
        // Pure punctuation token — render as plain span, no status
        nodes.push(<span key={`p-${entryIdx}`}>{word.text}</span>)
        return
      }

      const normalised = normaliseExpression(word.text)
      const entry2 = vocabEntries[normalised]
      const status = getDisplayStatus(entry2?.status)

      nodes.push(
        <WordTokenListening
          key={`w-${entryIdx}`}
          text={word.text}
          status={status}
          language={language}
          listeningMode="extensive"
          enableHighlight={showWordStatus}
          onWordClick={onWordClick}
          onSelectionTranslate={onSelectionTranslate}
          ref={(el) => {
            if (el) wordRefs.current[idx] = el
          }}
        />,
      )
      nodes.push(<span key={`sp-${entryIdx}`}> </span>)
    })

    return nodes
  }, [entries, words, expressions, vocabEntries, language, showWordStatus, onWordClick, onSelectionTranslate])

  // Highlight the word whose [start, end) contains currentTime. We mutate
  // classList directly to avoid re-rendering the whole flow every frame.
  const updateActiveWord = useCallback((time) => {
    const idx = findActiveWordIdx(words, time)
    const nextEl = idx >= 0 ? wordRefs.current[idx] : null
    if (nextEl === activeWordElRef.current) return
    if (activeWordElRef.current) activeWordElRef.current.classList.remove('reader-word--time-active')
    if (nextEl) nextEl.classList.add('reader-word--time-active')
    activeWordElRef.current = nextEl
  }, [words])

  // Drive scroll continuously while synced. Each frame: locate active word,
  // interpolate scrollTop toward its position weighted by progress through
  // the word's [start, end) window.
  useEffect(() => {
    if (!isSynced) return undefined
    let rafId = null
    const tick = () => {
      const container = containerRef.current
      const track = trackRef.current
      if (!container || !track) {
        rafId = requestAnimationFrame(tick)
        return
      }
      const time = currentTimeRef.current
      updateActiveWord(time)

      const idx = findActiveWordIdx(words, time)
      const curEl = idx >= 0 ? wordRefs.current[idx] : null
      if (curEl) {
        const nextEl = idx + 1 < words.length ? wordRefs.current[idx + 1] : null
        const curTop = curEl.offsetTop
        const nextTop = nextEl ? nextEl.offsetTop : curTop
        const w = words[idx]
        const span = Math.max(0.001, w.end - w.start)
        const progress = Math.max(0, Math.min(1, (time - w.start) / span))
        const targetLine = curTop + (nextTop - curTop) * progress

        // Anchor ~40% down the viewport so the active word sits above centre
        const anchor = container.clientHeight * 0.4
        const desired = targetLine - anchor
        const maxScroll = Math.max(0, track.scrollHeight - container.clientHeight)
        const clamped = Math.max(0, Math.min(maxScroll, desired))

        programmaticScrollRef.current = true
        container.scrollTop = clamped
        // Release the programmatic flag a tick later so the scroll listener
        // doesn't treat our own scrollTop write as a user scroll.
        if (clearProgrammaticTimerRef.current) clearTimeout(clearProgrammaticTimerRef.current)
        clearProgrammaticTimerRef.current = setTimeout(() => {
          programmaticScrollRef.current = false
        }, 80)
      }

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (clearProgrammaticTimerRef.current) {
        clearTimeout(clearProgrammaticTimerRef.current)
        clearProgrammaticTimerRef.current = null
      }
    }
  }, [isSynced, words, updateActiveWord, syncToken])

  // When unsynced, keep the active-word highlight tracking the audio even
  // though scroll doesn't follow — user still sees where they are.
  useEffect(() => {
    if (isSynced) return
    updateActiveWord(currentTime)
  }, [isSynced, currentTime, updateActiveWord])

  // Scroll listeners: manage fade-in/out hints and detect manual scroll.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 2
      setHasTopFade(scrollTop > threshold)
      setHasBottomFade(scrollTop + clientHeight < scrollHeight - threshold)

      if (programmaticScrollRef.current) return
      if (container.matches(':hover') && onUserScroll) onUserScroll()
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll()

    return () => container.removeEventListener('scroll', handleScroll)
  }, [onUserScroll])

  return (
    <div
      className={`transcript-roller-window transcript-flow-window ${
        hasTopFade ? 'transcript-roller-window--has-top-fade' : ''
      } ${hasBottomFade ? 'transcript-roller-window--has-bottom-fade' : ''}`}
    >
      <div className="transcript-roller" ref={containerRef}>
        <div className="transcript-flow-track" ref={trackRef}>
          {renderedFlow}
        </div>
      </div>
    </div>
  )
}

export default TranscriptFlow
