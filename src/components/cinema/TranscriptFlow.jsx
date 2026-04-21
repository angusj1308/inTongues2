import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normaliseExpression } from '../../services/vocab'
import WordTokenListening from '../listen/WordTokenListening'

// Eye icon for the tracking toggle — same affordance as KaraokeSubtitles.
// Inactive vs active is signalled via CSS opacity on `currentColor`, so the
// eye stays legibly an eye in both states (no slash / closed variant).
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
  const [trackingEnabled, setTrackingEnabled] = useState(false)
  const trackedActiveIdxRef = useRef(-1)

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

  // NOTE: don't reset wordRefs.current on every render. Ref callbacks only
  // fire on mount / unmount; if we wiped the array each render, refs would
  // stay empty after the first commit and the rAF loop would have no DOM
  // elements to measure. We let refs repopulate naturally as words mount.

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
        const startIdx = phrase.startIdx
        const endIdx = phrase.endIdx
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
              if (!el) return
              // Point every word index covered by the phrase at this node
              // so the rAF scroll loop always finds a DOM element even when
              // the active time falls inside the middle of the phrase.
              for (let k = startIdx; k <= endIdx; k++) {
                wordRefs.current[k] = el
              }
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

  // No passive active-word treatment. Subtitle parity: a word is only
  // visually highlighted when the tracking toggle is on (past/active/future
  // opacity classes). Kept as a noop placeholder so the existing call sites
  // in the rAF loop and the unsynced effect don't need branching.
  const updateActiveWord = useCallback(() => {}, [])

  // Karaoke-style past/active/future tracking. When enabled, every word gets
  // one of .reader-word--tp-past / --tp-active / --tp-future so CSS can dim
  // past or future words. Repainted only when the active-word index changes,
  // not every rAF tick.
  const applyTrackingClasses = useCallback((activeIdx) => {
    const refs = wordRefs.current
    // Pass 1: remove any existing tracking classes from unique elements.
    const seen = new Set()
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i]
      if (!el || seen.has(el)) continue
      seen.add(el)
      el.classList.remove('reader-word--tp-past', 'reader-word--tp-active', 'reader-word--tp-future')
    }
    if (activeIdx < 0) return
    // Pass 2: write fresh state. Last-write-wins on phrase elements gives
    // the phrase the state of its latest index, which is the natural reading
    // order (phrase moves from future → active → past as time progresses).
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i]
      if (!el) continue
      const state = i < activeIdx ? 'past' : i === activeIdx ? 'active' : 'future'
      el.classList.remove('reader-word--tp-past', 'reader-word--tp-active', 'reader-word--tp-future')
      el.classList.add(`reader-word--tp-${state}`)
    }
  }, [])

  // Apply / clear tracking as the toggle flips and as the active word moves.
  useEffect(() => {
    if (!trackingEnabled) {
      const refs = wordRefs.current
      const seen = new Set()
      for (let i = 0; i < refs.length; i++) {
        const el = refs[i]
        if (!el || seen.has(el)) continue
        seen.add(el)
        el.classList.remove('reader-word--tp-past', 'reader-word--tp-active', 'reader-word--tp-future')
      }
      trackedActiveIdxRef.current = -1
      return
    }
    const idx = findActiveWordIdx(words, currentTimeRef.current)
    trackedActiveIdxRef.current = idx
    applyTrackingClasses(idx)
  }, [trackingEnabled, words, applyTrackingClasses])

  // Build a cached list of "lines" — runs of words that share the same
  // offsetTop. Each line knows its y, start time (first word), and (via
  // lookup into the next line) where to scroll to next. Recomputed on
  // mount and whenever the container resizes, since line wrapping is
  // layout-dependent.
  const linesRef = useRef([])
  const recomputeLines = useCallback(() => {
    const lines = []
    let current = null
    for (let i = 0; i < words.length; i++) {
      const el = wordRefs.current[i]
      if (!el) continue
      const y = el.offsetTop
      if (!current || current.y !== y) {
        current = { y, startTime: words[i].start }
        lines.push(current)
      }
    }
    // Annotate each line with the NEXT line's y + start time so the rAF
    // loop can interpolate over the time window between them.
    for (let i = 0; i < lines.length; i++) {
      const next = lines[i + 1]
      lines[i].nextY = next ? next.y : lines[i].y
      lines[i].nextStartTime = next ? next.startTime : lines[i].startTime + 1
    }
    linesRef.current = lines
  }, [words])

  useEffect(() => {
    // Run after paint so offsetTop is populated.
    const timer = setTimeout(recomputeLines, 50)
    return () => clearTimeout(timer)
  }, [recomputeLines])

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => recomputeLines())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [recomputeLines])

  // Line-anchored scroll. We don't care about individual words — we
  // interpolate scroll position over a whole line's time span, then
  // smoothly lerp the current scrollTop toward that target. Result: the
  // scroll moves continuously throughout a line (proportional to how
  // much of the line's time has elapsed), and only speeds up / slows
  // down at line boundaries — where speaker rhythm naturally changes.
  useEffect(() => {
    if (!isSynced) return undefined
    if (!words.length) return undefined

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

      if (trackingEnabled) {
        const idx = findActiveWordIdx(words, time)
        if (idx !== trackedActiveIdxRef.current) {
          trackedActiveIdxRef.current = idx
          applyTrackingClasses(idx)
        }
      }

      const lines = linesRef.current
      if (lines.length) {
        // Binary-ish lookup: find the line whose startTime ≤ time < next.
        let lineIdx = 0
        for (let i = 0; i < lines.length; i++) {
          if (time >= lines[i].startTime) lineIdx = i
          else break
        }
        const line = lines[lineIdx]
        const span = Math.max(0.001, line.nextStartTime - line.startTime)
        const progress = Math.max(0, Math.min(1, (time - line.startTime) / span))
        const interpY = line.y + (line.nextY - line.y) * progress
        const rawTarget = interpY - container.clientHeight * 0.4
        const maxScroll = Math.max(0, track.scrollHeight - container.clientHeight)
        const target = Math.max(0, Math.min(maxScroll, rawTarget))

        // Gentle lerp for extra smoothness on top of the continuous target.
        const current = container.scrollTop
        const next = current + (target - current) * 0.1

        programmaticScrollRef.current = true
        container.scrollTop = next
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
  }, [isSynced, words, updateActiveWord, syncToken, trackingEnabled, applyTrackingClasses])

  // When unsynced, keep the active-word highlight tracking the audio even
  // though scroll doesn't follow — user still sees where they are.
  useEffect(() => {
    if (isSynced) return
    updateActiveWord(currentTime)
    if (trackingEnabled) {
      const idx = findActiveWordIdx(words, currentTime)
      if (idx !== trackedActiveIdxRef.current) {
        trackedActiveIdxRef.current = idx
        applyTrackingClasses(idx)
      }
    }
  }, [isSynced, currentTime, updateActiveWord, trackingEnabled, words, applyTrackingClasses])

  // Scroll listener: manage fade-in/out hints only. User-vs-programmatic
  // disambiguation is done in a separate effect below via input events, so
  // this handler doesn't need to guess which kind of scroll just happened.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 2
      setHasTopFade(scrollTop > threshold)
      setHasBottomFade(scrollTop + clientHeight < scrollHeight - threshold)
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll()

    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Break sync the moment the user tries to scroll the transcript. We listen
  // on raw input events (wheel / touch / scroll-related keys) instead of the
  // scroll event because the auto-scroll rAF loop writes scrollTop every
  // frame and would otherwise drown out any "was this scroll from the user?"
  // heuristic. These input events are only fired by real users, never by the
  // programmatic scrollTop assignments in the sync loop.
  useEffect(() => {
    if (!onUserScroll) return undefined
    const container = containerRef.current
    if (!container) return undefined

    const SCROLL_KEYS = new Set([
      'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ',
    ])
    const handleUserInput = () => onUserScroll()
    const handleKey = (event) => {
      if (SCROLL_KEYS.has(event.key)) onUserScroll()
    }

    container.addEventListener('wheel', handleUserInput, { passive: true })
    container.addEventListener('touchstart', handleUserInput, { passive: true })
    container.addEventListener('touchmove', handleUserInput, { passive: true })
    container.addEventListener('keydown', handleKey)

    return () => {
      container.removeEventListener('wheel', handleUserInput)
      container.removeEventListener('touchstart', handleUserInput)
      container.removeEventListener('touchmove', handleUserInput)
      container.removeEventListener('keydown', handleKey)
    }
  }, [onUserScroll])

  return (
    <div
      className={`transcript-roller-window transcript-flow-window ${
        hasTopFade ? 'transcript-roller-window--has-top-fade' : ''
      } ${hasBottomFade ? 'transcript-roller-window--has-bottom-fade' : ''}`}
    >
      <button
        type="button"
        className={`transcript-flow-tracking-toggle${trackingEnabled ? ' is-active' : ''}`}
        onClick={() => setTrackingEnabled((prev) => !prev)}
        title={trackingEnabled ? 'Disable word tracking' : 'Enable word tracking'}
        aria-pressed={trackingEnabled}
      >
        <EyeIcon />
      </button>
      <div className="transcript-roller" ref={containerRef}>
        <div className="transcript-flow-track" ref={trackRef}>
          {renderedFlow}
        </div>
      </div>
    </div>
  )
}

export default TranscriptFlow
