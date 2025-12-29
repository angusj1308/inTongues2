import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normaliseExpression, upsertVocabEntry } from '../../services/vocab'
import WordTokenListening from '../listen/WordTokenListening'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { normalizeLanguageCode } from '../../utils/language'

const getPopupPosition = (rect) => {
  const margin = 12
  const estimatedPopupHeight = 280
  const estimatedPopupWidth = 360

  const viewportWidth = window.innerWidth
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom

  const shouldRenderAbove =
    spaceBelow < estimatedPopupHeight + margin && spaceAbove > spaceBelow

  const y = shouldRenderAbove
    ? Math.max(window.scrollY + rect.top - estimatedPopupHeight - margin, window.scrollY + margin)
    : Math.min(
        window.scrollY + rect.bottom + margin,
        window.scrollY + window.innerHeight - estimatedPopupHeight - margin
      )

  const centerX = rect.left + rect.width / 2 + window.scrollX
  const x = Math.min(
    Math.max(centerX - estimatedPopupWidth / 2, window.scrollX + margin),
    window.scrollX + viewportWidth - estimatedPopupWidth - margin
  )

  return { x, y }
}

const getDisplayStatus = (status) => {
  if (!status) return 'new'
  if (status === 'unknown' || status === 'recognised' || status === 'familiar' || status === 'known') {
    return status
  }
  return 'new'
}

