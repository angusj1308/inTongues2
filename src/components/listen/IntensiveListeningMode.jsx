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
  if (!status || status === 'unknown') return 'new'
  if (status === 'recognised' || status === 'familiar' || status === 'known') {
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
  pageTranslations,
  setPopup,
  intensiveSentenceIndex,
  setIntensiveSentenceIndex,
  audioRef,
  fullAudioUrl,
  user,
}) => {
  const [sentenceTranslations, setSentenceTranslations] = useState({})
  const [intensiveRevealStep, setIntensiveRevealStep] = useState('hidden')
  const [isTranscriptionMode, setIsTranscriptionMode] = useState(false)
  const [transcriptionDraft, setTranscriptionDraft] = useState('')
  const [isTranscriptRevealed, setIsTranscriptRevealed] = useState(false)
  const sentenceAudioStopRef = useRef(null)
  const fallbackAudioRef = useRef(null)
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

  useEffect(() => {
    if (listeningMode !== 'intensive') return undefined

    const ttsLanguage = normalizeLanguageCode(language)

    if (!ttsLanguage) return undefined

    const untranslatedSentences = intensiveSentences.filter(
      (sentence) => !sentenceTranslations[sentence]
    )

    if (untranslatedSentences.length === 0) return undefined

    let isCancelled = false

    const preloadTranslations = async () => {
      try {
        const results = await Promise.all(
          untranslatedSentences.map(async (sentence) => {
            try {
              const response = await fetch('http://localhost:4000/api/translatePhrase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    phrase: sentence,
                    sourceLang: language || 'es',
                    targetLang: resolveSupportedLanguageLabel(nativeLanguage),
                    ttsLanguage,
                  }),
                })

              if (!response.ok) {
                console.error('Sentence translation failed:', await response.text())
                return [sentence, 'Unable to fetch translation right now.']
              }

              const data = await response.json()
              return [sentence, data.translation || 'No translation found.']
            } catch (error) {
              console.error('Error translating sentence:', error)
              return [sentence, 'Unable to fetch translation right now.']
            }
          })
        )

        if (isCancelled) return

        setSentenceTranslations((prev) => {
          const next = { ...prev }
          results.forEach(([sentence, translation]) => {
            if (!sentence) return
            if (!next[sentence]) {
              next[sentence] = translation || 'Translation will appear here.'
            }
          })
          return next
        })
      } catch (error) {
        if (!isCancelled) {
          console.error('Error preloading intensive translations', error)
        }
      }
    }

    preloadTranslations()

    return () => {
      isCancelled = true
    }
  }, [intensiveSentences, language, nativeLanguage, listeningMode, sentenceTranslations])

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
    const cachedTranslation = pageTranslations[key] || pageTranslations[text] || null
    let translation = cachedTranslation
    let audioBase64 = null
    let audioUrl = null
    let targetText = cachedTranslation

    const ttsLanguage = normalizeLanguageCode(language)

    const shouldFetch = !cachedTranslation || !audioBase64 || !audioUrl

    if (shouldFetch && !ttsLanguage) {
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

    if (shouldFetch) {
      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: text,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(nativeLanguage),
            ttsLanguage,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          translation = translation || data.translation || 'No translation found'
          targetText = data.targetText || translation || 'No translation found'
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        } else {
          translation = translation || 'No translation found'
          targetText = targetText || 'No translation found'
        }
      } catch (err) {
        translation = translation || 'No translation found'
        targetText = targetText || 'No translation found'
      }
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

        elements.push(
          <WordTokenListening
            key={`word-${segmentIndex}-${index}`}
            text={token}
            status={status}
            language={language}
            listeningMode={listeningMode}
            onWordClick={handleSingleWordClick}
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
      return 'transcript'
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
          const translation =
            pageTranslations[key] || pageTranslations[word] || 'No translation found'

          return upsertVocabEntry(user.uid, language, word, translation, 'known')
        })
      )

      setVocabEntries((prev) => {
        const next = { ...prev }

        newWords.forEach((word) => {
          const key = normaliseExpression(word)
          const translation =
            pageTranslations[key] || pageTranslations[word] || 'No translation found'

          next[key] = {
            ...(next[key] || { text: word, language }),
            status: 'known',
            translation,
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

  const playSentenceAudio = useCallback(
    (index) => {
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

      if (!audio) return

      const segment = transcriptSegments[index]
      if (!segment) return

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
            : audio.duration || startTime

      try {
        audio.currentTime = startTime
      } catch (error) {
        console.error('Failed to set sentence audio start time', error)
        return
      }

      audio
        .play()
        .catch((err) => console.error('Sentence playback failed', err))

      if (sentenceAudioStopRef.current) {
        audio.removeEventListener('timeupdate', sentenceAudioStopRef.current)
        sentenceAudioStopRef.current = null
      }

      const stopAtEnd = () => {
        if (audio.currentTime >= endTime) {
          audio.pause()
          audio.currentTime = Math.min(audio.currentTime, endTime)
          audio.removeEventListener('timeupdate', stopAtEnd)
          sentenceAudioStopRef.current = null
        }
      }

      sentenceAudioStopRef.current = stopAtEnd
      audio.addEventListener('timeupdate', stopAtEnd)
    },
    [audioRef, fullAudioUrl, transcriptSegments]
  )

  useEffect(() => {
    const audio = audioRef?.current || fallbackAudioRef.current
    if (!audio) return undefined

    return () => {
      if (sentenceAudioStopRef.current) {
        audio.removeEventListener('timeupdate', sentenceAudioStopRef.current)
        sentenceAudioStopRef.current = null
      }
    }
  }, [audioRef])

  useEffect(() => {
    if (listeningMode !== 'intensive') return undefined

    const handleIntensiveShortcuts = (event) => {
      const activeElement = document.activeElement
      const activeTag = activeElement?.tagName
      const isEditable =
        (activeTag && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(activeTag)) ||
        activeElement?.isContentEditable
      const isArrowLeft = event.key === 'ArrowLeft'
      const isArrowRight = event.key === 'ArrowRight'

      if (isEditable) {
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

      if (event.code === 'Space' || event.key === ' ') {
        if (!transcriptSegments.length) return
        event.preventDefault()
        playSentenceAudio(intensiveSentenceIndex)
        return
      }

      if (isArrowLeft) {
        event.preventDefault()
        handleSentenceNavigation('previous')
        return
      }

      if (isArrowRight) {
        event.preventDefault()
        handleSentenceNavigation('next')
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
  ])

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
              ttsLanguage,
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

    const translation = pageTranslations[clean] || pageTranslations[selection] || 'No translation found'

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
        <div className="reader-intensive-overlay">
          <div className="reader-intensive-card">
            <div className="reader-intensive-header">
              <button
                type="button"
                className={`intensive-transcription-toggle ${isTranscriptionMode ? 'is-active' : ''}`}
                onClick={handleTranscriptionToggle}
                aria-pressed={isTranscriptionMode}
              >
                Transcription {isTranscriptionMode ? 'On' : 'Off'}
              </button>
            </div>

            <div className="reader-intensive-sentence" onMouseUp={handleWordClick}>
              {isTranscriptVisible ? (
                currentIntensiveSentence ? (
                  renderWordSegments(currentIntensiveSentence)
                ) : (
                  'No text available for this transcript.'
                )
              ) : (
                <span className="reader-intensive-placeholder">
                  Audio only — reveal the transcript when you are ready.
                </span>
              )}
            </div>

            {isTranscriptionMode && (
              <div className="reader-intensive-input-row">
                <input
                  type="text"
                  className="reader-intensive-input intensive-input"
                  placeholder="Type what you hear, then press Enter to reveal."
                  value={transcriptionDraft}
                  onChange={(event) => setTranscriptionDraft(event.target.value)}
                  onKeyDown={handleTranscriptionKeyDown}
                  readOnly={isTranscriptRevealed}
                />
                <p className="reader-intensive-input-helper">
                  Press Enter to check your transcription.
                </p>
              </div>
            )}

            <div className="reader-intensive-controls">
              <button
                type="button"
                className="intensive-translation-toggle"
                onClick={toggleIntensiveRevealStep}
                disabled={isTranscriptionMode && !isTranscriptRevealed}
              >
                {toggleLabel}
              </button>

              <p
                className={`reader-intensive-translation ${
                  isTranslationVisible ? 'is-visible' : 'is-hidden'
                }`}
              >
                {intensiveTranslation || 'Translation will appear here.'}
              </p>
            </div>

            <p className="reader-intensive-helper">
              {isTranscriptionMode
                ? 'Space = play / repeat · Enter = reveal transcript · ← / → = previous / next sentence'
                : 'Space = play / repeat · ← / → = previous / next sentence'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export default IntensiveListeningMode
