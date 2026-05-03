import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { normaliseExpression } from '../../services/vocab'
import WordTokenListening from '../listen/WordTokenListening'

// Eye icon for the tracking toggle — same affordance as KaraokeSubtitles.
const EyeIcon = ({ open }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <path d="M1 12 L 2.5 11.3 M1 12 L 2.5 12.7" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
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

// Real virtualisation. The transcript can be 8,000+ words on a long podcast;
// rendering all of them at once turns into a 16k-DOM-node layout problem
// that makes every style invalidation forced-reflow every word inline. Two
// previous attempts used `content-visibility: auto` with a CSS placeholder
// height — that lets the browser skip *paint* of off-screen content but the
// DOM (and all its hit-testing / a11y / forced-layout cost) is still there,
// AND the placeholder's stand-in size never matched real laid-out heights
// once the reader fonts changed, so the auto-scroll lerp (which read
// `offsetTop` of off-screen words) chased phantom positions.
//
// The fix here is structural: only the paragraphs in (or just above/below)
// the viewport exist as DOM. Off-screen paragraphs are pure data in JS. The
// scroll position is computed entirely from a JS height model, never from
// `offsetTop` of off-screen elements — because off-screen elements don't
// exist. The height model starts from a per-paragraph estimate (word count
// × estimated words-per-line × line-height) and gets corrected to the real
// height the first time each paragraph paints.

const TERMINAL_PUNCTUATION = /[.!?…。！？]\s*$/
const VISIBLE_BUFFER = 8 // paragraphs above/below the viewport to keep mounted

const getDisplayStatus = (status) => {
  if (!status) return 'new'
  if (status === 'unknown' || status === 'recognised' || status === 'familiar' || status === 'known') return status
  return 'new'
}

const isWordToken = (token) => /[\p{L}\p{N}]/u.test(token)

// Flatten all segments into a single array of word/break entries.
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
      const tokens = (segment.text || '').split(/(\s+)/).filter(Boolean)
      const wordTokens = tokens.filter((t) => !/^\s+$/.test(t))
      const step = segDuration / Math.max(1, wordTokens.length)
      let cursor = segStart
      for (const token of tokens) {
        if (/^\s+$/.test(token)) continue
        segmentWords.push({ type: 'word', text: token, start: cursor, end: cursor + step, segIdx })
        cursor += step
      }
    }

    if (!segmentWords.length) return
    entries.push(...segmentWords)
    const lastText = segmentWords[segmentWords.length - 1].text
    const isTerminal = TERMINAL_PUNCTUATION.test(lastText)
    entries.push({ type: 'break', soft: !isTerminal, segIdx })
  })
  return entries
}

// Find the active word index for a given time. Binary search.
const findActiveWordIdx = (words, time) => {
  if (!words.length) return -1
  if (time < words[0].start) return -1
  let lo = 0
  let hi = words.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (words[mid].start <= time) lo = mid
    else hi = mid - 1
  }
  if (time < words[lo].end) return lo
  return lo
}

// Group entries into per-paragraph slices, keyed by hard-break boundaries.
// Each paragraph carries the slice of `entries` that renders inside it,
// the global word-index range, and start/end times. wordCount drives the
// initial height estimate before the paragraph mounts and gets measured.
const buildParagraphs = (entries, words) => {
  const paras = []
  let currentEntries = []
  let currentWordStart = -1
  let currentWordEnd = -1
  let currentTimeStart = Infinity
  let currentTimeEnd = -Infinity
  let wordCursor = 0

  const flush = () => {
    if (!currentEntries.length) return
    if (currentWordStart < 0) {
      // paragraph contains no real words (all-punctuation/break) — skip
      currentEntries = []
      currentTimeStart = Infinity
      currentTimeEnd = -Infinity
      return
    }
    paras.push({
      index: paras.length,
      entries: currentEntries,
      wordStart: currentWordStart,
      wordEnd: currentWordEnd,
      wordCount: currentWordEnd - currentWordStart + 1,
      startTime: currentTimeStart,
      endTime: currentTimeEnd,
    })
    currentEntries = []
    currentWordStart = -1
    currentWordEnd = -1
    currentTimeStart = Infinity
    currentTimeEnd = -Infinity
  }

  for (const entry of entries) {
    if (entry.type === 'break') {
      if (!entry.soft) {
        flush()
      } else {
        currentEntries.push(entry)
      }
      continue
    }
    const idx = wordCursor++
    if (currentWordStart < 0) currentWordStart = idx
    currentWordEnd = idx
    if (entry.start < currentTimeStart) currentTimeStart = entry.start
    if (entry.end > currentTimeEnd) currentTimeEnd = entry.end
    currentEntries.push({ ...entry, idx })
  }
  flush()
  return paras
}

