import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  deletePracticeLesson,
  finalizeAttempt,
  getCompletedDocument,
  getPracticeLesson,
  resetPracticeLesson,
  saveAttempt,
  updatePracticeLesson,
} from '../services/practice'
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

const PracticeLesson = () => {
  const { lessonId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Current sentence state
  const [userAttempt, setUserAttempt] = useState('')
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
    // Check if dark mode is already set
    return document.documentElement.getAttribute('data-theme') === 'dark'
  })

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showNewWordsWarning, setShowNewWordsWarning] = useState(false)
  const [panelWidth, setPanelWidth] = useState(380)
  const attemptInputRef = useRef(null)
  const chatEndRef = useRef(null)
  const resizeRef = useRef(null)
  const isResizing = useRef(false)

  // Load lesson
  useEffect(() => {
    const loadLesson = async () => {
      if (!user || !lessonId) return

      try {
        const data = await getPracticeLesson(user.uid, lessonId)
        if (!data) {
          setError('Practice lesson not found.')
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

        // Load existing attempt for current sentence if any
        const currentAttempt = data.attempts?.find(
          (a) => a.sentenceIndex === data.currentIndex
        )
        if (currentAttempt) {
          setUserAttempt(currentAttempt.userText || '')
          if (currentAttempt.feedback) {
            setFeedback(currentAttempt.feedback)
            setModelSentence(currentAttempt.modelSentence || '')
            setChatMessages([
              {
                role: 'assistant',
                content: currentAttempt.feedback.explanation || '',
                hasFeedback: true,
              },
            ])
          }
        }
      } catch (err) {
        console.error('Load error:', err)
        setError('Failed to load practice lesson.')
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

  // Extract words from model sentence for review panel (includes all non-known initially)
  useEffect(() => {
    if (!modelSentence || !lesson?.targetLanguage) {
      setNurfWords([])
      return
    }

    // Extract unique words from model sentence
    const words = modelSentence.match(/[\p{L}\p{M}]+/gu) || []
    const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))]

    // Include all words that aren't already known in vocab (new words stay visible after being marked known)
    const wordList = uniqueWords
      .map(word => {
        const vocabEntry = userVocab[word]
        const status = vocabEntry?.status || 'new'
        // Only filter out words that were already known BEFORE this sentence
        // Check if word is in nurfWords already - if so, keep showing it
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

    // Fetch translations and audio for words that don't have them
    const wordsNeedingData = wordList.filter(w => !w.translation)
    if (wordsNeedingData.length > 0) {
      const fetchTranslationsAndAudio = async () => {
        const newTranslations = { ...wordTranslations }

        // Batch fetch in groups of 5
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
                  sourceLanguage: lesson.targetLanguage,
                  targetLanguage: lesson.sourceLanguage,
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
      }
      fetchTranslationsAndAudio()
    }
  }, [modelSentence, lesson?.targetLanguage, lesson?.sourceLanguage, userVocab])

  // Sync contentEditable with userAttempt when navigating to a sentence
  // Using useLayoutEffect to ensure sync happens before paint
  useLayoutEffect(() => {
    if (attemptInputRef.current && userAttempt !== undefined) {
      // Only update if content differs to avoid cursor jumping
      if (attemptInputRef.current.textContent !== userAttempt) {
        attemptInputRef.current.textContent = userAttempt
      }
    }
  }, [lesson?.currentIndex, userAttempt]) // Re-sync when sentence or content changes

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

  const currentSentence = lesson?.sentences?.[lesson.currentIndex]
  const completedDocument = lesson ? getCompletedDocument(lesson) : ''

  // Helper function to render text with word status highlighting (using app's standard approach)
  const renderTextWithWordStatus = useCallback((text, keyPrefix = '') => {
    if (!text) return null

    // Split into words while preserving punctuation
    const tokens = text.match(/[\p{L}\p{M}]+|[^\p{L}\p{M}\s]+|\s+/gu) || []

    return tokens.map((token, idx) => {
      // Skip whitespace and punctuation
      if (/^\s+$/.test(token) || !/[\p{L}\p{M}]/u.test(token)) {
        return <span key={`${keyPrefix}${idx}`}>{token}</span>
      }

      // Check word status in vocab
      const normalised = normaliseExpression(token)
      const vocabEntry = userVocab[normalised]
      const status = vocabEntry?.status || 'new'

      // Get highlight style using app's standard approach
      const style = getHighlightStyle(lesson?.targetLanguage, status, showWordStatus)
      const highlighted = Boolean(style['--hlt-opacity'])

      return (
        <span
          key={`${keyPrefix}${idx}`}
          className={`reader-word ${highlighted ? 'reader-word--highlighted' : ''}`}
          style={style}
        >
          {token}
        </span>
      )
    })
  }, [userVocab, lesson?.targetLanguage, showWordStatus])

  // Render model sentence with word status highlighting
  const renderHighlightedModelSentence = useMemo(() => {
    return renderTextWithWordStatus(modelSentence, 'model-')
  }, [modelSentence, renderTextWithWordStatus])

  const handleSubmitAttempt = useCallback(async () => {
    if (!userAttempt.trim() || feedbackLoading) return

    setFeedbackLoading(true)
    setFeedback(null)
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: userAttempt },
    ])

    try {
      // Call the practice feedback endpoint
      const response = await fetch('/api/practice/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nativeSentence: currentSentence.text,
          userAttempt: userAttempt.trim(),
          targetLanguage: lesson.targetLanguage,
          sourceLanguage: lesson.sourceLanguage,
          adaptationLevel: lesson.adaptationLevel,
          contextSummary: lesson.contextSummary,
          feedbackInTarget,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get feedback')
      }

      const data = await response.json()

      setFeedback(data.feedback)
      setModelSentence(data.modelSentence || '')

      // Add tutor response to chat with feedback flag
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.feedback?.explanation || 'Here is my feedback on your attempt.',
          hasFeedback: true,
        },
      ])

      // Save the attempt
      await saveAttempt(user.uid, lessonId, {
        sentenceIndex: lesson.currentIndex,
        userText: userAttempt.trim(),
        modelSentence: data.modelSentence || '',
        feedback: data.feedback,
        status: 'attempted',
      })

      // Refresh lesson data
      const updated = await getPracticeLesson(user.uid, lessonId)
      setLesson(updated)
    } catch (err) {
      console.error('Feedback error:', err)
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I had trouble analyzing your attempt. Please try again.',
          isError: true,
        },
      ])
    } finally {
      setFeedbackLoading(false)
    }
  }, [userAttempt, feedbackLoading, currentSentence, lesson, user, lessonId])

  const handleFinalize = useCallback(async (useModel = false) => {
    if (feedbackLoading) return

    const finalText = useModel ? modelSentence : userAttempt.trim()
    if (!finalText) return

    try {
      const result = await finalizeAttempt(
        user.uid,
        lessonId,
        lesson.currentIndex,
        finalText
      )

      // Refresh lesson data
      const updated = await getPracticeLesson(user.uid, lessonId)
      setLesson(updated)

      // Reset state for next sentence
      setUserAttempt('')
      setFeedback(null)
      setModelSentence('')
      setChatMessages([])

      // Clear the contentEditable span's DOM content
      if (attemptInputRef.current) {
        attemptInputRef.current.textContent = ''
      }

      if (result.isComplete) {
        setChatMessages([
          {
            role: 'assistant',
            content: 'Congratulations! You\'ve completed this practice lesson!',
          },
        ])
      }

      attemptInputRef.current?.focus()
    } catch (err) {
      console.error('Finalize error:', err)
      setError('Failed to save progress.')
    }
  }, [userAttempt, modelSentence, feedbackLoading, lesson, user, lessonId])

  const handleDelete = async () => {
    try {
      await deletePracticeLesson(user.uid, lessonId)
      navigate('/dashboard')
    } catch (err) {
      console.error('Delete error:', err)
      setError('Failed to delete lesson.')
    }
  }

  const handleReset = async () => {
    try {
      await resetPracticeLesson(user.uid, lessonId)
      const updated = await getPracticeLesson(user.uid, lessonId)
      setLesson(updated)

      // Reset local state
      setUserAttempt('')
      setFeedback(null)
      setModelSentence('')
      setChatMessages([])
      setNurfWords([])
      setWordTranslations({})
      setShowResetConfirm(false)

      // Clear and focus contentEditable after DOM updates
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

  const handleGoToSentence = async (index) => {
    if (index === lesson.currentIndex) return

    try {
      await updatePracticeLesson(user.uid, lessonId, { currentIndex: index })
      const updated = await getPracticeLesson(user.uid, lessonId)
      setLesson(updated)

      // Load attempt for this sentence
      const attemptData = updated.attempts?.find((a) => a.sentenceIndex === index)
      if (attemptData) {
        // Use finalText for finalized attempts, otherwise userText
        const textToLoad = attemptData.status === 'finalized'
          ? (attemptData.finalText || attemptData.userText || '')
          : (attemptData.userText || '')

        setUserAttempt(textToLoad)

        if (attemptData.feedback) {
          setFeedback(attemptData.feedback)
          setModelSentence(attemptData.modelSentence || '')
          // Show the conversation: user's attempt, then tutor's feedback
          setChatMessages([
            { role: 'user', content: textToLoad },
            {
              role: 'assistant',
              content: attemptData.feedback.explanation || '',
              hasFeedback: true,
            },
          ])
        } else {
          setFeedback(null)
          setModelSentence('')
          setChatMessages([])
        }
      } else {
        setUserAttempt('')
        setFeedback(null)
        setModelSentence('')
        setChatMessages([])
      }
    } catch (err) {
      console.error('Navigation error:', err)
    }
  }

  // Handle word status change from vocab panel
  const handleWordStatusChange = useCallback(async (word, newStatus) => {
    if (!user || !lesson?.targetLanguage) return

    try {
      // Get the translation for this word
      const normalised = normaliseExpression(word)
      const existingEntry = userVocab[normalised]
      const translation = existingEntry?.translation || wordTranslations[normalised] || null

      // Map 'new' status to 'unknown' for database (new is UI-only)
      const dbStatus = newStatus === 'new' ? 'unknown' : newStatus

      // Upsert the vocab entry
      await upsertVocabEntry(
        user.uid,
        lesson.targetLanguage,
        word,
        translation,
        dbStatus
      )

      // Update local vocab state to reflect the change immediately
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

      // Update nurfWords to reflect the new status (keep in panel even when known)
      setNurfWords(prev => prev.map(w =>
        w.normalised === normalised ? { ...w, status: dbStatus } : w
      ))
    } catch (err) {
      console.error('Failed to update word status:', err)
    }
  }, [user, lesson?.targetLanguage, userVocab, wordTranslations])

  // Check for new words before finalizing - show warning if any exist
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
    // Mark all 'new' status words as 'known'
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
        handleSubmitAttempt()
      } else {
        // After feedback, Enter goes to next sentence (with new words check)
        attemptFinalize(false)
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
            sourceSentence: currentSentence?.text,
            userAttempt: userAttempt,
            modelSentence: modelSentence,
            feedback: feedback,
            targetLanguage: lesson.targetLanguage,
            sourceLanguage: lesson.sourceLanguage,
            contextSummary: lesson.contextSummary,
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

  const isComplete = lesson.status === 'complete'
  const progress = lesson.sentences?.length
    ? Math.round((lesson.completedCount / lesson.sentences.length) * 100)
    : 0

  return (
    <div className="practice-lesson-page">
      {/* Header - matching Reader style */}
      <header className="dashboard-header practice-header">
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
            <div className="practice-nav-controls">
              <button
                className="practice-nav-btn"
                onClick={() => handleGoToSentence(lesson.currentIndex - 1)}
                disabled={lesson.currentIndex === 0}
                aria-label="Previous sentence"
              >
                &lt;
              </button>
              <span className="practice-nav-indicator">
                {lesson.currentIndex + 1} of {lesson.sentences?.length || 0}
              </span>
              <button
                className="practice-nav-btn"
                onClick={() => handleGoToSentence(lesson.currentIndex + 1)}
                disabled={lesson.currentIndex >= (lesson.sentences?.length || 1) - 1}
                aria-label="Next sentence"
              >
                &gt;
              </button>
            </div>
          </div>

          <div className="practice-header-actions">
            <button
              className={`practice-header-button ${showWordStatus ? 'practice-header-button--active' : ''}`}
              type="button"
              onClick={() => setShowWordStatus(!showWordStatus)}
              aria-pressed={showWordStatus}
              style={{ color: showWordStatus ? '#F97316' : undefined }}
            >
              Aa
            </button>
            <button
              className="practice-header-button"
              type="button"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setDarkMode(!darkMode)}
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
            >
              <svg className="practice-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="practice-progress-bar">
        <div className="practice-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Main content */}
      <div className="practice-layout">
        {/* Left panel - Chat/Tutor */}
        <aside className="practice-chat-panel" style={{ width: panelWidth }}>
          <div className="practice-chat-header">
            <h2>Tutor</h2>
            <button
              className={`practice-tutor-lang-toggle ${feedbackInTarget ? 'active' : ''}`}
              onClick={() => setFeedbackInTarget(!feedbackInTarget)}
              title={feedbackInTarget ? 'Feedback in target language' : 'Feedback in native language'}
            >
              {feedbackInTarget ? lesson?.targetLanguage?.slice(0, 2).toUpperCase() : 'EN'}
            </button>
          </div>
          <div className="practice-chat-messages">
            {/* Current prompt */}
            {!isComplete && currentSentence && (
              <div className="practice-tutor-prompt">
                <span className="prompt-label">Translate this sentence:</span>
                <p className="prompt-text">{currentSentence.text}</p>
              </div>
            )}

            {/* Live typing preview - shows user's attempt as they type */}
            {!isComplete && currentSentence && userAttempt && !chatMessages.some(m => m.role === 'user') && (
              <div className="practice-chat-message user typing-preview">
                {userAttempt}
              </div>
            )}

            {/* Chat messages with feedback inline */}
            {chatMessages.map((msg, i) => (
              <div key={i}>
                {/* Render checklist BEFORE the assistant feedback message */}
                {msg.role === 'assistant' && msg.hasFeedback && (
                  <div className="practice-feedback-checklist">
                    {(() => {
                      const grammarState = getFeedbackState(feedback?.correctness)
                      return (
                        <div className={`feedback-check-item ${grammarState}`}>
                          <span className="check-label">Grammar & Spelling</span>
                          <span className="check-status">
                            <span className={`check-icon ${grammarState}`}>
                              {getFeedbackIcon(grammarState)}
                            </span>
                          </span>
                        </div>
                      )
                    })()}
                    {(() => {
                      const accuracyState = getFeedbackState(feedback?.accuracy)
                      return (
                        <div className={`feedback-check-item ${accuracyState}`}>
                          <span className="check-label">Accuracy</span>
                          <span className="check-status">
                            <span className={`check-icon ${accuracyState}`}>
                              {getFeedbackIcon(accuracyState)}
                            </span>
                          </span>
                        </div>
                      )
                    })()}
                    {(() => {
                      const naturalnessState = getFeedbackState(feedback?.naturalness)
                      return (
                        <div className={`feedback-check-item ${naturalnessState}`}>
                          <span className="check-label">Naturalness</span>
                          <span className="check-status">
                            <span className={`check-icon ${naturalnessState}`}>
                              {getFeedbackIcon(naturalnessState)}
                            </span>
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )}

                <div
                  className={`practice-chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}
                >
                  {msg.content}
                </div>

                {/* Render example and word panel after feedback message */}
                {msg.role === 'assistant' && msg.hasFeedback && (
                  <>
                    {/* Example sentence with word status highlighting */}
                    {modelSentence && (
                      <div className="practice-example-sentence">
                        <span className="example-label">Example:</span>
                        <p className="example-text">
                          {renderHighlightedModelSentence}
                        </p>
                        <button
                          className="practice-use-example-btn"
                          onClick={() => {
                            setUserAttempt(modelSentence)
                            if (attemptInputRef.current) {
                              attemptInputRef.current.textContent = modelSentence
                            }
                          }}
                        >
                          Use example sentence
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
                  <span className="check-label">Accuracy</span>
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

          {/* Panel footer with actions */}
          <div className="practice-panel-footer">
            {!isComplete && currentSentence && (
              <div className="practice-submit-row">
                {!feedback ? (
                  <button
                    className="practice-submit-btn"
                    onClick={handleSubmitAttempt}
                    disabled={!userAttempt.trim() || feedbackLoading}
                  >
                    {feedbackLoading ? 'Checking...' : 'Submit'}
                    <span className="practice-submit-hint">↵</span>
                  </button>
                ) : (
                  <button
                    className="practice-submit-btn practice-submit-btn--next"
                    onClick={() => attemptFinalize(false)}
                    disabled={!userAttempt.trim()}
                  >
                    Next →
                  </button>
                )}
              </div>
            )}
            <div className="practice-followup-input">
              <input
                type="text"
                value={followUpQuestion}
                onChange={(e) => setFollowUpQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFollowUp()}
                placeholder="Ask a question..."
                disabled={followUpLoading}
              />
              <button
                className="button ghost small"
                onClick={handleFollowUp}
                disabled={!followUpQuestion.trim() || followUpLoading}
              >
                {followUpLoading ? '...' : '→'}
              </button>
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="practice-panel-resize"
            onMouseDown={startResize}
            ref={resizeRef}
          />
        </aside>

        {/* Right panel - Document */}
        <main className="practice-document-panel">
          <div className="practice-document-paper">
            {/* Document title */}
            <h1 className="practice-document-title">{lesson.title}</h1>

            {/* Document body - flows like a real document */}
            <div className="practice-document-body">
              {/* Render all sentences - finalized ones always visible, current one editable */}
              {lesson.sentences?.map((s, i) => {
                const attempt = lesson.attempts?.find((a) => a.sentenceIndex === i)
                const isCurrent = i === lesson.currentIndex
                const isFinalized = attempt?.status === 'finalized'

                // Finalized sentence
                if (isFinalized) {
                  // If it's current and not complete, make it editable
                  if (isCurrent && !isComplete) {
                    return (
                      <span
                        key={`editing-${i}`}
                        ref={attemptInputRef}
                        className="practice-inline-input"
                        contentEditable={!feedbackLoading}
                        suppressContentEditableWarning
                        onInput={(e) => setUserAttempt(e.currentTarget.textContent || '')}
                        onKeyDown={handleKeyDown}
                      />
                    )
                  }
                  // Otherwise, just show the text (clickable to navigate)
                  return (
                    <span
                      key={`finalized-${i}`}
                      className="practice-document-sentence"
                      onClick={() => handleGoToSentence(i)}
                      title="Click to revise"
                    >
                      {renderTextWithWordStatus(attempt.finalText, `doc-${i}-`)}{' '}
                    </span>
                  )
                }

                // Not finalized - only render if it's the current sentence (first time writing - no bold)
                if (isCurrent && !isComplete) {
                  return (
                    <span
                      key={`editing-${i}`}
                      ref={attemptInputRef}
                      className="practice-inline-input"
                      contentEditable={!feedbackLoading}
                      suppressContentEditableWarning
                      onInput={(e) => setUserAttempt(e.currentTarget.textContent || '')}
                      onKeyDown={handleKeyDown}
                    />
                  )
                }

                return null
              })}
            </div>
          </div>

          {/* Completion message */}
          {isComplete && (
            <div className="practice-complete">
              <h2>Lesson Complete!</h2>
              <p>You've completed all {lesson.sentences?.length} sentences.</p>
              <button className="button primary" onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Lesson?</h3>
            <p>This will permanently delete this practice lesson and all your progress.</p>
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
            <h3>Reset Lesson?</h3>
            <p>This will clear all your written sentences and start over from sentence 1. Your saved vocabulary will not be affected.</p>
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
            <p>By proceeding to the next sentence, all new words will be moved to known.</p>
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
    </div>
  )
}

export default PracticeLesson
