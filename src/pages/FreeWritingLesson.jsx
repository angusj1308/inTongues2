import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  deleteFreeWritingLesson,
  finalizeFreeWritingLine,
  getFreeWritingLesson,
  resetFreeWritingLesson,
  saveFreeWritingLine,
  updateFreeWritingLesson,
} from '../services/freewriting'
import { loadUserVocab, normaliseExpression, upsertVocabEntry } from '../services/vocab'
import {
  LANGUAGE_HIGHLIGHT_COLORS,
  STATUS_OPACITY,
} from '../constants/highlightColors'

// Helper to get language color with case-insensitive lookup
const getLanguageColor = (language) => {
  if (!language) return LANGUAGE_HIGHLIGHT_COLORS.default
  const exactMatch = LANGUAGE_HIGHLIGHT_COLORS[language]
  if (exactMatch) return exactMatch
  const capitalized = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase()
  return LANGUAGE_HIGHLIGHT_COLORS[capitalized] || LANGUAGE_HIGHLIGHT_COLORS.default
}

// Word status constants for the vocab panel
const STATUS_LEVELS = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'U', 'R', 'F', 'K']

// Get background style for a status button when active
const getStatusButtonStyle = (statusLevel, isActive, languageColor) => {
  if (!isActive) return {}

  switch (statusLevel) {
    case 'new':
      return {
        background: `color-mix(in srgb, #F97316 ${STATUS_OPACITY.new * 100}%, white)`,
        color: '#9a3412'
      }
    case 'unknown':
      return {
        background: `color-mix(in srgb, ${languageColor} ${STATUS_OPACITY.unknown * 100}%, white)`,
        color: '#1e293b'
      }
    case 'recognised':
      return {
        background: `color-mix(in srgb, ${languageColor} ${STATUS_OPACITY.recognised * 100}%, white)`,
        color: '#1e293b'
      }
    case 'familiar':
      return {
        background: `color-mix(in srgb, ${languageColor} ${STATUS_OPACITY.familiar * 100}%, white)`,
        color: '#64748b'
      }
    case 'known':
      return {
        background: 'color-mix(in srgb, #22c55e 40%, white)',
        color: '#166534'
      }
    default:
      return {}
  }
}

// Play icon for audio button
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

// Get feedback state: 'pass' (5), 'acceptable' (3-4), 'fail' (1-2)
const getFeedbackState = (score) => {
  if (score >= 5) return 'pass'
  if (score >= 3) return 'acceptable'
  return 'fail'
}

// Get the icon for feedback state
const getFeedbackIcon = (state) => {
  switch (state) {
    case 'pass': return '✓'
    case 'acceptable': return '~'
    case 'fail': return '✗'
    default: return '?'
  }
}

// Get highlight style for a word based on status
const getHighlightStyle = (language, status, enableHighlight) => {
  if (!enableHighlight) return {}

  const opacity = STATUS_OPACITY[status]
  if (!opacity || opacity === 0) return {}

  // New words are always orange, others use language color
  const base = status === 'new' ? '#F97316' : getLanguageColor(language)

  return {
    '--hlt-base': base,
    '--hlt-opacity': opacity,
  }
}

