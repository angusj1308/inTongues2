import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normaliseExpression, upsertVocabEntry } from '../../services/vocab'
import WordTokenListening from './WordTokenListening'
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

const IntensiveListeningMode = ({
  listeningMode,
  transcriptSentences,
  transcriptSegments,
  language,
  nativeLanguage,
  vocabEntries,
  setVocabEntries,
  voiceGender,
  voiceId,
  setPopup,
  intensiveSentenceIndex,
  setIntensiveSentenceIndex,
  audioRef,
  fullAudioUrl,
  user,
}) => {
  const [sentenceTranslations, setSentenceTranslations] = useState({})
  const [sentenceWordPairs, setSentenceWordPairs] = useState({}) // { sentence: [{source, target, audioBase64}] }
  const [intensiveRevealStep, setIntensiveRevealStep] = useState('hidden')
  const [isTranscriptionMode, setIsTranscriptionMode] = useState(false)
  const [transcriptionDraft, setTranscriptionDraft] = useState('')
  const [isTranscriptRevealed, setIsTranscriptRevealed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [progress, setProgress] = useState(0)
  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(100)
  const [isDragging, setIsDragging] = useState(null) // 'start' | 'end' | null
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false)
  const sentenceAudioStopRef = useRef(null)
  const fallbackAudioRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const currentSegmentRef = useRef(null)
  const progressBarRef = useRef(null)
  const wordAudioRef = useRef(null)
  const missingLanguageMessage =
    'Select a language for this content to enable translation/pronunciation.'

  const intensiveSentences = useMemo(
    () =>
      (transcriptSentences || [])
        .map((sentence) => sentence?.trim?.())
        .filter((sentence) => Boolean(sentence)),
    [transcriptSentences]
  )

  const currentIntensiveSentence =
    listeningMode === 'intensive'
      ? intensiveSentences[intensiveSentenceIndex]?.trim() || ''
      : ''

  // Get word pairs for current sentence (unknown words with translations and audio)
  const currentWordPairs = useMemo(
    () => sentenceWordPairs[currentIntensiveSentence] || [],
    [sentenceWordPairs, currentIntensiveSentence]
  )

  // Set of source words that should be highlighted (from word pairs)
  const highlightedSourceWords = useMemo(
    () => new Set(currentWordPairs.map((pair) => pair.source.toLowerCase())),
    [currentWordPairs]
  )

  // Set of target words that should be highlighted (from word pairs)
  const highlightedTargetWords = useMemo(
    () => new Set(currentWordPairs.map((pair) => pair.target.toLowerCase())),
    [currentWordPairs]
  )

  // Render translation text with highlighted target words
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

  // Play word audio from base64
  const playWordAudio = useCallback((audioBase64) => {
    if (!audioBase64) return

    // Stop any currently playing word audio
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

  // Extract unknown/new words from a sentence based on vocabEntries
  const getUnknownWordsFromSentence = useCallback(
    (sentence) => {
      if (!sentence) return []
      // Split sentence into words, normalize, and check status
      const words = sentence.split(/\s+/).map((w) => w.replace(/[.,!?;:'"()]/g, '').toLowerCase()).filter(Boolean)
      const uniqueWords = [...new Set(words)]
      return uniqueWords.filter((word) => {
        const key = normaliseExpression(word)
        const status = vocabEntries[key]?.status
        // Include words that are unknown/new or not in vocab at all
        return !status || status === 'unknown'
      })
    },
    [vocabEntries]
  )

  // Fetch a single sentence translation with word pairs for unknown words
  const fetchSentenceTranslation = useCallback(
    async (sentence) => {
      if (!sentence) return null

      const ttsLanguage = normalizeLanguageCode(language)
      if (!ttsLanguage) return null

      // Get unknown words from this sentence
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
            skipAudio: false, // We want audio for word pairs
            unknownWords: unknownWords.length > 0 ? unknownWords : undefined,
            voiceId, // Use same ElevenLabs voice as story
          }),
        })

        if (!response.ok) {
          console.error('Sentence translation failed:', await response.text())
          return { translation: 'Unable to fetch translation right now.', wordPairs: [] }
        }

        const data = await response.json()
        return {
          translation: data.translation || 'No translation found.',
          wordPairs: data.wordPairs || []
        }
      } catch (error) {
        console.error('Error translating sentence:', error)
        return { translation: 'Unable to fetch translation right now.', wordPairs: [] }
      }
    },
    [language, nativeLanguage, getUnknownWordsFromSentence, voiceId]
  )

  // Lazy-load translations: current sentence + next 2
  useEffect(() => {
    if (listeningMode !== 'intensive') return undefined
    if (intensiveSentences.length === 0) return undefined

    const ttsLanguage = normalizeLanguageCode(language)
    if (!ttsLanguage) return undefined

    let isCancelled = false

    const loadTranslations = async () => {
      // Get current and next 2 sentences
      const indicesToFetch = [
        intensiveSentenceIndex,
        intensiveSentenceIndex + 1,
        intensiveSentenceIndex + 2,
      ].filter((i) => i >= 0 && i < intensiveSentences.length)

      const sentencesToFetch = indicesToFetch
        .map((i) => intensiveSentences[i])
        .filter((sentence) => sentence && !sentenceTranslations[sentence])

      if (sentencesToFetch.length === 0) return

      // Show loading only for current sentence if not cached
      const currentSentence = intensiveSentences[intensiveSentenceIndex]
      const needsLoadingIndicator = currentSentence && !sentenceTranslations[currentSentence]

      if (needsLoadingIndicator) {
        setIsLoadingTranslation(true)
      }

      // Fetch sentences (current first, then prefetch next ones)
      for (const sentence of sentencesToFetch) {
        if (isCancelled) break

        const result = await fetchSentenceTranslation(sentence)

        if (isCancelled) break

        if (result) {
          setSentenceTranslations((prev) => ({
            ...prev,
            [sentence]: result.translation,
          }))
          // Store word pairs if available
          if (result.wordPairs && result.wordPairs.length > 0) {
            setSentenceWordPairs((prev) => ({
              ...prev,
              [sentence]: result.wordPairs,
            }))
          }
        }

        // Turn off loading after current sentence is fetched
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
    intensiveSentenceIndex,
    intensiveSentences,
    language,
    listeningMode,
    fetchSentenceTranslation,
    sentenceTranslations,
  ])

  useEffect(() => {
    setIntensiveRevealStep('hidden')
    setIsTranscriptRevealed(false)
    setTranscriptionDraft('')
  }, [listeningMode, currentIntensiveSentence])

  useEffect(() => {
    if (listeningMode !== 'intensive') return

    setIntensiveSentenceIndex((prev) =>
      Math.min(prev, Math.max(intensiveSentences.length - 1, 0))
    )
  }, [intensiveSentences.length, listeningMode, setIntensiveSentenceIndex])

  const handleSingleWordClick = async (text, event) => {
    const selection = window.getSelection()?.toString().trim()
    const parts = selection ? selection.split(/\s+/).filter(Boolean) : []

    if (parts.length > 1) return

    const key = normaliseExpression(text)
    let translation = null
    let audioBase64 = null
    let audioUrl = null
    let targetText = null

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
        translation: translation || missingLanguageMessage,
        targetText: targetText || translation || missingLanguageMessage,
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
          phrase: text,
          sourceLang: language || 'es',
          targetLang: resolveSupportedLanguageLabel(nativeLanguage),
          voiceGender,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        translation = data.translation || 'No translation found'
        targetText = data.targetText || translation || 'No translation found'
        audioBase64 = data.audioBase64 || null
        audioUrl = data.audioUrl || null
      } else {
        translation = 'No translation found'
        targetText = 'No translation found'
      }
    } catch (err) {
      translation = 'No translation found'
      targetText = 'No translation found'
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

        if (exprIndex !== -1 && exprIndex < lowerText.length) {
          const before = lowerText[exprIndex - 1]
          const after = lowerText[exprIndex + expression.length]

          const isWholeWord = !/\p{L}|\p{N}/u.test(before) && !/\p{L}|\p{N}/u.test(after)
          if (isWholeWord && exprIndex === index) {
            matchedExpression = expression
            break
          }
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
            listeningMode={listeningMode}
          />
        )
        return
      }

      const tokens = (segment.text || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)

      tokens.forEach((token, index) => {
        if (!token) return

        const isWord = /[\p{L}\p{N}]/u.test(token)

        if (!isWord) {
          elements.push(
            <span key={`separator-${segmentIndex}-${index}`}>{token}</span>
          )
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
            listeningMode={listeningMode}
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

  // Handle setting word status from word pairs list
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
      console.error('Failed to auto-mark intensive sentence words as known', error)
    }
  }

  const handleSentenceNavigation = useCallback(
    async (direction) => {
      if (listeningMode !== 'intensive') return
      if (intensiveSentences.length === 0) return

      const movingForward = direction === 'next'
      const movingBackward = direction === 'previous'

      const atLastSentence = intensiveSentenceIndex >= intensiveSentences.length - 1
      const atFirstSentence = intensiveSentenceIndex === 0

      await autoMarkSentenceWordsAsKnown(currentIntensiveSentence)

      if (movingForward && !atLastSentence) {
        setIntensiveSentenceIndex((prev) => prev + 1)
        return
      }

      if (movingBackward && !atFirstSentence) {
        setIntensiveSentenceIndex((prev) => Math.max(prev - 1, 0))
      }
    },
    [
      autoMarkSentenceWordsAsKnown,
      currentIntensiveSentence,
      intensiveSentenceIndex,
      intensiveSentences.length,
      listeningMode,
      setIntensiveSentenceIndex,
    ]
  )

  const getSegmentTimes = useCallback(
    (index) => {
      const segment = transcriptSegments[index]
      if (!segment) return null

      const wordTimings = Array.isArray(segment.words)
        ? segment.words.filter(
            (word) => typeof word?.start === 'number' && typeof word?.end === 'number'
          )
        : []

      const startTime =
        typeof segment.start === 'number'
          ? segment.start
          : wordTimings.length
            ? wordTimings[0].start
            : 0

      const endTime =
        typeof segment.end === 'number'
          ? segment.end
          : wordTimings.length
            ? wordTimings[wordTimings.length - 1].end
            : 0

      return { startTime, endTime, duration: endTime - startTime }
    },
    [transcriptSegments]
  )

  const stopPlayback = useCallback(() => {
    const audio = audioRef?.current || fallbackAudioRef.current
    if (!audio) return

    audio.pause()
    setIsPlaying(false)

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }

    if (sentenceAudioStopRef.current) {
      audio.removeEventListener('timeupdate', sentenceAudioStopRef.current)
      sentenceAudioStopRef.current = null
    }
  }, [audioRef])

  const playSentenceAudio = useCallback(
    (index, shouldLoop = false) => {
      const audioElement = audioRef?.current
      const audio =
        audioElement ||
        fallbackAudioRef.current ||
        (fullAudioUrl ? new Audio(fullAudioUrl) : null)

      if (!audio) return

      if (!audioElement && fullAudioUrl && audio.src !== fullAudioUrl) {
        audio.src = fullAudioUrl
      }

      if (!audioElement) {
        fallbackAudioRef.current = audio
      }

      const times = getSegmentTimes(index)
      if (!times) return

      const { startTime, endTime, duration } = times
      currentSegmentRef.current = { startTime, endTime, duration }

      // Calculate actual loop bounds based on percentages
      const actualLoopStart = startTime + (duration * loopStart / 100)
      const actualLoopEnd = startTime + (duration * loopEnd / 100)

      // Apply playback rate
      audio.playbackRate = playbackRate

      // Start from loop start if looping, otherwise segment start
      const playStart = (shouldLoop || isLooping) ? actualLoopStart : startTime

      try {
        audio.currentTime = playStart
      } catch (error) {
        console.error('Failed to set sentence audio start time', error)
        return
      }

      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error('Sentence playback failed', err))

      // Clear previous listeners
      if (sentenceAudioStopRef.current) {
        audio.removeEventListener('timeupdate', sentenceAudioStopRef.current)
        sentenceAudioStopRef.current = null
      }

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }

      // Update progress
      progressIntervalRef.current = setInterval(() => {
        if (audio.paused) return
        const current = audio.currentTime
        if (current >= startTime && current <= endTime) {
          const prog = duration > 0 ? ((current - startTime) / duration) * 100 : 0
          setProgress(Math.min(100, Math.max(0, prog)))
        }
      }, 50)

      const handleTimeUpdate = () => {
        // Always stop at pin boundary
        if (audio.currentTime >= actualLoopEnd) {
          if (shouldLoop || isLooping) {
            // Loop back to loop start
            audio.currentTime = actualLoopStart
            setProgress(loopStart)
          } else {
            // Stop at end pin
            audio.pause()
            setIsPlaying(false)
            setProgress(loopEnd)
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
            }
            audio.removeEventListener('timeupdate', handleTimeUpdate)
            sentenceAudioStopRef.current = null
          }
        }
      }

      sentenceAudioStopRef.current = handleTimeUpdate
      audio.addEventListener('timeupdate', handleTimeUpdate)
    },
    [audioRef, fullAudioUrl, getSegmentTimes, isLooping, loopEnd, loopStart, playbackRate]
  )

  const togglePlayPause = useCallback(() => {
    const audio = audioRef?.current || fallbackAudioRef.current
    if (!audio) {
      playSentenceAudio(intensiveSentenceIndex)
      return
    }

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      const times = getSegmentTimes(intensiveSentenceIndex)
      if (!times) return

      const { startTime, endTime, duration } = times

      // Calculate actual loop bounds based on percentages
      const actualLoopStart = startTime + (duration * loopStart / 100)
      const actualLoopEnd = startTime + (duration * loopEnd / 100)

      // If outside bounds, reset to loop start
      if (audio.currentTime >= actualLoopEnd || audio.currentTime < actualLoopStart) {
        audio.currentTime = actualLoopStart
        setProgress(loopStart)
      }

      // Clear any existing listeners
      if (sentenceAudioStopRef.current) {
        audio.removeEventListener('timeupdate', sentenceAudioStopRef.current)
        sentenceAudioStopRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }

      // Set up progress tracking
      progressIntervalRef.current = setInterval(() => {
        if (audio.paused) return
        const current = audio.currentTime
        if (current >= startTime && current <= endTime) {
          const prog = duration > 0 ? ((current - startTime) / duration) * 100 : 0
          setProgress(Math.min(100, Math.max(0, prog)))
        }
      }, 50)

      // Set up segment boundary enforcement (always uses pin bounds)
      const handleTimeUpdate = () => {
        if (audio.currentTime >= actualLoopEnd) {
          if (isLooping) {
            audio.currentTime = actualLoopStart
            setProgress(loopStart)
          } else {
            audio.pause()
            setIsPlaying(false)
            setProgress(loopEnd)
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
            }
            audio.removeEventListener('timeupdate', handleTimeUpdate)
            sentenceAudioStopRef.current = null
          }
        }
      }

      sentenceAudioStopRef.current = handleTimeUpdate
      audio.addEventListener('timeupdate', handleTimeUpdate)

      audio.playbackRate = playbackRate
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error('Playback failed', err))
    }
  }, [audioRef, getSegmentTimes, intensiveSentenceIndex, isLooping, isPlaying, loopEnd, loopStart, playbackRate, playSentenceAudio])

  const scrubAudio = useCallback(
    (seconds) => {
      const audio = audioRef?.current || fallbackAudioRef.current
      if (!audio) return

      const times = getSegmentTimes(intensiveSentenceIndex)
      if (!times) return

      const { startTime, duration } = times

      // Calculate pin boundaries
      const actualLoopStart = startTime + (duration * loopStart / 100)
      const actualLoopEnd = startTime + (duration * loopEnd / 100)

      // Clamp scrub to pin bounds
      const newTime = Math.max(actualLoopStart, Math.min(actualLoopEnd, audio.currentTime + seconds))
      audio.currentTime = newTime

      const prog = duration > 0 ? ((newTime - startTime) / duration) * 100 : 0
      setProgress(Math.min(100, Math.max(0, prog)))
    },
    [audioRef, getSegmentTimes, intensiveSentenceIndex, loopEnd, loopStart]
  )

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev)
  }, [])

  const togglePlaybackRate = useCallback(() => {
    const audio = audioRef?.current || fallbackAudioRef.current
    const newRate = playbackRate === 1 ? 0.75 : 1
    setPlaybackRate(newRate)
    if (audio) {
      audio.playbackRate = newRate
    }
  }, [audioRef, playbackRate])

  const handlePinDrag = useCallback((e) => {
    if (!isDragging || !progressBarRef.current) return

    const rect = progressBarRef.current.getBoundingClientRect()
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))

    if (isDragging === 'start') {
      setLoopStart(Math.min(percent, loopEnd - 5)) // Keep at least 5% gap
    } else if (isDragging === 'end') {
      setLoopEnd(Math.max(percent, loopStart + 5)) // Keep at least 5% gap
    }
  }, [isDragging, loopEnd, loopStart])

  const handlePinDragEnd = useCallback(() => {
    setIsDragging(null)
  }, [])

  // Global mouse listeners for dragging
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

  useEffect(() => {
    const audio = audioRef?.current || fallbackAudioRef.current
    if (!audio) return undefined

    return () => {
      if (sentenceAudioStopRef.current) {
        audio.removeEventListener('timeupdate', sentenceAudioStopRef.current)
        sentenceAudioStopRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [audioRef])

  // Reset progress and loop bounds when sentence changes
  useEffect(() => {
    stopPlayback()
    setProgress(0)
    setLoopStart(0)
    setLoopEnd(100)
  }, [intensiveSentenceIndex, stopPlayback])

  useEffect(() => {
    if (listeningMode !== 'intensive') return undefined

    const handleIntensiveShortcuts = (event) => {
      const activeElement = document.activeElement
      const activeTag = activeElement?.tagName
      const isTextInput =
        (activeTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) ||
        activeElement?.isContentEditable
      const isButton = activeTag === 'BUTTON'
      const isArrowLeft = event.key === 'ArrowLeft'
      const isArrowRight = event.key === 'ArrowRight'
      const isSpace = event.code === 'Space' || event.key === ' '

      // For text inputs, only handle arrow keys on intensive-input
      if (isTextInput) {
        if (
          activeTag === 'INPUT' &&
          activeElement?.classList?.contains('intensive-input') &&
          (isArrowLeft || isArrowRight)
        ) {
          event.preventDefault()
          activeElement.blur()
          handleSentenceNavigation(isArrowLeft ? 'previous' : 'next')
        }
        return
      }

      // For buttons, blur and handle shortcuts (don't let space/arrows trigger button)
      if (isButton && (isSpace || isArrowLeft || isArrowRight)) {
        event.preventDefault()
        activeElement.blur()
      }

      if (isSpace) {
        if (!transcriptSegments.length) return
        event.preventDefault()
        playSentenceAudio(intensiveSentenceIndex)
        return
      }

      if (isArrowLeft) {
        event.preventDefault()
        scrubAudio(-2)
        return
      }

      if (isArrowRight) {
        event.preventDefault()
        scrubAudio(2)
      }
    }

    window.addEventListener('keydown', handleIntensiveShortcuts)

    return () => {
      window.removeEventListener('keydown', handleIntensiveShortcuts)
    }
  }, [
    intensiveSentenceIndex,
    listeningMode,
    transcriptSegments.length,
    handleSentenceNavigation,
    playSentenceAudio,
    scrubAudio,
  ])

  // Swipe gesture for sentence navigation (two-finger trackpad swipe via wheel events)
  const lastSwipeTimeRef = useRef(0)
  useEffect(() => {
    if (listeningMode !== 'intensive') return undefined

    const SWIPE_THRESHOLD = 50
    const SWIPE_COOLDOWN = 400 // ms between swipes

    const handleWheel = (event) => {
      // Only handle horizontal swipes
      const absX = Math.abs(event.deltaX)
      const absY = Math.abs(event.deltaY)

      // Must be primarily horizontal
      if (absX <= absY) return

      // Must exceed threshold
      if (absX < SWIPE_THRESHOLD) return

      // Debounce to prevent rapid-fire navigation
      const now = Date.now()
      if (now - lastSwipeTimeRef.current < SWIPE_COOLDOWN) return
      lastSwipeTimeRef.current = now

      // Prevent browser back/forward navigation
      event.preventDefault()

      if (event.deltaX > 0) {
        // Swipe left (deltaX positive) = next sentence
        handleSentenceNavigation('next')
      } else {
        // Swipe right (deltaX negative) = previous sentence
        handleSentenceNavigation('previous')
      }
    }

    // Use non-passive to allow preventDefault
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [listeningMode, handleSentenceNavigation])

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
        } else {
          console.error('Phrase translation failed:', await response.text())
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

    const translation = 'No translation found'

    const selectionObj = window.getSelection()
    if (!selectionObj || selectionObj.rangeCount === 0) return

    const range = selectionObj.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const { x, y } = getPopupPosition(rect)

    setPopup({
      x,
      y,
      word: clean,
      translation,
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

  return (
    <>
      {listeningMode === 'intensive' && (
        <div className="intensive-overlay">
          <div className="intensive-card">
            {/* Header: Sentence navigation + Transcribe toggle */}
            <div className="intensive-card-header">
              <div className="intensive-card-nav">
                <button
                  type="button"
                  className="intensive-card-nav-btn"
                  onClick={() => handleSentenceNavigation('previous')}
                  disabled={intensiveSentenceIndex === 0}
                  aria-label="Previous sentence"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="intensive-card-nav-counter">
                  {intensiveSentenceIndex + 1} / {intensiveSentences.length}
                </span>
                <button
                  type="button"
                  className="intensive-card-nav-btn"
                  onClick={() => handleSentenceNavigation('next')}
                  disabled={intensiveSentenceIndex >= intensiveSentences.length - 1}
                  aria-label="Next sentence"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

            {/* Main content - 4 row grid */}
            <div className="intensive-card-content">
              {/* Row 1: Transcript zone */}
              <div className="intensive-transcript-zone">
                {/* Transcription input (when in transcribe mode) */}
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

                {/* Transcript */}
                {isTranscriptVisible && (
                  <div className="intensive-transcript" onMouseUp={handleWordClick}>
                    {currentIntensiveSentence ? (
                      renderWordSegments(currentIntensiveSentence)
                    ) : (
                      'No text available for this transcript.'
                    )}
                  </div>
                )}
              </div>

              {/* Row 2: Translation zone (button lives here until translation appears) */}
              <div className="intensive-translation-zone">
                {isTranslationVisible ? (
                  <div className="intensive-translation">
                    {isLoadingTranslation
                      ? 'Loading translation...'
                      : renderTranslationWithHighlights(intensiveTranslation) || 'Translation will appear here.'}
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

              {/* Player - center anchor */}
              <div className="intensive-player">
                <div className="intensive-player-progress" ref={progressBarRef}>
                  <div
                    className="intensive-player-loop-region"
                    style={{
                      left: `${loopStart}%`,
                      width: `${loopEnd - loopStart}%`,
                      opacity: isLooping ? 1 : 0.3
                    }}
                  />
                  <div
                    className="intensive-player-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
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
                    onClick={() => scrubAudio(-2)}
                    aria-label="Back 2 seconds"
                  >
                    <svg className="scrub-svg" width="24" height="24" viewBox="-2 -2 40 40" fill="none">
                      <g transform="translate(36 0) scale(-1 1)">
                        <circle className="scrub-arc" cx="18" cy="18" r="12" />
                        <path className="scrub-arrowhead" d="M 22 6 L 16 4 L 16 8 Z" />
                      </g>
                      <text className="scrub-text" x="18" y="19" textAnchor="middle" dominantBaseline="middle">2</text>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="intensive-player-btn intensive-player-btn-play"
                    onClick={togglePlayPause}
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
                    onClick={() => scrubAudio(2)}
                    aria-label="Forward 2 seconds"
                  >
                    <svg className="scrub-svg" width="24" height="24" viewBox="-2 -2 40 40" fill="none">
                      <circle className="scrub-arc" cx="18" cy="18" r="12" />
                      <path className="scrub-arrowhead" d="M 22 6 L 16 4 L 16 8 Z" />
                      <text className="scrub-text" x="18" y="19" textAnchor="middle" dominantBaseline="middle">2</text>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`intensive-player-btn ${isLooping ? 'is-active' : ''}`}
                    onClick={toggleLoop}
                    aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
                    aria-pressed={isLooping}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 2l4 4-4 4" />
                      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                      <path d="M7 22l-4-4 4-4" />
                      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Row 4: Vocab zone */}
              <div className="intensive-vocab-zone">
                {isTranslationVisible && currentWordPairs.length > 0 && (
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
      )}
    </>
  )
}

export default IntensiveListeningMode