const IntensiveCinemaMode = ({
  cinemaMode,
  transcriptSegments = [],
  language,
  nativeLanguage,
  vocabEntries,
  setVocabEntries,
  voiceGender,
  setPopup,
  intensiveSegmentIndex,
  setIntensiveSegmentIndex,
  currentTime,
  duration,
  onSeek,
  onPlayPause,
  isPlaying,
  user,
  videoPlayer,
}) => {
  const [sentenceTranslations, setSentenceTranslations] = useState({})
  const [sentenceWordPairs, setSentenceWordPairs] = useState({})
  const [intensiveRevealStep, setIntensiveRevealStep] = useState('hidden')
  const [isTranscriptionMode, setIsTranscriptionMode] = useState(false)
  const [transcriptionDraft, setTranscriptionDraft] = useState('')
  const [isTranscriptRevealed, setIsTranscriptRevealed] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [progress, setProgress] = useState(0)
  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(100)
  const [isDragging, setIsDragging] = useState(null)
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false)

  const progressBarRef = useRef(null)
  const wordAudioRef = useRef(null)
  const lastSwipeTimeRef = useRef(0)

  const missingLanguageMessage =
    'Select a language for this content to enable translation/pronunciation.'

  // Filter to valid segments with text
  const intensiveSegments = useMemo(
    () =>
      (transcriptSegments || []).filter(
        (seg) => seg?.text?.trim() && typeof seg.start === 'number'
      ),
    [transcriptSegments]
  )

  const currentSegment = intensiveSegments[intensiveSegmentIndex] || null
  const currentIntensiveSentence = currentSegment?.text?.trim() || ''
  const segmentStart = currentSegment?.start || 0
  const segmentEnd = currentSegment?.end || segmentStart
  const segmentDuration = Math.max(0, segmentEnd - segmentStart)

  // Get word pairs for current segment
  const currentWordPairs = useMemo(
    () => sentenceWordPairs[currentIntensiveSentence] || [],
    [sentenceWordPairs, currentIntensiveSentence]
  )

  const highlightedSourceWords = useMemo(
    () => new Set(currentWordPairs.map((pair) => pair.source.toLowerCase())),
    [currentWordPairs]
  )

  const highlightedTargetWords = useMemo(
    () => new Set(currentWordPairs.map((pair) => pair.target.toLowerCase())),
    [currentWordPairs]
  )

  // Calculate actual loop bounds
  const actualLoopStart = segmentStart + (segmentDuration * loopStart) / 100
  const actualLoopEnd = segmentStart + (segmentDuration * loopEnd) / 100

  // Update progress based on current time
  useEffect(() => {
    if (cinemaMode !== 'intensive' || !currentSegment) return

    if (currentTime >= segmentStart && currentTime <= segmentEnd) {
      const prog =
        segmentDuration > 0
          ? ((currentTime - segmentStart) / segmentDuration) * 100
          : 0
      setProgress(Math.min(100, Math.max(0, prog)))
    }

    // Handle segment boundary - loop or pause at end
    if (isPlaying && currentTime >= actualLoopEnd) {
      if (isLooping) {
        onSeek?.(actualLoopStart)
      } else {
        // Pause video when reaching segment end
        onPlayPause?.()
      }
    }
  }, [
    cinemaMode,
    currentSegment,
    currentTime,
    segmentStart,
    segmentEnd,
    segmentDuration,
    isLooping,
    isPlaying,
    actualLoopEnd,
    actualLoopStart,
    onSeek,
    onPlayPause,
  ])

  // Render translation with highlights
  const renderTranslationWithHighlights = (text) => {
    if (!text || highlightedTargetWords.size === 0) return text

    const tokens = text.split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)

    return tokens.map((token, index) => {
      if (!token) return null
      const isWord = /[\p{L}\p{N}]/u.test(token)
      if (!isWord) return <span key={index}>{token}</span>

      const isMatch = highlightedTargetWords.has(token.toLowerCase())
      if (isMatch) {
        return (
          <span key={index} className="translation-word-match">
            {token}
          </span>
        )
      }
      return <span key={index}>{token}</span>
    })
  }

  // Play word audio
  const playWordAudio = useCallback((audioBase64) => {
    if (!audioBase64) return

    if (wordAudioRef.current) {
      wordAudioRef.current.pause()
      wordAudioRef.current = null
    }

    try {
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`)
      wordAudioRef.current = audio
      audio.play().catch((err) => console.error('Word audio playback failed', err))
    } catch (error) {
      console.error('Error creating audio from base64:', error)
    }
  }, [])

  // Extract unknown words
  const getUnknownWordsFromSentence = useCallback(
    (sentence) => {
      if (!sentence) return []
      const words = sentence
        .split(/\s+/)
        .map((w) => w.replace(/[.,!?;:'"()]/g, '').toLowerCase())
        .filter(Boolean)
      const uniqueWords = [...new Set(words)]
      return uniqueWords.filter((word) => {
        const key = normaliseExpression(word)
        const status = vocabEntries[key]?.status
        return !status || status === 'unknown'
      })
    },
    [vocabEntries]
  )

  // Fetch translation for a segment
  const fetchSentenceTranslation = useCallback(
    async (sentence) => {
      if (!sentence) return null

      const ttsLanguage = normalizeLanguageCode(language)
      if (!ttsLanguage) return null

      const unknownWords = getUnknownWordsFromSentence(sentence)

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: sentence,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(nativeLanguage),
            ttsLanguage,
            skipAudio: false,
            unknownWords: unknownWords.length > 0 ? unknownWords : undefined,
          }),
        })

        if (!response.ok) {
          console.error('Sentence translation failed:', await response.text())
          return { translation: 'Unable to fetch translation right now.', wordPairs: [] }
        }

        const data = await response.json()
        return {
          translation: data.translation || 'No translation found.',
          wordPairs: data.wordPairs || [],
        }
      } catch (error) {
        console.error('Error translating sentence:', error)
        return { translation: 'Unable to fetch translation right now.', wordPairs: [] }
      }
    },
    [language, nativeLanguage, getUnknownWordsFromSentence]
  )

  // Lazy-load translations
  useEffect(() => {
    if (cinemaMode !== 'intensive') return
    if (intensiveSegments.length === 0) return

    const ttsLanguage = normalizeLanguageCode(language)
    if (!ttsLanguage) return

    let isCancelled = false

    const loadTranslations = async () => {
      const indicesToFetch = [
        intensiveSegmentIndex,
        intensiveSegmentIndex + 1,
        intensiveSegmentIndex + 2,
      ].filter((i) => i >= 0 && i < intensiveSegments.length)

      const sentencesToFetch = indicesToFetch
        .map((i) => intensiveSegments[i]?.text?.trim())
        .filter((sentence) => sentence && !sentenceTranslations[sentence])

      if (sentencesToFetch.length === 0) return

      const currentSentence = intensiveSegments[intensiveSegmentIndex]?.text?.trim()
      const needsLoadingIndicator = currentSentence && !sentenceTranslations[currentSentence]

      if (needsLoadingIndicator) {
        setIsLoadingTranslation(true)
      }

      for (const sentence of sentencesToFetch) {
        if (isCancelled) break

        const result = await fetchSentenceTranslation(sentence)

        if (isCancelled) break

        if (result) {
          setSentenceTranslations((prev) => ({
            ...prev,
            [sentence]: result.translation,
          }))
          if (result.wordPairs && result.wordPairs.length > 0) {
            setSentenceWordPairs((prev) => ({
              ...prev,
              [sentence]: result.wordPairs,
            }))
          }
        }

        if (sentence === currentSentence) {
          setIsLoadingTranslation(false)
        }
      }

      setIsLoadingTranslation(false)
    }

    loadTranslations()

    return () => {
      isCancelled = true
      setIsLoadingTranslation(false)
    }
  }, [
    intensiveSegmentIndex,
    intensiveSegments,
    language,
    cinemaMode,
    fetchSentenceTranslation,
    sentenceTranslations,
  ])

  // Reset reveal state on segment change
  useEffect(() => {
    setIntensiveRevealStep('hidden')
    setIsTranscriptRevealed(false)
    setTranscriptionDraft('')
    setProgress(0)
    setLoopStart(0)
    setLoopEnd(100)
  }, [intensiveSegmentIndex])

  // Clamp segment index
  useEffect(() => {
    if (cinemaMode !== 'intensive') return

    setIntensiveSegmentIndex((prev) =>
      Math.min(prev, Math.max(intensiveSegments.length - 1, 0))
    )
  }, [intensiveSegments.length, cinemaMode, setIntensiveSegmentIndex])

  const handleSingleWordClick = async (text, event) => {
    const selection = window.getSelection()?.toString().trim()
    const parts = selection ? selection.split(/\s+/).filter(Boolean) : []

    if (parts.length > 1) return

    const ttsLanguage = normalizeLanguageCode(language)

    if (!ttsLanguage) {
      const selectionObj = window.getSelection()
      if (!selectionObj || selectionObj.rangeCount === 0) return

      const range = selectionObj.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const { x, y } = getPopupPosition(rect)

      setPopup({
        x,
        y,
        word: text,
        displayText: text,
        translation: missingLanguageMessage,
        targetText: missingLanguageMessage,
        audioBase64: null,
        audioUrl: null,
      })
      return
    }

    let translation = 'No translation found'
    let audioBase64 = null
    let audioUrl = null
    let targetText = 'No translation found'

    try {
      const response = await fetch('http://localhost:4000/api/translatePhrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phrase: text,
          sourceLang: language || 'es',
          targetLang: resolveSupportedLanguageLabel(nativeLanguage),
          voiceGender,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        translation = data.translation || translation
        targetText = data.targetText || translation
        audioBase64 = data.audioBase64 || null
        audioUrl = data.audioUrl || null
      }
    } catch (err) {
      console.error('Translation lookup failed', err)
    }

    const selectionObj = window.getSelection()
    if (!selectionObj || selectionObj.rangeCount === 0) return

    const range = selectionObj.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const { x, y } = getPopupPosition(rect)

    setPopup({
      x,
      y,
      word: text,
      displayText: text,
      translation,
      targetText,
      audioBase64,
      audioUrl,
    })
  }

  const segmentTextByExpressions = (text, expressions) => {
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
      }

      if (matchedExpression) {
        const phraseText = text.slice(index, index + matchedExpression.length)
        const status = vocabEntries[matchedExpression]?.status || 'new'
        segments.push({ type: 'phrase', text: phraseText, status })
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

  const renderWordSegments = (text = '') => {
    const expressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))
      .sort((a, b) => b.length - a.length)

    const elements = []
    const segments = segmentTextByExpressions(text || '', expressions)

    segments.forEach((segment, segmentIndex) => {
      if (segment.type === 'phrase') {
        elements.push(
          <WordTokenListening
            key={`phrase-${segmentIndex}`}
            text={segment.text}
            status={getDisplayStatus(segment.status)}
            language={language}
            listeningMode="intensive"
          />
        )
        return
      }

      const tokens = (segment.text || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)

      tokens.forEach((token, index) => {
        if (!token) return

        const isWord = /[\p{L}\p{N}]/u.test(token)

        if (!isWord) {
          elements.push(<span key={`separator-${segmentIndex}-${index}`}>{token}</span>)
          return
        }

        const normalised = normaliseExpression(token)
        const entry = vocabEntries[normalised]
        const status = getDisplayStatus(entry?.status)
        const isWordPairMatch = highlightedSourceWords.has(token.toLowerCase())

        elements.push(
          <WordTokenListening
            key={`word-${segmentIndex}-${index}`}
            text={token}
            status={status}
            language={language}
            listeningMode="intensive"
            onWordClick={handleSingleWordClick}
            isWordPairMatch={isWordPairMatch}
          />
        )
      })
    })

    return elements
  }

  const toggleIntensiveRevealStep = () => {
    if (isTranscriptionMode && !isTranscriptRevealed) return

    setIntensiveRevealStep((prev) => {
      if (prev === 'hidden') return 'transcript'
      if (prev === 'transcript') return 'translation'
      return 'hidden'
    })
  }

  const handleTranscriptionToggle = () => {
    setIsTranscriptionMode((prev) => {
      const next = !prev
      setIntensiveRevealStep('hidden')
      setIsTranscriptRevealed(false)
      setTranscriptionDraft('')
      return next
    })
  }

  const handleSetWordPairStatus = useCallback(
    async (word, translation, newStatus) => {
      if (!user || !language) return

      try {
        await upsertVocabEntry(user.uid, language, word, translation, newStatus)

        const key = normaliseExpression(word)
        setVocabEntries((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] || { text: word, language }),
            status: newStatus,
            translation,
          },
        }))
      } catch (error) {
        console.error('Failed to update word status:', error)
      }
    },
    [user, language, setVocabEntries]
  )

  const handleTranscriptionKeyDown = (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()

    if (!isTranscriptRevealed) {
      setIsTranscriptRevealed(true)
      setIntensiveRevealStep('transcript')
    }
  }

  const getNewWordsInSentence = (sentence) => {
    if (!sentence) return []

    const rawWords = Array.from(
      new Set(
        sentence
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
      )
    )

    return rawWords.filter((word) => {
      const key = normaliseExpression(word)
      const status = vocabEntries[key]?.status
      return !status || status === 'unknown'
    })
  }

  const autoMarkSentenceWordsAsKnown = async (sentence) => {
    if (!user || !language) return

    const newWords = getNewWordsInSentence(sentence)

    if (newWords.length === 0) return

    try {
      await Promise.all(
        newWords.map((word) => {
          const key = normaliseExpression(word)
          const existingTranslation = vocabEntries[key]?.translation || 'No translation found'
          return upsertVocabEntry(user.uid, language, word, existingTranslation, 'known')
        })
      )

      setVocabEntries((prev) => {
        const next = { ...prev }
        newWords.forEach((word) => {
          const key = normaliseExpression(word)
          const existingTranslation = prev[key]?.translation || 'No translation found'
          next[key] = {
            ...(next[key] || { text: word, language }),
            status: 'known',
            translation: existingTranslation,
          }
        })
        return next
      })
    } catch (error) {
      console.error('Failed to auto-mark words as known', error)
    }
  }

  const handleSegmentNavigation = useCallback(
    async (direction) => {
      if (cinemaMode !== 'intensive') return
      if (intensiveSegments.length === 0) return

      const movingForward = direction === 'next'
      const movingBackward = direction === 'previous'

      const atLastSegment = intensiveSegmentIndex >= intensiveSegments.length - 1
      const atFirstSegment = intensiveSegmentIndex === 0

      const transcriptRevealed = isTranscriptionMode
        ? isTranscriptRevealed
        : intensiveRevealStep !== 'hidden'

      if (movingForward && !atLastSegment) {
        if (!transcriptRevealed) return
        await autoMarkSentenceWordsAsKnown(currentIntensiveSentence)
        setIntensiveSegmentIndex((prev) => prev + 1)
        return
      }

      if (movingBackward && !atFirstSegment) {
        setIntensiveSegmentIndex((prev) => Math.max(prev - 1, 0))
      }
    },
    [
      cinemaMode,
      currentIntensiveSentence,
      intensiveSegmentIndex,
      intensiveSegments.length,
      intensiveRevealStep,
      isTranscriptionMode,
      isTranscriptRevealed,
      setIntensiveSegmentIndex,
    ]
  )

  const scrubVideo = useCallback(
    (seconds) => {
      if (!onSeek || !currentSegment) return

      const newTime = Math.max(actualLoopStart, Math.min(actualLoopEnd, currentTime + seconds))
      onSeek(newTime)
    },
    [onSeek, currentSegment, currentTime, actualLoopStart, actualLoopEnd]
  )

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev)
  }, [])

  const togglePlaybackRate = useCallback(() => {
    const newRate = playbackRate === 1 ? 0.75 : 1
    setPlaybackRate(newRate)
    // Note: Video playback rate would need to be set on the player
  }, [playbackRate])

  // Pin dragging
  const handlePinDrag = useCallback(
    (e) => {
      if (!isDragging || !progressBarRef.current) return

      const rect = progressBarRef.current.getBoundingClientRect()
      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))

      if (isDragging === 'start') {
        setLoopStart(Math.min(percent, loopEnd - 5))
      } else if (isDragging === 'end') {
        setLoopEnd(Math.max(percent, loopStart + 5))
      }
    },
    [isDragging, loopEnd, loopStart]
  )

  const handlePinDragEnd = useCallback(() => {
    setIsDragging(null)
  }, [])

  useEffect(() => {
    if (!isDragging) return undefined

    const handleMouseMove = (e) => handlePinDrag(e)
    const handleMouseUp = () => handlePinDragEnd()

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handlePinDrag, handlePinDragEnd])

  // Keyboard shortcuts
  useEffect(() => {
    if (cinemaMode !== 'intensive') return undefined

    const handleShortcuts = (event) => {
      const activeElement = document.activeElement
      const activeTag = activeElement?.tagName
      const isTextInput =
        (activeTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) ||
        activeElement?.isContentEditable
      const isButton = activeTag === 'BUTTON'
      const isArrowLeft = event.key === 'ArrowLeft'
      const isArrowRight = event.key === 'ArrowRight'
      const isSpace = event.code === 'Space' || event.key === ' '

      if (isTextInput) {
        if (
          activeTag === 'INPUT' &&
          activeElement?.classList?.contains('intensive-input') &&
          (isArrowLeft || isArrowRight)
        ) {
          event.preventDefault()
          activeElement.blur()
          handleSegmentNavigation(isArrowLeft ? 'previous' : 'next')
        }
        return
      }

      if (isButton && (isSpace || isArrowLeft || isArrowRight)) {
        event.preventDefault()
        activeElement.blur()
      }

      if (isSpace) {
        event.preventDefault()
        onPlayPause?.()
        return
      }

      if (isArrowLeft) {
        event.preventDefault()
        scrubVideo(-2)
        return
      }

      if (isArrowRight) {
        event.preventDefault()
        scrubVideo(2)
      }
    }

    window.addEventListener('keydown', handleShortcuts)

    return () => {
      window.removeEventListener('keydown', handleShortcuts)
    }
  }, [cinemaMode, handleSegmentNavigation, onPlayPause, scrubVideo])

  // Swipe gesture
  useEffect(() => {
    if (cinemaMode !== 'intensive') return undefined

    const SWIPE_THRESHOLD = 50
    const SWIPE_COOLDOWN = 400

    const handleWheel = (event) => {
      const absX = Math.abs(event.deltaX)
      const absY = Math.abs(event.deltaY)

      if (absX <= absY) return
      if (absX < SWIPE_THRESHOLD) return

      const now = Date.now()
      if (now - lastSwipeTimeRef.current < SWIPE_COOLDOWN) return
      lastSwipeTimeRef.current = now

      event.preventDefault()

      if (event.deltaX > 0) {
        handleSegmentNavigation('next')
      } else {
        handleSegmentNavigation('previous')
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [cinemaMode, handleSegmentNavigation])

  const handleWordClick = async (e) => {
    e.stopPropagation()

    const selection = window.getSelection()?.toString().trim()

    if (!selection) return

    const parts = selection.split(/\s+/).filter(Boolean)

    if (parts.length > 1) {
      const phrase = selection

      const selectionObj = window.getSelection()
      if (!selectionObj || selectionObj.rangeCount === 0) return

      const range = selectionObj.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      let translation = 'No translation found'
      let audioBase64 = null
      let audioUrl = null

      const ttsLanguage = normalizeLanguageCode(language)

      if (!ttsLanguage) {
        setPopup({
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY + 8,
          word: phrase,
          translation: missingLanguageMessage,
          audioBase64: null,
          audioUrl: null,
        })
        return
      }

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(nativeLanguage),
            voiceGender,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          translation = data.translation || translation
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        }
      } catch (err) {
        console.error('Error translating phrase:', err)
      }

      const { x, y } = getPopupPosition(rect)

      setPopup({
        x,
        y,
        word: phrase,
        translation,
        audioBase64,
        audioUrl,
      })

      return
    }

    const clean = selection.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
    if (!clean) return

    const selectionObj = window.getSelection()
    if (!selectionObj || selectionObj.rangeCount === 0) return

    const range = selectionObj.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const { x, y } = getPopupPosition(rect)

    setPopup({
      x,
      y,
      word: clean,
      translation: 'No translation found',
      audioBase64: null,
      audioUrl: null,
    })
  }

  const intensiveTranslation =
    sentenceTranslations[currentIntensiveSentence?.trim?.() || currentIntensiveSentence]
  const isTranscriptVisible = isTranscriptionMode
    ? isTranscriptRevealed
    : intensiveRevealStep !== 'hidden'
  const isTranslationVisible =
    intensiveRevealStep === 'translation' && (!isTranscriptionMode || isTranscriptRevealed)
  const toggleLabel = (() => {
    if (isTranscriptionMode && !isTranscriptRevealed) {
      return 'Reveal transcript first'
    }
    if (intensiveRevealStep === 'hidden') return 'Show transcript'
    if (intensiveRevealStep === 'transcript') return 'Show translation'
    return 'Hide translation'
  })()

  if (cinemaMode !== 'intensive') return null

  return (
    <div className="cinema-intensive-overlay">
      <div className="cinema-intensive-card">
        {/* Header: Segment navigation + Transcribe toggle */}
        <div className="intensive-card-header">
          <div className="intensive-card-nav">
            <button
              type="button"
              className="intensive-card-nav-btn"
              onClick={() => handleSegmentNavigation('previous')}
              disabled={intensiveSegmentIndex === 0}
              aria-label="Previous segment"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="intensive-card-nav-counter">
              {intensiveSegmentIndex + 1} / {intensiveSegments.length}
            </span>
            <button
              type="button"
              className="intensive-card-nav-btn"
              onClick={() => handleSegmentNavigation('next')}
              disabled={intensiveSegmentIndex >= intensiveSegments.length - 1}
              aria-label="Next segment"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          </div>

          <div className="transcribe-mode-toggle">
            <span className="transcribe-mode-label">Transcribe</span>
            <button
              type="button"
              className={`toggle-switch ${isTranscriptionMode ? 'is-active' : ''}`}
              onClick={handleTranscriptionToggle}
              aria-pressed={isTranscriptionMode}
              aria-label="Toggle transcribe mode"
            >
              <span className="toggle-switch-slider" />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="cinema-intensive-card-content">
          {/* Video player embedded in card */}
          <div className="cinema-intensive-video-zone">{videoPlayer}</div>

          {/* Transcript zone */}
          <div className="intensive-transcript-zone">
            {isTranscriptionMode && !isTranscriptRevealed && (
              <div className="intensive-input-row">
                <input
                  type="text"
                  className="intensive-input"
                  placeholder="Type what you hear, then press Enter to reveal."
                  value={transcriptionDraft}
                  onChange={(event) => setTranscriptionDraft(event.target.value)}
                  onKeyDown={handleTranscriptionKeyDown}
                  readOnly={isTranscriptRevealed}
                />
              </div>
            )}

            {isTranscriptVisible && (
              <div className="intensive-transcript" onMouseUp={handleWordClick}>
                {currentIntensiveSentence ? (
                  renderWordSegments(currentIntensiveSentence)
                ) : (
                  'No text available for this segment.'
                )}
              </div>
            )}
          </div>

          {/* Translation zone */}
          <div className="intensive-translation-zone">
            {isTranslationVisible ? (
              <div className="intensive-translation">
                {isLoadingTranslation
                  ? 'Loading translation...'
                  : renderTranslationWithHighlights(intensiveTranslation) ||
                    'Translation will appear here.'}
              </div>
            ) : (
              <button
                type="button"
                className="intensive-reveal-btn"
                onClick={toggleIntensiveRevealStep}
                disabled={isTranscriptionMode && !isTranscriptRevealed}
              >
                {toggleLabel}
              </button>
            )}
          </div>

          {/* Player controls */}
          <div className="intensive-player">
            <div className="intensive-player-progress" ref={progressBarRef}>
              <div
                className="intensive-player-loop-region"
                style={{
                  left: `${loopStart}%`,
                  width: `${loopEnd - loopStart}%`,
                  opacity: isLooping ? 1 : 0.3,
                }}
              />
              <div className="intensive-player-progress-fill" style={{ width: `${progress}%` }} />
              <div
                className={`intensive-player-pin intensive-player-pin-start ${isDragging === 'start' ? 'is-dragging' : ''}`}
                style={{ left: `${loopStart}%` }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setIsDragging('start')
                }}
                role="slider"
                aria-label="Loop start"
                aria-valuenow={loopStart}
                tabIndex={0}
              />
              <div
                className={`intensive-player-pin intensive-player-pin-end ${isDragging === 'end' ? 'is-dragging' : ''}`}
                style={{ left: `${loopEnd}%` }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setIsDragging('end')
                }}
                role="slider"
                aria-label="Loop end"
                aria-valuenow={loopEnd}
                tabIndex={0}
              />
            </div>
            <div className="intensive-player-controls">
              <button
                type="button"
                className={`intensive-player-btn ${playbackRate === 0.75 ? 'is-active' : ''}`}
                onClick={togglePlaybackRate}
                aria-label={playbackRate === 0.75 ? 'Normal speed' : 'Slow speed'}
                title={playbackRate === 0.75 ? '0.75x' : '1x'}
              >
                <svg width="22" height="22" viewBox="0 0 100 100" fill="currentColor">
                  <ellipse cx="50" cy="50" rx="35" ry="25" />
                  <circle cx="90" cy="50" r="12" />
                  <ellipse cx="75" cy="72" rx="8" ry="12" />
                  <ellipse cx="75" cy="28" rx="8" ry="12" />
                  <ellipse cx="25" cy="72" rx="8" ry="12" />
                  <ellipse cx="25" cy="28" rx="8" ry="12" />
                  <ellipse cx="12" cy="50" rx="6" ry="4" />
                </svg>
              </button>
              <button
                type="button"
                className="intensive-player-btn"
                onClick={() => scrubVideo(-2)}
                aria-label="Back 2 seconds"
              >
                <svg
                  className="scrub-svg"
                  width="24"
                  height="24"
                  viewBox="-2 -2 40 40"
                  fill="none"
                >
                  <g transform="translate(36 0) scale(-1 1)">
                    <circle className="scrub-arc" cx="18" cy="18" r="12" />
                    <path className="scrub-arrowhead" d="M 22 6 L 16 4 L 16 8 Z" />
                  </g>
                  <text
                    className="scrub-text"
                    x="18"
                    y="19"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    2
                  </text>
                </svg>
              </button>
              <button
                type="button"
                className="intensive-player-btn intensive-player-btn-play"
                onClick={onPlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="intensive-player-btn"
                onClick={() => scrubVideo(2)}
                aria-label="Forward 2 seconds"
              >
                <svg
                  className="scrub-svg"
                  width="24"
                  height="24"
                  viewBox="-2 -2 40 40"
                  fill="none"
                >
                  <circle className="scrub-arc" cx="18" cy="18" r="12" />
                  <path className="scrub-arrowhead" d="M 22 6 L 16 4 L 16 8 Z" />
                  <text
                    className="scrub-text"
                    x="18"
                    y="19"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    2
                  </text>
                </svg>
              </button>
              <button
                type="button"
                className={`intensive-player-btn ${isLooping ? 'is-active' : ''}`}
                onClick={toggleLoop}
                aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
                aria-pressed={isLooping}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17 2l4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="M7 22l-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Vocab zone */}
          <div className="intensive-vocab-zone">
            {isTranscriptVisible && currentWordPairs.length > 0 && (
              <div className="intensive-word-pairs">
                {currentWordPairs.map((pair, index) => {
                  const wordKey = normaliseExpression(pair.source)
                  const currentStatus = getDisplayStatus(vocabEntries[wordKey]?.status)

                  return (
                    <div key={index} className="intensive-word-pair">
                      <div className="intensive-word-pair-content">
                        <button
                          type="button"
                          className="intensive-word-pair-speaker"
                          onClick={() => playWordAudio(pair.audioBase64)}
                          disabled={!pair.audioBase64}
                          aria-label={`Play pronunciation of ${pair.source}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                          </svg>
                        </button>
                        <span className="intensive-word-pair-source">{pair.source}</span>
                        <span className="intensive-word-pair-arrow">→</span>
                        <span className="intensive-word-pair-target">{pair.target}</span>
                      </div>
                      <div className="intensive-word-pair-status">
                        <button
                          type="button"
                          className={`intensive-word-pair-status-btn ${currentStatus === 'new' ? 'is-active' : ''}`}
                          disabled
                          title="New - no status yet"
                        >
                          N
                        </button>
                        {['unknown', 'recognised', 'familiar', 'known'].map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={`intensive-word-pair-status-btn ${currentStatus === status ? 'is-active' : ''}`}
                            onClick={() => handleSetWordPairStatus(pair.source, pair.target, status)}
                          >
                            {status.charAt(0).toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default IntensiveCinemaMode