const FreeWritingLesson = () => {
  const { lessonId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Current line state
  const [userText, setUserText] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [modelSentence, setModelSentence] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([])

  // Follow-up question state
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [followUpLoading, setFollowUpLoading] = useState(false)

  // Vocab state for word highlighting
  const [userVocab, setUserVocab] = useState({})

  // Word panel state for NURF words
  const [nurfWords, setNurfWords] = useState([])
  const [wordTranslations, setWordTranslations] = useState({})
  const audioRef = useRef(null)

  // Display settings
  const [showWordStatus, setShowWordStatus] = useState(true)
  const [feedbackInTarget, setFeedbackInTarget] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  })

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showNewWordsWarning, setShowNewWordsWarning] = useState(false)
  const [panelWidth, setPanelWidth] = useState(() => Math.max(480, Math.floor(window.innerWidth / 3)))
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [popup, setPopup] = useState(null)
  const [submittedText, setSubmittedText] = useState('')
  const [expandedCategories, setExpandedCategories] = useState({})
  const attemptInputRef = useRef(null)
  const documentInputRef = useRef(null)
  const chatEndRef = useRef(null)
  const resizeRef = useRef(null)
  const isResizing = useRef(false)
  const isUpdatingFromDocument = useRef(false)

  // Load lesson
  useEffect(() => {
    const loadLesson = async () => {
      if (!user || !lessonId) return

      try {
        const data = await getFreeWritingLesson(user.uid, lessonId)
        if (!data) {
          setError('Free writing lesson not found.')
          return
        }
        setLesson(data)

        // Load user's vocab for word status highlighting
        if (data.targetLanguage) {
          try {
            const vocab = await loadUserVocab(user.uid, data.targetLanguage)
            setUserVocab(vocab)
          } catch (vocabErr) {
            console.warn('Could not load vocab:', vocabErr)
          }
        }

        // Load existing line for current index if any
        const currentLine = data.lines?.find((l) => l.index === data.currentIndex)
        if (currentLine) {
          setUserText(currentLine.text || '')
          if (currentLine.feedback) {
            setFeedback(currentLine.feedback)
            setModelSentence(currentLine.modelSentence || '')
            setChatMessages([
              {
                role: 'assistant',
                content: currentLine.feedback.explanation || '',
                hasFeedback: true,
              },
            ])
          }
        }
      } catch (err) {
        console.error('Load error:', err)
        setError('Failed to load free writing lesson.')
      } finally {
        setLoading(false)
      }
    }

    loadLesson()
  }, [user, lessonId])

  // Handle dark mode toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Extract words from model sentence for review panel
  useEffect(() => {
    if (!modelSentence || !lesson?.targetLanguage) {
      setNurfWords([])
      return
    }

    const words = modelSentence.match(/[\p{L}\p{M}]+/gu) || []
    const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))]

    const wordList = uniqueWords
      .map(word => {
        const vocabEntry = userVocab[word]
        const status = vocabEntry?.status || 'new'
        const existingNurf = nurfWords.find(w => w.normalised === word)
        if (status === 'known' && !existingNurf) return null
        const translationData = wordTranslations[word] || {}
        return {
          word,
          displayWord: words.find(w => w.toLowerCase() === word) || word,
          normalised: word,
          status,
          translation: translationData.translation || vocabEntry?.translation || null,
          audioBase64: translationData.audioBase64 || null,
          audioUrl: translationData.audioUrl || null,
        }
      })
      .filter(Boolean)

    setNurfWords(wordList)

    // Fetch translations for words that don't have them
    const wordsNeedingData = wordList.filter(w => !w.translation)
    if (wordsNeedingData.length > 0) {
      const fetchTranslationsAndAudio = async () => {
        const newTranslations = { ...wordTranslations }

        const batchSize = 5
        for (let i = 0; i < wordsNeedingData.length; i += batchSize) {
          const batch = wordsNeedingData.slice(i, i + batchSize)
          const promises = batch.map(async (w) => {
            try {
              const response = await fetch('/api/translatePhrase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  phrase: w.displayWord,
                  sourceLang: lesson.targetLanguage,
                  targetLang: lesson.sourceLanguage,
                }),
              })
              if (response.ok) {
                const data = await response.json()
                newTranslations[w.normalised] = {
                  translation: data.translation || null,
                  audioBase64: data.audioBase64 || null,
                  audioUrl: data.audioUrl || null,
                }
              }
            } catch (err) {
              console.warn('Failed to fetch translation for:', w.word, err)
            }
          })
          await Promise.all(promises)
        }
        setWordTranslations(newTranslations)

        setNurfWords(prev => prev.map(w => {
          const translationData = newTranslations[w.normalised]
          if (translationData) {
            return {
              ...w,
              translation: translationData.translation || w.translation,
              audioBase64: translationData.audioBase64 || w.audioBase64,
              audioUrl: translationData.audioUrl || w.audioUrl,
            }
          }
          return w
        }))
      }
      fetchTranslationsAndAudio()
    }
  }, [modelSentence, lesson?.targetLanguage, lesson?.sourceLanguage, userVocab])

  // Track the previous line index to detect navigation
  const prevIndexRef = useRef(lesson?.currentIndex)

  // Sync contentEditable with userText when navigating
  useLayoutEffect(() => {
    const currentIndex = lesson?.currentIndex
    const prevIndex = prevIndexRef.current

    if (currentIndex !== prevIndex) {
      prevIndexRef.current = currentIndex
      if (attemptInputRef.current) {
        attemptInputRef.current.textContent = userText || ''
      }
      if (documentInputRef.current) {
        documentInputRef.current.textContent = userText || ''
      }
    }
  }, [lesson?.currentIndex, userText])

  // Sync document contentEditable when userText changes from input field
  useEffect(() => {
    if (isUpdatingFromDocument.current) {
      isUpdatingFromDocument.current = false
      return
    }
    if (documentInputRef.current && documentInputRef.current.textContent !== userText) {
      const isDocumentFocused = document.activeElement === documentInputRef.current
      let savedSelection = null
      if (isDocumentFocused) {
        const sel = window.getSelection()
        if (sel.rangeCount > 0) {
          savedSelection = sel.getRangeAt(0).startOffset
        }
      }

      documentInputRef.current.textContent = userText || ''

      if (isDocumentFocused && savedSelection !== null && documentInputRef.current.firstChild) {
        const sel = window.getSelection()
        const range = document.createRange()
        const offset = Math.min(savedSelection, documentInputRef.current.textContent.length)
        range.setStart(documentInputRef.current.firstChild, offset)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }, [userText])

  // Handle input from document contentEditable
  const handleDocumentInput = useCallback((e) => {
    const newText = e.target.textContent || ''
    isUpdatingFromDocument.current = true
    setUserText(newText)
  }, [])

  // Clear corrections when user edits their text
  useEffect(() => {
    if (feedback && submittedText && userText !== submittedText) {
      setFeedback(prev => prev ? { ...prev, corrections: [] } : null)
    }
  }, [userText, submittedText, feedback])

  // Scroll chat to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Handle panel resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return
      const newWidth = e.clientX
      if (newWidth >= 280 && newWidth <= 600) {
        setPanelWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const startResize = () => {
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Handle word click for translation popup
  const handleWordClick = useCallback(async (word, event) => {
    event.stopPropagation()

    const normalised = normaliseExpression(word)
    const vocabEntry = userVocab[normalised]

    const rect = event.target.getBoundingClientRect()
    const x = Math.min(rect.left, window.innerWidth - 320)
    const y = rect.bottom + 8

    let translation = vocabEntry?.translation || wordTranslations[normalised]?.translation || null
    let audioBase64 = wordTranslations[normalised]?.audioBase64 || null
    let audioUrl = wordTranslations[normalised]?.audioUrl || null

    setPopup({
      x,
      y,
      word,
      normalised,
      translation: translation || 'Loading...',
      audioBase64,
      audioUrl,
      status: vocabEntry?.status || 'new',
    })

    if (!translation && lesson?.targetLanguage) {
      try {
        const response = await fetch('/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: word,
            sourceLang: lesson.targetLanguage,
            targetLang: lesson.sourceLanguage,
          }),
        })
        if (response.ok) {
          const data = await response.json()
          translation = data.translation || 'No translation found'
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null

          setPopup(prev => prev ? {
            ...prev,
            translation,
            audioBase64,
            audioUrl,
          } : null)

          setWordTranslations(prev => ({
            ...prev,
            [normalised]: { translation, audioBase64, audioUrl }
          }))
        }
      } catch (err) {
        console.warn('Failed to fetch translation:', err)
        setPopup(prev => prev ? { ...prev, translation: 'Translation failed' } : null)
      }
    }
  }, [userVocab, wordTranslations, lesson?.targetLanguage, lesson?.sourceLanguage])

  // Handle setting word status from popup
  const handlePopupStatusChange = useCallback(async (newStatus) => {
    if (!popup || !user || !lesson?.targetLanguage) return

    const dbStatus = newStatus === 'new' ? 'unknown' : newStatus

    try {
      await upsertVocabEntry(
        user.uid,
        lesson.targetLanguage,
        popup.word,
        popup.translation !== 'Loading...' ? popup.translation : null,
        dbStatus
      )

      setUserVocab(prev => ({
        ...prev,
        [popup.normalised]: {
          ...prev[popup.normalised],
          text: popup.word,
          status: dbStatus,
          translation: popup.translation !== 'Loading...' ? popup.translation : prev[popup.normalised]?.translation,
          language: lesson.targetLanguage,
        }
      }))

      setPopup(prev => prev ? { ...prev, status: dbStatus } : null)

      if (dbStatus === 'known') {
        setNurfWords(prev => prev.filter(w => w.normalised !== popup.normalised))
      } else {
        setNurfWords(prev => prev.map(w =>
          w.normalised === popup.normalised ? { ...w, status: dbStatus } : w
        ))
      }
    } catch (err) {
      console.error('Failed to update word status:', err)
    }
  }, [popup, user, lesson?.targetLanguage])

  // Close popup when clicking outside
  useEffect(() => {
    const handleGlobalClick = (event) => {
      if (!event.target.closest('.translate-popup')) {
        setPopup(null)
      }
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Helper function to render text with word status highlighting
  const renderTextWithWordStatus = useCallback((text, keyPrefix = '', clickable = true) => {
    if (!text) return null

    const tokens = text.match(/[\p{L}\p{M}]+|[^\p{L}\p{M}\s]+|\s+/gu) || []

    return tokens.map((token, idx) => {
      if (/^\s+$/.test(token) || !/[\p{L}\p{M}]/u.test(token)) {
        return <span key={`${keyPrefix}${idx}`}>{token}</span>
      }

      const normalised = normaliseExpression(token)
      const vocabEntry = userVocab[normalised]
      const status = vocabEntry?.status || 'new'

      const style = getHighlightStyle(lesson?.targetLanguage, status, showWordStatus)
      const highlighted = Boolean(style['--hlt-opacity'])

      return (
        <span
          key={`${keyPrefix}${idx}`}
          className={`reader-word ${highlighted ? 'reader-word--highlighted' : ''} ${clickable ? 'reader-word--clickable' : ''}`}
          style={style}
          onClick={clickable ? (e) => handleWordClick(token, e) : undefined}
        >
          {token}
        </span>
      )
    })
  }, [userVocab, lesson?.targetLanguage, showWordStatus, handleWordClick])

  // Render model sentence with word status highlighting
  const renderHighlightedModelSentence = useMemo(() => {
    return renderTextWithWordStatus(modelSentence, 'model-')
  }, [modelSentence, renderTextWithWordStatus])

  // Render text with correction highlights
  const renderTextWithCorrections = useCallback((text, corrections = []) => {
    if (!text || !corrections || corrections.length === 0) {
      return text
    }

    const sortedCorrections = [...corrections]
      .filter(c => typeof c.startIndex === 'number')
      .sort((a, b) => a.startIndex - b.startIndex)

    if (sortedCorrections.length === 0) {
      return text
    }

    const elements = []
    let lastIndex = 0

    sortedCorrections.forEach((correction, idx) => {
      if (correction.startIndex > lastIndex) {
        elements.push(
          <span key={`text-${idx}`}>
            {text.slice(lastIndex, correction.startIndex)}
          </span>
        )
      }

      const categoryColors = {
        grammar: '#ef4444',
        spelling: '#ef4444',
        naturalness: '#f59e0b',
        accuracy: '#3b82f6',
      }
      const underlineColor = categoryColors[correction.category] || '#ef4444'

      elements.push(
        <span
          key={`error-${idx}`}
          className="practice-correction-highlight"
          style={{
            textDecoration: 'underline',
            textDecorationColor: underlineColor,
            textDecorationStyle: 'wavy',
            textUnderlineOffset: '3px',
          }}
        >
          {text.slice(correction.startIndex, correction.endIndex)}
        </span>
      )

      lastIndex = correction.endIndex
    })

    if (lastIndex < text.length) {
      elements.push(
        <span key="text-end">{text.slice(lastIndex)}</span>
      )
    }

    return elements
  }, [])

  const handleSubmitForFeedback = useCallback(async () => {
    if (!userText.trim() || feedbackLoading) return

    setFeedbackLoading(true)
    setFeedback(null)
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: userText },
    ])

    try {
      // Get previous lines for context
      const previousLines = lesson.lines
        ?.filter(l => l.index < lesson.currentIndex)
        ?.sort((a, b) => a.index - b.index)
        ?.map(l => l.text)
        ?.slice(-3) || []

      const response = await fetch('/api/freewriting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: userText.trim(),
          targetLanguage: lesson.targetLanguage,
          sourceLanguage: lesson.sourceLanguage,
          textType: lesson.textType,
          previousLines,
          feedbackInTarget,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get feedback')
      }

      const data = await response.json()

      setFeedback(data.feedback)
      setModelSentence(data.modelSentence || '')
      setSubmittedText(userText.trim())

      // Open panel to show feedback
      setIsPanelOpen(true)

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.feedback?.explanation || 'Here is my feedback on your writing.',
          hasFeedback: true,
        },
      ])

      // Save the line
      await saveFreeWritingLine(user.uid, lessonId, {
        index: lesson.currentIndex,
        text: userText.trim(),
        modelSentence: data.modelSentence || '',
        feedback: data.feedback,
        status: 'reviewed',
      })

      // Refresh lesson data
      const updated = await getFreeWritingLesson(user.uid, lessonId)
      setLesson(updated)
    } catch (err) {
      console.error('Feedback error:', err)
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I had trouble analyzing your writing. Please try again.',
          isError: true,
        },
      ])
    } finally {
      setFeedbackLoading(false)
    }
  }, [userText, feedbackLoading, lesson, user, lessonId, feedbackInTarget])

  const handleFinalize = useCallback(async (useModel = false) => {
    if (feedbackLoading) return

    const finalText = useModel ? modelSentence : userText.trim()
    if (!finalText) return

    try {
      await finalizeFreeWritingLine(
        user.uid,
        lessonId,
        lesson.currentIndex,
        finalText
      )

      // Refresh lesson data
      const updated = await getFreeWritingLesson(user.uid, lessonId)
      setLesson(updated)

      // Reset state for next line
      setUserText('')
      setFeedback(null)
      setModelSentence('')
      setChatMessages([])
      setNurfWords([])

      if (attemptInputRef.current) {
        attemptInputRef.current.textContent = ''
      }

      attemptInputRef.current?.focus()
    } catch (err) {
      console.error('Finalize error:', err)
      setError('Failed to save progress.')
    }
  }, [userText, modelSentence, feedbackLoading, lesson, user, lessonId])

  const handleDelete = async () => {
    try {
      await deleteFreeWritingLesson(user.uid, lessonId)
      navigate('/dashboard')
    } catch (err) {
      console.error('Delete error:', err)
      setError('Failed to delete lesson.')
    }
  }

  const handleReset = async () => {
    try {
      await resetFreeWritingLesson(user.uid, lessonId)
      const updated = await getFreeWritingLesson(user.uid, lessonId)
      setLesson(updated)

      setUserText('')
      setFeedback(null)
      setModelSentence('')
      setChatMessages([])
      setNurfWords([])
      setWordTranslations({})
      setShowResetConfirm(false)

      setTimeout(() => {
        if (attemptInputRef.current) {
          attemptInputRef.current.textContent = ''
          attemptInputRef.current.focus()
        }
      }, 50)
    } catch (err) {
      console.error('Reset error:', err)
      setError('Failed to reset lesson.')
    }
  }

  const handleGoToLine = async (index) => {
    if (index === lesson.currentIndex) return

    try {
      await updateFreeWritingLesson(user.uid, lessonId, { currentIndex: index })
      const updated = await getFreeWritingLesson(user.uid, lessonId)
      setLesson(updated)

      const lineData = updated.lines?.find((l) => l.index === index)
      if (lineData) {
        setUserText(lineData.text || '')

        if (lineData.feedback) {
          setFeedback(lineData.feedback)
          setModelSentence(lineData.modelSentence || '')
          setChatMessages([
            { role: 'user', content: lineData.text },
            {
              role: 'assistant',
              content: lineData.feedback.explanation || '',
              hasFeedback: true,
            },
          ])
        } else {
          setFeedback(null)
          setModelSentence('')
          setChatMessages([])
        }
      } else {
        setUserText('')
        setFeedback(null)
        setModelSentence('')
        setChatMessages([])
      }

      setTimeout(() => {
        attemptInputRef.current?.focus()
      }, 0)
    } catch (err) {
      console.error('Navigation error:', err)
    }
  }

  // Handle word status change from vocab panel
  const handleWordStatusChange = useCallback(async (word, newStatus) => {
    if (!user || !lesson?.targetLanguage) return

    try {
      const normalised = normaliseExpression(word)
      const existingEntry = userVocab[normalised]
      const translation = existingEntry?.translation || wordTranslations[normalised]?.translation || null

      const dbStatus = newStatus === 'new' ? 'unknown' : newStatus

      await upsertVocabEntry(
        user.uid,
        lesson.targetLanguage,
        word,
        translation,
        dbStatus
      )

      setUserVocab(prev => ({
        ...prev,
        [normalised]: {
          ...prev[normalised],
          text: word,
          status: dbStatus,
          translation,
          language: lesson.targetLanguage,
        }
      }))

      setNurfWords(prev => prev.map(w =>
        w.normalised === normalised ? { ...w, status: dbStatus } : w
      ))
    } catch (err) {
      console.error('Failed to update word status:', err)
    }
  }, [user, lesson?.targetLanguage, userVocab, wordTranslations])

  // Check for new words before finalizing
  const attemptFinalize = useCallback((useModel = false) => {
    const hasNewWords = nurfWords.some(w => w.status === 'new')
    if (hasNewWords) {
      setShowNewWordsWarning(true)
    } else {
      handleFinalize(useModel)
    }
  }, [nurfWords, handleFinalize])

  // Mark all new words as known and proceed
  const handleConfirmNewWordsAsKnown = useCallback(async () => {
    const newWords = nurfWords.filter(w => w.status === 'new')
    for (const wordData of newWords) {
      await handleWordStatusChange(wordData.displayWord, 'known')
    }
    setShowNewWordsWarning(false)
    handleFinalize(false)
  }, [nurfWords, handleWordStatusChange, handleFinalize])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!feedback) {
        handleSubmitForFeedback()
      } else {
        // Auto-save and continue to next line
        handleFinalize(false)
      }
    }
  }

  // Play audio for a word
  const handlePlayWordAudio = useCallback((audioBase64, audioUrl) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio()
    if (audioBase64) {
      audio.src = `data:audio/mp3;base64,${audioBase64}`
    } else if (audioUrl) {
      audio.src = audioUrl
    }
    audio.play().catch((err) => console.error('Audio playback failed:', err))
    audioRef.current = audio
  }, [])

  const handleFollowUp = async () => {
    if (!followUpQuestion.trim() || followUpLoading) return

    setFollowUpLoading(true)
    const question = followUpQuestion.trim()
    setFollowUpQuestion('')

    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
    ])

    try {
      const response = await fetch('/api/practice/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: {
            sourceSentence: null,
            userAttempt: userText,
            modelSentence: modelSentence,
            feedback: feedback,
            targetLanguage: lesson.targetLanguage,
            sourceLanguage: lesson.sourceLanguage,
            contextSummary: `Free writing (${lesson.textType})`,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response },
      ])
    } catch (err) {
      console.error('Follow-up error:', err)
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I couldn\'t process your question.', isError: true },
      ])
    } finally {
      setFollowUpLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="practice-lesson-page">
        <p className="muted">Loading lesson...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="practice-lesson-page">
        <p className="error">{error}</p>
        <button className="button ghost" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  if (!lesson) {
    return null
  }

  const lineCount = lesson.lines?.length || 0
  const wordCount = lesson.wordCount || 0

  return (
    <div className="practice-lesson-page freewriting-page">
      {/* Header */}
      <header className="dashboard-header practice-header" style={{ minHeight: '56px' }}>
        <div className="dashboard-brand-band practice-header-band">
          <div className="practice-header-left">
            <button
              className="dashboard-control ui-text"
              onClick={() => navigate('/dashboard')}
            >
              Back to library
            </button>
          </div>

          <div className="practice-header-center">
            <span className="freewriting-stats">
              {wordCount} words · {lineCount} lines
            </span>
          </div>

          <div className="practice-header-actions">
            <button
              className="practice-header-button"
              type="button"
              onClick={() => setShowWordStatus(!showWordStatus)}
              aria-pressed={showWordStatus}
              title="Toggle word highlighting"
            >
              <svg className="practice-header-icon" viewBox="0 0 24 24" fill="none" stroke={showWordStatus ? '#F97316' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7V4h16v3" />
                <path d="M9 20h6" />
                <path d="M12 4v16" />
              </svg>
            </button>
            <button
              className="practice-header-button"
              type="button"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? (
                <svg className="practice-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg className="practice-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>
            <button
              className="practice-header-button"
              type="button"
              aria-label="Reset lesson"
              onClick={() => setShowResetConfirm(true)}
              title="Reset"
            >
              <svg className="practice-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="practice-layout">
        {/* Tutor panel toggle tab */}
        <button
          className="freewriting-panel-tab"
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          title={isPanelOpen ? 'Hide tutor' : 'Show tutor'}
          style={{
            position: 'fixed',
            left: isPanelOpen ? panelWidth : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 100,
            background: 'var(--bg-primary, #fff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderLeft: isPanelOpen ? '1px solid var(--border-color, #e2e8f0)' : 'none',
            borderRadius: isPanelOpen ? '0 8px 8px 0' : '0 8px 8px 0',
            padding: '12px 8px',
            cursor: 'pointer',
            boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
            transition: 'left 0.2s ease',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: isPanelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        {/* Left panel - Feedback (collapsible) */}
        <aside
          className="practice-chat-panel"
          style={{
            width: panelWidth,
            transform: isPanelOpen ? 'translateX(0)' : `translateX(-100%)`,
            transition: 'transform 0.2s ease',
            position: 'fixed',
            left: 0,
            top: '56px',
            bottom: 0,
            zIndex: 99,
          }}
        >
          <div className="practice-chat-header">
            <h2>Tutor</h2>
            <button
              className="freewriting-panel-close"
              onClick={() => setIsPanelOpen(false)}
              title="Close panel"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="practice-chat-messages">
            {/* Instructions */}
            <div className="practice-tutor-prompt">
              <span className="prompt-label">Write in {lesson.targetLanguage}</span>
              <p className="prompt-text" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                Press Enter to get feedback on your sentence.
              </p>
            </div>

            {/* Chat messages with feedback inline */}
            {chatMessages.map((msg, i) => (
              <div key={i}>
                {/* Render expandable checklist BEFORE the assistant feedback message */}
                {msg.role === 'assistant' && msg.hasFeedback && feedback && (
                  <div className="practice-feedback-checklist">
                    {/* Grammar & Spelling - expandable */}
                    {(() => {
                      const grammarCorrections = feedback?.corrections?.filter(c => c.category === 'grammar' || c.category === 'spelling') || []
                      const grammarState = grammarCorrections.length > 0 ? 'fail' : 'pass'
                      const isExpanded = expandedCategories['grammar']
                      return (
                        <div className={`feedback-check-item ${grammarState} ${isExpanded ? 'expanded' : ''}`}>
                          <div
                            className="feedback-check-header"
                            onClick={() => grammarCorrections.length > 0 && setExpandedCategories(prev => ({ ...prev, grammar: !prev.grammar }))}
                            style={{ cursor: grammarCorrections.length > 0 ? 'pointer' : 'default' }}
                          >
                            <span className="check-label">
                              Grammar & Spelling
                              {grammarCorrections.length > 0 && (
                                <span className="check-count">({grammarCorrections.length})</span>
                              )}
                            </span>
                            <span className="check-status">
                              <span className={`check-icon ${grammarState}`}>
                                {getFeedbackIcon(grammarState)}
                              </span>
                              {grammarCorrections.length > 0 && (
                                <span className="check-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </div>
                          {isExpanded && grammarCorrections.length > 0 && (
                            <div className="feedback-corrections-list">
                              {grammarCorrections.map((c, idx) => (
                                <div key={idx} className="feedback-correction-item">
                                  <span className="correction-original">{c.original}</span>
                                  <span className="correction-arrow">→</span>
                                  <span className="correction-fix">{c.correction}</span>
                                  <p className="correction-explanation">{c.explanation}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Naturalness - expandable */}
                    {(() => {
                      const naturalnessCorrections = feedback?.corrections?.filter(c => c.category === 'naturalness') || []
                      const naturalnessState = naturalnessCorrections.length > 0 ? 'acceptable' : 'pass'
                      const isExpanded = expandedCategories['naturalness']
                      return (
                        <div className={`feedback-check-item ${naturalnessState} ${isExpanded ? 'expanded' : ''}`}>
                          <div
                            className="feedback-check-header"
                            onClick={() => naturalnessCorrections.length > 0 && setExpandedCategories(prev => ({ ...prev, naturalness: !prev.naturalness }))}
                            style={{ cursor: naturalnessCorrections.length > 0 ? 'pointer' : 'default' }}
                          >
                            <span className="check-label">
                              Naturalness
                              {naturalnessCorrections.length > 0 && (
                                <span className="check-count">({naturalnessCorrections.length})</span>
                              )}
                            </span>
                            <span className="check-status">
                              <span className={`check-icon ${naturalnessState}`}>
                                {getFeedbackIcon(naturalnessState)}
                              </span>
                              {naturalnessCorrections.length > 0 && (
                                <span className="check-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </div>
                          {isExpanded && naturalnessCorrections.length > 0 && (
                            <div className="feedback-corrections-list">
                              {naturalnessCorrections.map((c, idx) => (
                                <div key={idx} className="feedback-correction-item">
                                  <span className="correction-original">{c.original}</span>
                                  <span className="correction-arrow">→</span>
                                  <span className="correction-fix">{c.correction}</span>
                                  <p className="correction-explanation">{c.explanation}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Document feedback display */}
                {msg.role === 'assistant' && msg.hasDocumentFeedback && lesson.documentFeedback && (
                  <div className="practice-feedback-checklist">
                    <div className="feedback-check-item pass">
                      <div className="feedback-check-header">
                        <span className="check-label">Overall Score</span>
                        <span className="check-status">
                          {lesson.documentFeedback.overallScore || 'N/A'}/5
                        </span>
                      </div>
                    </div>
                    {lesson.documentFeedback.strengths?.length > 0 && (
                      <div className="feedback-check-item pass">
                        <div className="feedback-check-header">
                          <span className="check-label">Strengths</span>
                        </div>
                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>
                          {lesson.documentFeedback.strengths.map((s, idx) => (
                            <li key={idx} style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {lesson.documentFeedback.suggestions?.length > 0 && (
                      <div className="feedback-check-item acceptable">
                        <div className="feedback-check-header">
                          <span className="check-label">Suggestions</span>
                        </div>
                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>
                          {lesson.documentFeedback.suggestions.map((s, idx) => (
                            <li key={idx} style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Only show chat message for user messages and non-feedback assistant messages */}
                {!(msg.role === 'assistant' && (msg.hasFeedback || msg.hasDocumentFeedback)) && (
                  <div
                    className={`practice-chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}
                  >
                    {msg.role === 'assistant' && feedbackInTarget && showWordStatus
                      ? renderTextWithWordStatus(msg.content, `chat-${i}-`)
                      : msg.content}
                  </div>
                )}

                {/* Render example and word panel after feedback message */}
                {msg.role === 'assistant' && msg.hasFeedback && (
                  <>
                    {modelSentence && (
                      <div className="practice-example-sentence">
                        <span className="example-label">A more natural way:</span>
                        <p className="example-text">
                          {renderHighlightedModelSentence}
                        </p>
                        <button
                          className="practice-use-example-btn"
                          onClick={() => {
                            setUserText(modelSentence)
                            setSubmittedText('')
                          }}
                        >
                          Use this version
                        </button>
                      </div>
                    )}

                    {/* Word panel for NURF words */}
                    {nurfWords.length > 0 && (
                      <div className="practice-word-panel">
                        <div className="practice-word-panel-header">
                          <span className="practice-word-panel-label">Words to review</span>
                        </div>
                        <div className="practice-word-panel-list">
                          {nurfWords.map((wordData) => {
                            const statusIndex = STATUS_LEVELS.indexOf(wordData.status)
                            const validStatusIndex = statusIndex >= 0 ? statusIndex : 0
                            const languageColor = getLanguageColor(lesson?.targetLanguage)
                            const translationData = wordTranslations[wordData.normalised] || {}
                            const translation = translationData.translation || wordData.translation || '...'
                            const hasAudio = Boolean(wordData.audioBase64 || wordData.audioUrl || translationData.audioBase64 || translationData.audioUrl)

                            return (
                              <div key={wordData.normalised} className="practice-word-row">
                                <div className="practice-word-row-left">
                                  <button
                                    className={`practice-word-audio ${hasAudio ? '' : 'practice-word-audio--disabled'}`}
                                    onClick={() => hasAudio && handlePlayWordAudio(
                                      wordData.audioBase64 || translationData.audioBase64,
                                      wordData.audioUrl || translationData.audioUrl
                                    )}
                                    disabled={!hasAudio}
                                    aria-label={`Play pronunciation for ${wordData.displayWord}`}
                                  >
                                    <PlayIcon />
                                  </button>
                                  <span className="practice-word-row-word">{wordData.displayWord}</span>
                                  <span className="practice-word-row-translation">{translation}</span>
                                </div>
                                <div className="practice-word-status-selector">
                                  {STATUS_ABBREV.map((abbrev, i) => {
                                    const isActive = i === validStatusIndex
                                    const style = getStatusButtonStyle(STATUS_LEVELS[i], isActive, languageColor)

                                    return (
                                      <button
                                        key={abbrev}
                                        type="button"
                                        className={`practice-status-option ${isActive ? 'active' : ''}`}
                                        style={style}
                                        onClick={() => handleWordStatusChange(wordData.displayWord, STATUS_LEVELS[i])}
                                        aria-label={`Set ${wordData.displayWord} status to ${STATUS_LEVELS[i]}`}
                                        aria-pressed={isActive}
                                      >
                                        {abbrev}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Loading state for feedback */}
            {feedbackLoading && (
              <div className="practice-feedback-checklist">
                <div className="feedback-check-item checking">
                  <span className="check-label">Grammar & Spelling</span>
                  <span className="check-status">
                    <span className="checking-text">checking...</span>
                  </span>
                </div>
                <div className="feedback-check-item checking">
                  <span className="check-label">Naturalness</span>
                  <span className="check-status">
                    <span className="checking-text">checking...</span>
                  </span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Panel footer - just for follow-up questions when feedback is shown */}
          <div className="practice-panel-footer">
            {feedback && (
              <div className="practice-input-row">
                <input
                  type="text"
                  className="practice-input-field"
                  value={followUpQuestion}
                  onChange={(e) => setFollowUpQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && followUpQuestion.trim()) {
                      e.preventDefault()
                      handleFollowUp()
                    }
                  }}
                  placeholder="Ask a question..."
                  disabled={followUpLoading}
                />
                <button
                  className="practice-submit-btn"
                  onClick={handleFollowUp}
                  disabled={!followUpQuestion.trim() || followUpLoading}
                >
                  {followUpLoading ? '...' : 'Ask'}
                </button>
              </div>
            )}
          </div>

          {/* Resize handle */}
          <div
            className="practice-panel-resize"
            onMouseDown={startResize}
            ref={resizeRef}
          />
        </aside>

        {/* Right panel - Document (takes full width) */}
        <main className="practice-document-panel" style={{ marginLeft: 0, width: '100%' }}>
          <div className="practice-document-paper" style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Document title */}
            <h1 className="practice-document-title">{lesson.title}</h1>

            {/* Document body */}
            <div className="practice-document-body">
              {/* Render all finalized lines */}
              {lesson.lines?.filter(l => l.status === 'finalized').sort((a, b) => a.index - b.index).map((line) => (
                <span
                  key={`finalized-${line.index}`}
                  className="practice-document-sentence"
                  onClick={() => handleGoToLine(line.index)}
                  title="Click to revise"
                >
                  {renderTextWithWordStatus(line.text, `doc-${line.index}-`)}{' '}
                </span>
              ))}

              {/* Current line input */}
              {feedback && feedback.corrections?.length > 0 ? (
                <span className="practice-inline-display practice-inline-display--with-corrections">
                  {renderTextWithCorrections(userText, feedback.corrections)}
                </span>
              ) : (
                <span
                  className="practice-inline-display practice-inline-display--editable"
                  contentEditable
                  suppressContentEditableWarning
                  ref={documentInputRef}
                  onInput={handleDocumentInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (!feedback) {
                        handleSubmitForFeedback()
                      } else {
                        handleFinalize(false)
                      }
                    }
                  }}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Writing?</h3>
            <p>This will permanently delete this writing and all your progress.</p>
            <div className="modal-actions">
              <button className="button ghost" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="button danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="modal-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Writing?</h3>
            <p>This will clear all your written content and start over. Your saved vocabulary will not be affected.</p>
            <div className="modal-actions">
              <button className="button ghost" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button className="button primary" onClick={handleReset}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New words warning modal */}
      {showNewWordsWarning && (
        <div className="modal-backdrop" onClick={() => setShowNewWordsWarning(false)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <h3>Unreviewed Words</h3>
            <p>By proceeding to the next line, all new words will be moved to known.</p>
            <div className="modal-actions">
              <button className="button ghost" onClick={() => setShowNewWordsWarning(false)}>
                Review Words
              </button>
              <button className="button primary" onClick={handleConfirmNewWordsAsKnown}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Translation popup */}
      {popup && (
        <div
          className="translate-popup"
          style={{
            position: 'fixed',
            top: popup.y,
            left: popup.x,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="translate-popup-header">
            <div className="translate-popup-title">Translation</div>
            <button
              type="button"
              className="translate-popup-close"
              aria-label="Close translation popup"
              onClick={() => setPopup(null)}
            >
              ×
            </button>
          </div>

          <div className="translate-popup-body">
            <div className="translate-popup-language-column">
              <p className="translate-popup-language-label">
                {lesson?.targetLanguage || 'Target'}
              </p>
              <p className="translate-popup-language-text" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>{popup.word}</span>
                {(popup.audioBase64 || popup.audioUrl) && (
                  <button
                    type="button"
                    className="translate-popup-audio"
                    onClick={() => {
                      const audio = new Audio()
                      if (popup.audioBase64) {
                        audio.src = `data:audio/mp3;base64,${popup.audioBase64}`
                      } else if (popup.audioUrl) {
                        audio.src = popup.audioUrl
                      }
                      audio.play().catch(err => console.error('Audio playback failed:', err))
                    }}
                    aria-label="Play pronunciation"
                    style={{
                      border: '1px solid #d7d7db',
                      background: '#f5f5f7',
                      cursor: 'pointer',
                      padding: '0.35rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f172a',
                      borderRadius: '999px',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}
              </p>
            </div>

            <div className="translate-popup-language-column">
              <p className="translate-popup-language-label">
                {lesson?.sourceLanguage || 'Native'}
              </p>
              <p className="translate-popup-language-text">
                {popup.translation}
              </p>
            </div>
          </div>

          <div className="translate-popup-status">
            {STATUS_LEVELS.map((status) => {
              const isActive = (popup.status === status) ||
                (popup.status === 'unknown' && status === 'new') ||
                (status === 'new' && !popup.status)

              return (
                <button
                  key={status}
                  type="button"
                  className={`translate-popup-status-button ${isActive ? 'active' : ''}`}
                  onClick={() => handlePopupStatusChange(status)}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

export default FreeWritingLesson