const TranscriptFlow = ({
  segments = [],
  vocabEntries = {},
  language,
  onWordClick,
  onSelectionTranslate,
  showWordStatus = false,
  currentTime = 0,
  getCurrentTime,
  isSynced = true,
  onUserScroll,
  syncToken = 0,
  contentExpressions = [],
}) => {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const wordRefs = useRef([]) // index → element (only populated for visible paragraphs)
  const programmaticScrollRef = useRef(false)
  const clearProgrammaticTimerRef = useRef(null)
  const currentTimeRef = useRef(currentTime)
  const getCurrentTimeRef = useRef(getCurrentTime)

  // Cached ref setters — stable identity prevents thousands of unmount/mount
  // ref callback churns when WordTokenListening re-renders.
  const wordRefSettersRef = useRef(new Map())
  const phraseRefSettersRef = useRef(new Map())
  const getWordRefSetter = useCallback((idx) => {
    const cache = wordRefSettersRef.current
    let setter = cache.get(idx)
    if (!setter) {
      setter = (el) => {
        if (el) wordRefs.current[idx] = el
        else if (wordRefs.current[idx] && !wordRefs.current[idx].isConnected) {
          wordRefs.current[idx] = null
        }
      }
      cache.set(idx, setter)
    }
    return setter
  }, [])
  const getPhraseRefSetter = useCallback((startIdx, endIdx) => {
    const cache = phraseRefSettersRef.current
    const key = `${startIdx}-${endIdx}`
    let setter = cache.get(key)
    if (!setter) {
      setter = (el) => {
        if (!el) return
        for (let k = startIdx; k <= endIdx; k++) wordRefs.current[k] = el
      }
      cache.set(key, setter)
    }
    return setter
  }, [])

  const [hasTopFade, setHasTopFade] = useState(false)
  const [hasBottomFade, setHasBottomFade] = useState(false)
  const [trackingEnabled, setTrackingEnabled] = useState(false)
  const trackedActiveIdxRef = useRef(-1)

  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { getCurrentTimeRef.current = getCurrentTime }, [getCurrentTime])

  const readNow = useCallback(() => {
    const fn = getCurrentTimeRef.current
    if (typeof fn === 'function') {
      const value = fn()
      if (typeof value === 'number' && Number.isFinite(value)) return value
    }
    return currentTimeRef.current
  }, [])

  // ===== Data model =====
  const entries = useMemo(() => buildFlowEntries(segments), [segments])
  const words = useMemo(() => entries.filter((e) => e.type === 'word'), [entries])
  const paragraphs = useMemo(() => buildParagraphs(entries, words), [entries, words])

  const expressions = useMemo(() => {
    const userExpressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))
    const detected = (contentExpressions || [])
      .map((expr) => normaliseExpression(expr.text || ''))
      .filter((t) => t.includes(' '))
    return [...new Set([...userExpressions, ...detected])].sort((a, b) => b.length - a.length)
  }, [contentExpressions, vocabEntries])

  // Pre-compute global phrase consumption + spans so each paragraph render
  // can look up phrase data O(1).
  const { consumed, phraseByStart } = useMemo(() => {
    const lowerSequence = words.map((w) =>
      normaliseExpression(w.text.replace(/[^\p{L}\p{N}\s'-]/gu, '')),
    )
    const consumedArr = new Array(words.length).fill(false)
    const phraseSpans = []
    for (const phrase of expressions) {
      const parts = phrase.split(/\s+/)
      for (let i = 0; i <= words.length - parts.length; i++) {
        let match = true
        for (let j = 0; j < parts.length; j++) {
          if (consumedArr[i + j] || lowerSequence[i + j] !== parts[j]) {
            match = false
            break
          }
        }
        if (match) {
          const fullText = words.slice(i, i + parts.length).map((w) => w.text).join(' ')
          const status = vocabEntries[phrase]?.status || 'new'
          phraseSpans.push({ startIdx: i, endIdx: i + parts.length - 1, text: fullText, status })
          for (let j = 0; j < parts.length; j++) consumedArr[i + j] = true
        }
      }
    }
    const map = new Map(phraseSpans.map((p) => [p.startIdx, p]))
    return { consumed: consumedArr, phraseByStart: map }
  }, [words, expressions, vocabEntries])

  // ===== Height model =====
  // Initial estimate from word count, refined to real measured height as
  // each paragraph mounts. lineHeightPxRef holds the actually-measured
  // line-height (sampled from a probe element) so estimates track whatever
  // font / size the consumer happens to apply.
  const heightsRef = useRef(new Map())
  const offsetsRef = useRef([0]) // length = paragraphs.length + 1; offsets[i] = sum of heights[0..i-1]
  const lineHeightPxRef = useRef(56) // ~Lora 1.95rem * 1.8; refined from real measurement
  const wordsPerLineRef = useRef(10) // refined when first paragraph measures
  const [layoutVersion, setLayoutVersion] = useState(0)

  const estimateHeight = useCallback((wordCount) => {
    const wpl = Math.max(1, wordsPerLineRef.current)
    const lines = Math.max(1, Math.ceil(wordCount / wpl))
    return lines * lineHeightPxRef.current + 12 // small inter-paragraph margin
  }, [])

  const getHeight = useCallback((idx) => {
    const measured = heightsRef.current.get(idx)
    if (measured != null) return measured
    return estimateHeight(paragraphs[idx]?.wordCount || 0)
  }, [estimateHeight, paragraphs])

  const rebuildOffsets = useCallback(() => {
    const offs = new Array(paragraphs.length + 1)
    offs[0] = 0
    for (let i = 0; i < paragraphs.length; i++) {
      offs[i + 1] = offs[i] + getHeight(i)
    }
    offsetsRef.current = offs
  }, [paragraphs, getHeight])

  // Rebuild offsets whenever paragraphs change (new transcript loaded).
  useEffect(() => {
    heightsRef.current = new Map()
    rebuildOffsets()
    setLayoutVersion((v) => v + 1)
  }, [paragraphs, rebuildOffsets])

  // ===== Visible range =====
  // Binary search the offsets array for the first paragraph whose bottom is
  // past `scrollTop`, and the last whose top is before `scrollTop+height`.
  const computeVisibleRange = useCallback((scrollTop, viewportHeight) => {
    const offs = offsetsRef.current
    if (paragraphs.length === 0) return { first: 0, last: -1 }
    // First visible: smallest i s.t. offs[i+1] > scrollTop
    let lo = 0
    let hi = paragraphs.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (offs[mid + 1] > scrollTop) hi = mid
      else lo = mid + 1
    }
    const first = Math.max(0, lo - VISIBLE_BUFFER)
    // Last visible: largest i s.t. offs[i] < scrollTop + viewportHeight
    const bottom = scrollTop + viewportHeight
    let lo2 = 0
    let hi2 = paragraphs.length - 1
    while (lo2 < hi2) {
      const mid = (lo2 + hi2 + 1) >>> 1
      if (offs[mid] < bottom) lo2 = mid
      else hi2 = mid - 1
    }
    const last = Math.min(paragraphs.length - 1, lo2 + VISIBLE_BUFFER)
    return { first, last }
  }, [paragraphs])

  const [visibleRange, setVisibleRange] = useState({ first: 0, last: 0 })

  const recomputeVisibleRange = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const next = computeVisibleRange(container.scrollTop, container.clientHeight)
    setVisibleRange((prev) => {
      if (prev.first === next.first && prev.last === next.last) return prev
      return next
    })
  }, [computeVisibleRange])

  // Initial range + on layoutVersion bumps (paragraphs changed, heights updated).
  useLayoutEffect(() => {
    recomputeVisibleRange()
  }, [recomputeVisibleRange, layoutVersion])

  // Scroll-driven range updates, throttled to one per rAF.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    let pending = false
    const onScroll = () => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        recomputeVisibleRange()
      })
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [recomputeVisibleRange])

  // ResizeObserver on the container — recompute visible range when the panel
  // resizes (e.g. user toggles split mode).
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => recomputeVisibleRange())
    ro.observe(container)
    return () => ro.disconnect()
  }, [recomputeVisibleRange])

  // ===== Per-paragraph measurement =====
  // ResizeObserver on every mounted paragraph. When real height differs from
  // the cached value, update heightsRef + rebuild offsets + bump version so
  // the view re-renders with the new positions.
  const paraRefsRef = useRef(new Map()) // el → idx
  const measureROResultRef = useRef(null)
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      let dirty = false
      let firstSampleSeen = false
      for (const entry of entries) {
        const el = entry.target
        const idx = paraRefsRef.current.get(el)
        if (idx == null) continue
        const h = entry.contentRect.height + 12 // approximate margin
        // First-paragraph sample: refine our estimator constants.
        if (!firstSampleSeen && idx === 0 && paragraphs[0]) {
          const measuredLines = Math.max(1, Math.round(entry.contentRect.height / lineHeightPxRef.current))
          if (paragraphs[0].wordCount > 0 && measuredLines > 0) {
            wordsPerLineRef.current = Math.max(4, Math.round(paragraphs[0].wordCount / measuredLines))
          }
          firstSampleSeen = true
        }
        const cur = heightsRef.current.get(idx)
        if (cur == null || Math.abs(cur - h) > 0.5) {
          heightsRef.current.set(idx, h)
          dirty = true
        }
      }
      if (dirty) {
        rebuildOffsets()
        setLayoutVersion((v) => v + 1)
      }
    })
    measureROResultRef.current = ro
    return () => {
      ro.disconnect()
      measureROResultRef.current = null
    }
  }, [paragraphs, rebuildOffsets])

  const setParaRef = useCallback((idx) => (el) => {
    const ro = measureROResultRef.current
    const map = paraRefsRef.current
    if (el) {
      map.set(el, idx)
      if (ro) ro.observe(el)
    }
    // No explicit unobserve on null — the element is detached and the RO
    // entry will go away at next GC. paraRefsRef cleans naturally as old
    // elements lose all references.
  }, [])

  // Sample line-height once on mount from an anonymous probe so estimates
  // start close to reality (we read computed line-height in px).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;height:auto;width:auto;'
    probe.textContent = 'Mg'
    container.appendChild(probe)
    const cs = getComputedStyle(probe)
    const lh = parseFloat(cs.lineHeight)
    if (Number.isFinite(lh) && lh > 0) lineHeightPxRef.current = lh
    container.removeChild(probe)
  }, [])

  // ===== Auto-scroll lerp =====
  // Find the active paragraph from the time, look up its top from offsetsRef,
  // interpolate within the paragraph's time span, lerp scrollTop. No DOM
  // reads except scrollTop (the lerp's input).
  const findActiveParagraphIdx = useCallback((time) => {
    if (paragraphs.length === 0) return -1
    let lo = 0
    let hi = paragraphs.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (paragraphs[mid].startTime <= time) lo = mid
      else hi = mid - 1
    }
    return lo
  }, [paragraphs])

  useEffect(() => {
    if (!isSynced) return undefined
    if (!paragraphs.length) return undefined

    let rafId = null
    const tick = () => {
      const container = containerRef.current
      if (!container) {
        rafId = requestAnimationFrame(tick)
        return
      }
      const time = readNow()

      if (trackingEnabled) {
        const idx = findActiveWordIdx(words, time)
        if (idx !== trackedActiveIdxRef.current) {
          trackedActiveIdxRef.current = idx
          applyTrackingClasses(idx)
        }
      }

      const paraIdx = findActiveParagraphIdx(time)
      if (paraIdx >= 0) {
        const para = paragraphs[paraIdx]
        const offs = offsetsRef.current
        const top = offs[paraIdx]
        const height = getHeight(paraIdx)
        const span = Math.max(0.001, para.endTime - para.startTime)
        const progress = Math.max(0, Math.min(1, (time - para.startTime) / span))
        const interpY = top + height * progress

        const viewportH = container.clientHeight
        const totalH = offs[offs.length - 1]
        const maxScroll = Math.max(0, totalH - viewportH)
        const rawTarget = interpY - viewportH * 0.4
        const target = Math.max(0, Math.min(maxScroll, rawTarget))

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynced, paragraphs, words, syncToken, trackingEnabled, findActiveParagraphIdx, getHeight, readNow])

  // ===== Tracking class application =====
  const lastAppliedIdxRef = useRef(-1)
  const applyTrackingClasses = useCallback((activeIdx) => {
    const refs = wordRefs.current
    const prev = lastAppliedIdxRef.current
    if (activeIdx < 0) {
      if (prev < 0) return
      const seen = new Set()
      for (let i = 0; i < refs.length; i++) {
        const el = refs[i]
        if (!el || seen.has(el)) continue
        seen.add(el)
        el.classList.remove('reader-word--tp-past', 'reader-word--tp-active', 'reader-word--tp-future')
      }
      lastAppliedIdxRef.current = -1
      return
    }
    if (prev < 0) {
      for (let i = 0; i < refs.length; i++) {
        const el = refs[i]
        if (!el) continue
        const state = i < activeIdx ? 'past' : i === activeIdx ? 'active' : 'future'
        el.classList.remove('reader-word--tp-past', 'reader-word--tp-active', 'reader-word--tp-future')
        el.classList.add(`reader-word--tp-${state}`)
      }
      lastAppliedIdxRef.current = activeIdx
      return
    }
    if (prev === activeIdx) return
    const lo = Math.min(prev, activeIdx)
    const hi = Math.max(prev, activeIdx)
    for (let i = lo; i <= hi; i++) {
      const el = refs[i]
      if (!el) continue
      const state = i < activeIdx ? 'past' : i === activeIdx ? 'active' : 'future'
      el.classList.remove('reader-word--tp-past', 'reader-word--tp-active', 'reader-word--tp-future')
      el.classList.add(`reader-word--tp-${state}`)
    }
    lastAppliedIdxRef.current = activeIdx
  }, [])

  useEffect(() => {
    if (!trackingEnabled) {
      applyTrackingClasses(-1)
      trackedActiveIdxRef.current = -1
      return
    }
    lastAppliedIdxRef.current = -1
    const idx = findActiveWordIdx(words, readNow())
    trackedActiveIdxRef.current = idx
    applyTrackingClasses(idx)
  }, [trackingEnabled, words, showWordStatus, vocabEntries, applyTrackingClasses, readNow])

  // When new paragraphs scroll in, their words enter the DOM with no tracking
  // class. Re-sweep on visible-range changes so they pick up the current
  // active state.
  useEffect(() => {
    if (!trackingEnabled) return
    lastAppliedIdxRef.current = -1
    applyTrackingClasses(trackedActiveIdxRef.current)
  }, [visibleRange, trackingEnabled, applyTrackingClasses])

  // ===== Unsynced highlight =====
  useEffect(() => {
    if (isSynced) return
    if (trackingEnabled) {
      const idx = findActiveWordIdx(words, currentTime)
      if (idx !== trackedActiveIdxRef.current) {
        trackedActiveIdxRef.current = idx
        applyTrackingClasses(idx)
      }
    }
  }, [isSynced, currentTime, trackingEnabled, words, applyTrackingClasses])

  // ===== Click delegation =====
  const handleTrackClick = useCallback((event) => {
    if (!onWordClick) return
    const wordEl = event.target.closest('.reader-word')
    if (!wordEl) return
    const text = wordEl.getAttribute('data-word-text')
    if (!text) return
    const selection = typeof window !== 'undefined'
      ? window.getSelection()?.toString()?.trim()
      : ''
    if (selection) return
    onWordClick(text, event, wordEl.getBoundingClientRect())
  }, [onWordClick])

  // ===== Fade hints + user-scroll detection =====
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

  // ===== Render =====
  // Render each visible paragraph's entries as inline children. Word/phrase
  // refs land in wordRefs only for visible words; the auto-scroll math
  // doesn't depend on them, so off-screen words being absent from refs
  // is fine. Tracking classes are applied via the effect above.
  const renderParagraphChildren = useCallback((paragraph) => {
    const nodes = []
    paragraph.entries.forEach((entry, i) => {
      if (entry.type === 'break') {
        // soft break inside a paragraph — just a space
        nodes.push(<span key={`brk-${paragraph.index}-${i}`}> </span>)
        return
      }
      const idx = entry.idx
      if (consumed[idx]) {
        const phrase = phraseByStart.get(idx)
        if (!phrase) return
        nodes.push(
          <WordTokenListening
            key={`w-${paragraph.index}-${i}`}
            text={phrase.text}
            status={getDisplayStatus(phrase.status)}
            language={language}
            listeningMode="extensive"
            enableHighlight={showWordStatus}
            ref={getPhraseRefSetter(phrase.startIdx, phrase.endIdx)}
          />,
        )
        nodes.push(<span key={`sp-${paragraph.index}-${i}`}> </span>)
        return
      }
      if (!isWordToken(entry.text)) {
        nodes.push(<span key={`p-${paragraph.index}-${i}`}>{entry.text}</span>)
        return
      }
      const normalised = normaliseExpression(entry.text)
      const v = vocabEntries[normalised]
      const status = getDisplayStatus(v?.status)
      nodes.push(
        <WordTokenListening
          key={`w-${paragraph.index}-${i}`}
          text={entry.text}
          status={status}
          language={language}
          listeningMode="extensive"
          enableHighlight={showWordStatus}
          ref={getWordRefSetter(idx)}
        />,
      )
      nodes.push(<span key={`sp-${paragraph.index}-${i}`}> </span>)
    })
    return nodes
  }, [consumed, phraseByStart, vocabEntries, language, showWordStatus, getWordRefSetter, getPhraseRefSetter])

  const visibleParagraphs = []
  for (let i = visibleRange.first; i <= visibleRange.last; i++) {
    const para = paragraphs[i]
    if (!para) continue
    visibleParagraphs.push(para)
  }

  const totalHeight = offsetsRef.current[offsetsRef.current.length - 1] || 0

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
        <EyeIcon open={trackingEnabled} />
      </button>
      <div className="transcript-roller" ref={containerRef}>
        <div
          className="transcript-flow-track"
          ref={trackRef}
          onClick={handleTrackClick}
          style={{ height: totalHeight, position: 'relative' }}
        >
          {visibleParagraphs.map((para) => (
            <div
              key={para.index}
              ref={setParaRef(para.index)}
              className="transcript-flow-paragraph transcript-flow-paragraph--virt"
              style={{
                position: 'absolute',
                top: offsetsRef.current[para.index],
                left: 0,
                right: 0,
              }}
            >
              {renderParagraphChildren(para)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TranscriptFlow
