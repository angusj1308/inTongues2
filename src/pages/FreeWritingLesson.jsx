import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  deleteFreeWritingLesson,
  getFreeWritingLesson,
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

const FreeWritingLesson = () => {
  const { lessonId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Document content - single string for whole document
  const [content, setContent] = useState('')
  const [lastSavedContent, setLastSavedContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Selection state for feedback popup
  const [selection, setSelection] = useState(null) // { text, rect }
  const [selectionFeedbackPopup, setSelectionFeedbackPopup] = useState(null) // { x, y }

  // Feedback state
  const [feedback, setFeedback] = useState(null)
  const [modelSentence, setModelSentence] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [selectedTextForFeedback, setSelectedTextForFeedback] = useState('')
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
  const [panelWidth, setPanelWidth] = useState(() => Math.max(480, Math.floor(window.innerWidth / 3)))
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [popup, setPopup] = useState(null)
  const [expandedCategories, setExpandedCategories] = useState({})
  const documentRef = useRef(null)
  const chatEndRef = useRef(null)
  const resizeRef = useRef(null)
  const isResizing = useRef(false)
  const saveTimeoutRef = useRef(null)
  const contentRef = useRef('') // Track content without triggering re-renders
  const lastSavedContentRef = useRef('') // Track last saved content (ref to avoid closure issues)
  const isInitialized = useRef(false)
  const wordCountUpdateRef = useRef(null) // Debounce word count updates
  const autoFeedbackTimeoutRef = useRef(null) // Debounce auto-feedback
  const lastAnalyzedContentRef = useRef('') // Track what we've already analyzed

  // Inline feedback state - corrections with positions for underlines
  const [inlineFeedback, setInlineFeedback] = useState([]) // Array of { id, text, startIndex, endIndex, category, correction, explanation }
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [activeUnderlineId, setActiveUnderlineId] = useState(null) // Which underline was clicked

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

        // Load document content - store in ref and state
        const docContent = data.content || ''
        console.log('Loaded content from database:', docContent.length, 'chars')
        contentRef.current = docContent
        lastSavedContentRef.current = docContent
        setContent(docContent)
        setLastSavedContent(docContent)

        // Load user's vocab for word status highlighting
        if (data.targetLanguage) {
          try {
            const vocab = await loadUserVocab(user.uid, data.targetLanguage)
            setUserVocab(vocab)
          } catch (vocabErr) {
            console.warn('Could not load vocab:', vocabErr)
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

  // Initialize contentEditable with content after lesson loads
  useEffect(() => {
    if (lesson && documentRef.current && !isInitialized.current) {
      documentRef.current.textContent = contentRef.current
      isInitialized.current = true
    }
  }, [lesson])

  // Handle document input - update ref and trigger save
  const handleDocumentInput = useCallback(() => {
    if (!documentRef.current) return

    const newContent = documentRef.current.textContent || ''
    contentRef.current = newContent

    // Debounce state update for word count display
    if (wordCountUpdateRef.current) {
      clearTimeout(wordCountUpdateRef.current)
    }
    wordCountUpdateRef.current = setTimeout(() => {
      setContent(newContent)
    }, 300)

    // Debounce save - shorter delay for reliability
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(async () => {
      if (!user || !lessonId) return
      if (contentRef.current === lastSavedContentRef.current) return

      setIsSaving(true)
      try {
        const wordCount = contentRef.current.trim().split(/\s+/).filter(Boolean).length
        await updateFreeWritingLesson(user.uid, lessonId, {
          content: contentRef.current,
          wordCount,
        })
        lastSavedContentRef.current = contentRef.current
        setLastSavedContent(contentRef.current)
      } catch (err) {
        console.error('Auto-save error:', err)
      } finally {
        setIsSaving(false)
      }
    }, 500)
  }, [user, lessonId])

  // Core save function - reusable
  const saveContent = useCallback(async () => {
    if (!user || !lessonId) {
      console.error('Cannot save: user or lessonId missing')
      return false
    }

    const currentContent = contentRef.current

    try {
      const wordCount = currentContent.trim().split(/\s+/).filter(Boolean).length
      await updateFreeWritingLesson(user.uid, lessonId, {
        content: currentContent,
        wordCount,
      })
      lastSavedContentRef.current = currentContent
      setLastSavedContent(currentContent)
      console.log('Content saved successfully:', wordCount, 'words')
      return true
    } catch (err) {
      console.error('Save error:', err)
      return false
    }
  }, [user, lessonId])

  // Save immediately on page leave/refresh/navigate - use refs to avoid stale closures
  useEffect(() => {
    if (!user || !lessonId) return

    const saveBeforeUnload = () => {
      const currentContent = contentRef.current
      if (currentContent === lastSavedContentRef.current) return

      const wordCount = currentContent.trim().split(/\s+/).filter(Boolean).length
      // Use sendBeacon for reliable save on page unload
      const data = JSON.stringify({
        userId: user.uid,
        lessonId,
        content: currentContent,
        wordCount,
      })
      const blob = new Blob([data], { type: 'application/json' })
      navigator.sendBeacon('/api/freewriting/save-beacon', blob)
    }

    const handleBeforeUnload = () => {
      saveBeforeUnload()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveBeforeUnload()
      }
    }

    // pagehide is more reliable than beforeunload on mobile/some browsers
    const handlePageHide = () => {
      saveBeforeUnload()
    }

    // Save when clicking links/buttons that navigate away
    const handleClick = (e) => {
      const target = e.target.closest('a, button')
      if (target && contentRef.current !== lastSavedContentRef.current) {
        saveBeforeUnload()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('click', handleClick, true)

    return () => {
      // Save on unmount (React navigation)
      saveBeforeUnload()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('click', handleClick, true)
    }
  }, [user, lessonId])

  // Auto-analyze text for feedback after user pauses typing
  const analyzeTextForFeedback = useCallback(async () => {
    if (!lesson || isAnalyzing) return

    const currentContent = contentRef.current
    if (!currentContent.trim() || currentContent === lastAnalyzedContentRef.current) return

    setIsAnalyzing(true)

    try {
      // Detect bracketed expressions
      const bracketedExpressions = currentContent.match(/[\[(\u300c]([^\])\u300d]+)[\])\u300d]/g) || []
      const helpExpressions = bracketedExpressions.map(expr => expr.slice(1, -1).trim())

      // Extract words user wrote themselves (excluding bracketed help requests)
      const contentWithoutBrackets = currentContent.replace(/[\[(\u300c][^\])\u300d]+[\])\u300d]/g, ' ')
      const userProducedWords = contentWithoutBrackets.match(/[\p{L}\p{M}]+/gu) || []
      const uniqueUserWords = [...new Set(userProducedWords.map(w => w.toLowerCase()))]

      // Auto-mark user-produced words as "known" (they produced it, so they know it)
      if (user && uniqueUserWords.length > 0) {
        const wordsToMarkKnown = uniqueUserWords.filter(word => {
          const vocabEntry = userVocab[word]
          // Only update if not already known (avoid unnecessary writes)
          return !vocabEntry || vocabEntry.status !== 'known'
        })

        // Batch update words to known status (fire and forget, don't block feedback)
        if (wordsToMarkKnown.length > 0) {
          Promise.all(wordsToMarkKnown.slice(0, 20).map(async (word) => {
            try {
              await upsertVocabEntry(user.uid, lesson.targetLanguage, word, null, 'known')
            } catch (err) {
              // Silent fail - not critical
            }
          })).then(() => {
            // Update local vocab state
            setUserVocab(prev => {
              const updated = { ...prev }
              wordsToMarkKnown.forEach(word => {
                updated[word] = { ...updated[word], status: 'known' }
              })
              return updated
            })
          })
        }
      }

      const response = await fetch('/api/freewriting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: currentContent,
          targetLanguage: lesson.targetLanguage,
          sourceLanguage: lesson.sourceLanguage,
          textType: lesson.textType,
          fullDocument: currentContent,
          feedbackInTarget,
          helpExpressions,
        }),
      })

      if (!response.ok) throw new Error('Failed to get feedback')

      const data = await response.json()
      lastAnalyzedContentRef.current = currentContent

      // Convert corrections to inline feedback with positions
      if (data.feedback?.corrections) {
        const newInlineFeedback = data.feedback.corrections.map((c, idx) => {
          // Find position in current content
          const startIndex = currentContent.indexOf(c.original)
          return {
            id: `feedback-${Date.now()}-${idx}`,
            text: c.original,
            startIndex: startIndex >= 0 ? startIndex : -1,
            endIndex: startIndex >= 0 ? startIndex + c.original.length : -1,
            category: c.category,
            correction: c.correction,
            explanation: c.explanation,
          }
        }).filter(f => f.startIndex >= 0) // Only keep feedback we can position

        setInlineFeedback(newInlineFeedback)

        // Update chat messages with this feedback (but don't open panel)
        if (newInlineFeedback.length > 0) {
          setFeedback(data.feedback)
          setModelSentence(data.modelSentence || '')
        }
      } else {
        setInlineFeedback([])
      }
    } catch (err) {
      console.error('Auto-feedback error:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }, [lesson, isAnalyzing, feedbackInTarget, user, userVocab])

  // Trigger auto-feedback after 3 seconds of inactivity
  useEffect(() => {
    if (!lesson || !content) return

    // Clear existing timeout
    if (autoFeedbackTimeoutRef.current) {
      clearTimeout(autoFeedbackTimeoutRef.current)
    }

    // Set new timeout for auto-analysis
    autoFeedbackTimeoutRef.current = setTimeout(() => {
      analyzeTextForFeedback()
    }, 3000)

    return () => {
      if (autoFeedbackTimeoutRef.current) {
        clearTimeout(autoFeedbackTimeoutRef.current)
      }
    }
  }, [content, lesson, analyzeTextForFeedback])

  // Extract NEW words from tutor corrections only (not words user already wrote)
  useEffect(() => {
    if (!feedback?.corrections || !lesson?.targetLanguage) {
      setNurfWords([])
      return
    }

    // Get words the user wrote (these are "known" - they produced them)
    const currentContent = contentRef.current || ''
    const contentWithoutBrackets = currentContent.replace(/[\[(\u300c][^\])\u300d]+[\])\u300d]/g, ' ')
    const userProducedWords = new Set(
      (contentWithoutBrackets.match(/[\p{L}\p{M}]+/gu) || []).map(w => w.toLowerCase())
    )

    // Extract words from corrections (tutor suggestions) that user didn't write
    const correctionWords = []
    feedback.corrections.forEach(c => {
      const words = (c.correction || '').match(/[\p{L}\p{M}]+/gu) || []
      words.forEach(word => {
        const normalised = word.toLowerCase()
        // Only include if user didn't produce this word themselves
        if (!userProducedWords.has(normalised)) {
          correctionWords.push({ word, normalised })
        }
      })
    })

    // Dedupe
    const uniqueWords = [...new Map(correctionWords.map(w => [w.normalised, w])).values()]

    const wordList = uniqueWords
      .map(({ word, normalised }) => {
        const vocabEntry = userVocab[normalised]
        const status = vocabEntry?.status || 'new'
        // Only show words that aren't already known
        if (status === 'known') return null
        const translationData = wordTranslations[normalised] || {}
        return {
          word: normalised,
          displayWord: word,
          normalised,
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
  }, [feedback, lesson?.targetLanguage, lesson?.sourceLanguage, userVocab])

  // Handle text selection for feedback popup
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !documentRef.current) {
        setSelection(null)
        setSelectionFeedbackPopup(null)
        return
      }

      // Check if selection is within our document
      const range = sel.getRangeAt(0)
      if (!documentRef.current.contains(range.commonAncestorContainer)) {
        setSelection(null)
        setSelectionFeedbackPopup(null)
        return
      }

      const selectedText = sel.toString().trim()
      if (selectedText.length < 2) {
        setSelection(null)
        setSelectionFeedbackPopup(null)
        return
      }

      const rect = range.getBoundingClientRect()
      setSelection({ text: selectedText, rect })

      // Position popup above the selection
      setSelectionFeedbackPopup({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

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
      if (!event.target.closest('.translate-popup') && !event.target.closest('.selection-feedback-popup')) {
        setPopup(null)
      }
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Submit selected text for feedback
  const handleSubmitSelectionForFeedback = useCallback(async () => {
    if (!selection?.text || feedbackLoading) return

    const textToReview = selection.text
    setSelectedTextForFeedback(textToReview)
    setFeedbackLoading(true)
    setFeedback(null)
    setSelectionFeedbackPopup(null)

    // Detect bracketed expressions (user asking for help expressing something)
    // Matches text in [], (), or 「」brackets
    const bracketedExpressions = textToReview.match(/[\[(\u300c]([^\])\u300d]+)[\])\u300d]/g) || []
    const helpExpressions = bracketedExpressions.map(expr =>
      expr.slice(1, -1).trim() // Remove the brackets
    )

    // Clear selection
    window.getSelection()?.removeAllRanges()

    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: textToReview },
    ])

    try {
      const response = await fetch('/api/freewriting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: textToReview,
          targetLanguage: lesson.targetLanguage,
          sourceLanguage: lesson.sourceLanguage,
          textType: lesson.textType,
          fullDocument: contentRef.current,
          feedbackInTarget,
          helpExpressions, // Bracketed text user needs help expressing
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get feedback')
      }

      const data = await response.json()

      setFeedback(data.feedback)
      setModelSentence(data.modelSentence || '')

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
  }, [selection, feedbackLoading, lesson, feedbackInTarget])

  // Handle keyboard shortcut for feedback (Cmd/Ctrl + Enter)
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && selection?.text) {
      e.preventDefault()
      handleSubmitSelectionForFeedback()
    }
  }, [selection, handleSubmitSelectionForFeedback])

  const handleDelete = async () => {
    try {
      await deleteFreeWritingLesson(user.uid, lessonId)
      navigate('/dashboard')
    } catch (err) {
      console.error('Delete error:', err)
      setError('Failed to delete lesson.')
    }
  }

  // Handle clicking an inline underline - open panel and show that feedback
  const handleUnderlineClick = useCallback((feedbackItem) => {
    setActiveUnderlineId(feedbackItem.id)
    setIsPanelOpen(true)

    // Add to chat messages if not already there
    setChatMessages((prev) => {
      // Check if this feedback is already shown
      const alreadyShown = prev.some(m => m.feedbackId === feedbackItem.id)
      if (alreadyShown) return prev

      return [
        ...prev,
        { role: 'user', content: feedbackItem.text, feedbackId: feedbackItem.id },
        {
          role: 'assistant',
          content: feedbackItem.explanation,
          feedbackId: feedbackItem.id,
          correction: feedbackItem.correction,
          category: feedbackItem.category,
        },
      ]
    })
  }, [])

  // Compute underline positions using Range API
  const getUnderlineRects = useCallback(() => {
    if (!documentRef.current || !inlineFeedback.length) return []

    const textNode = documentRef.current.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return []

    const docRect = documentRef.current.getBoundingClientRect()
    const rects = []

    inlineFeedback.forEach((fb) => {
      if (fb.startIndex < 0 || fb.endIndex < 0) return

      try {
        const range = document.createRange()
        range.setStart(textNode, Math.min(fb.startIndex, textNode.length))
        range.setEnd(textNode, Math.min(fb.endIndex, textNode.length))

        const clientRects = range.getClientRects()
        for (let i = 0; i < clientRects.length; i++) {
          const rect = clientRects[i]
          rects.push({
            ...fb,
            left: rect.left - docRect.left,
            top: rect.top - docRect.top + rect.height - 2,
            width: rect.width,
            height: 3,
          })
        }
      } catch (e) {
        // Range might be out of bounds if text changed
        console.warn('Could not create range for feedback:', e)
      }
    })

    return rects
  }, [inlineFeedback])

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
      // Convert inlineFeedback to format expected by backend
      const currentCorrections = inlineFeedback.map(f => ({
        original: f.text,
        correction: f.correction,
        category: f.category,
        explanation: f.explanation,
      }))

      const response = await fetch('/api/practice/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: {
            sourceSentence: null,
            userAttempt: selectedTextForFeedback,
            modelSentence: modelSentence,
            feedback: feedback,
            targetLanguage: lesson.targetLanguage,
            sourceLanguage: lesson.sourceLanguage,
            contextSummary: `Free writing (${lesson.textType})`,
            currentCorrections,
            fullDocument: contentRef.current,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()

      // Handle updated corrections if the user clarified their intent
      if (data.updatedCorrections?.length > 0 || data.removedCorrections?.length > 0) {
        setInlineFeedback(prev => {
          let updated = [...prev]

          // Remove corrections that should be removed
          if (data.removedCorrections?.length > 0) {
            updated = updated.filter(f => !data.removedCorrections.includes(f.text))
          }

          // Update corrections that need to change
          if (data.updatedCorrections?.length > 0) {
            data.updatedCorrections.forEach(upd => {
              const idx = updated.findIndex(f => f.text === upd.originalText)
              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  category: upd.newCategory === 'accuracy' ? 'naturalness' : upd.newCategory,
                  correction: upd.newCorrection,
                  explanation: upd.newExplanation,
                  exampleSentence: upd.exampleSentence,
                  severity: upd.newCategory === 'accuracy' ? 'minor' : updated[idx].severity,
                }
              }
            })
          }

          return updated
        })
      }

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

  // Render model sentence with word status highlighting
  const renderHighlightedModelSentence = useMemo(() => {
    if (!modelSentence) return null

    const tokens = modelSentence.match(/[\p{L}\p{M}]+|[^\p{L}\p{M}\s]+|\s+/gu) || []

    return tokens.map((token, idx) => {
      if (/^\s+$/.test(token) || !/[\p{L}\p{M}]/u.test(token)) {
        return <span key={idx}>{token}</span>
      }

      const normalised = normaliseExpression(token)
      const vocabEntry = userVocab[normalised]
      const status = vocabEntry?.status || 'new'

      const opacity = STATUS_OPACITY[status]
      const base = status === 'new' ? '#F97316' : getLanguageColor(lesson?.targetLanguage)
      const highlighted = opacity && opacity > 0

      return (
        <span
          key={idx}
          className={`reader-word ${highlighted ? 'reader-word--highlighted' : ''} reader-word--clickable`}
          style={highlighted ? { '--hlt-base': base, '--hlt-opacity': opacity } : {}}
        >
          {token}
        </span>
      )
    })
  }, [modelSentence, userVocab, lesson?.targetLanguage])

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

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="practice-lesson-page freewriting-page" onKeyDown={handleKeyDown}>
      {/* Header */}
      <header className="dashboard-header practice-header" style={{ minHeight: '56px' }}>
        <div className="dashboard-brand-band practice-header-band">
          <div className="practice-header-left">
            <button
              className="dashboard-control ui-text"
              onClick={async () => {
                const saved = await saveContent()
                if (!saved) {
                  console.error('Failed to save before navigation')
                }
                navigate('/dashboard')
              }}
            >
              Back to library
            </button>
          </div>

          <div className="practice-header-center">
            {/* Empty center for layout balance */}
          </div>

          <div className="practice-header-actions">
            {/* iOS-style toggle for corrections */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span style={{ opacity: showWordStatus ? 1 : 0.5 }}>Corrections</span>
              <div
                onClick={() => setShowWordStatus(!showWordStatus)}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  backgroundColor: showWordStatus ? '#1f2937' : '#d1d5db',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    position: 'absolute',
                    top: '2px',
                    left: showWordStatus ? '22px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </div>
            </label>
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
          <div className="practice-chat-messages" style={{ padding: '16px' }}>
            {/* 1. Spelling & Grammar Section */}
            {(() => {
              const grammarItems = inlineFeedback.filter(f => (f.category === 'grammar' || f.category === 'spelling') && f.severity !== 'minor')
              const errorCount = grammarItems.length
              const isExpanded = expandedCategories['grammar'] !== false
              return (
                <div className={`feedback-check-item ${errorCount > 0 ? 'fail' : 'pass'}`} style={{ marginBottom: '12px' }}>
                  <div
                    className="feedback-check-header"
                    onClick={() => setExpandedCategories(prev => ({ ...prev, grammar: !isExpanded }))}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="check-label">
                      Spelling & Grammar
                      <span className="check-count" style={{ color: errorCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>({errorCount})</span>
                    </span>
                    <span className="check-status">
                      <span className={`check-icon ${errorCount > 0 ? 'fail' : 'pass'}`}>
                        {getFeedbackIcon(errorCount > 0 ? 'fail' : 'pass')}
                      </span>
                      <span className="check-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                    </span>
                  </div>
                  {isExpanded && errorCount > 0 && (
                    <div className="feedback-corrections-list">
                      {grammarItems.map((item) => (
                        <div
                          key={item.id}
                          className={`feedback-correction-item ${activeUnderlineId === item.id ? 'active' : ''}`}
                          onClick={() => setActiveUnderlineId(item.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <span className="correction-original">{item.text}</span>
                          <span className="correction-arrow">→</span>
                          <span className="correction-fix">{item.correction}</span>
                          <p className="correction-explanation">{item.explanation}</p>
                          {item.exampleSentence && (
                            <details style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}>Example</summary>
                              <p style={{ margin: '4px 0 0 8px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>{item.exampleSentence}</p>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 2. Minor Spelling & Grammar - accent errors, punctuation, capitalization */}
            {(() => {
              const minorItems = inlineFeedback.filter(f => f.category === 'expression' || f.category === 'naturalness' || f.category === 'punctuation' || f.severity === 'minor')
              const errorCount = minorItems.length
              const isExpanded = expandedCategories['minor'] !== false
              return (
                <div className={`feedback-check-item ${errorCount > 0 ? 'acceptable' : 'pass'}`} style={{ marginBottom: '12px' }}>
                  <div
                    className="feedback-check-header"
                    onClick={() => setExpandedCategories(prev => ({ ...prev, minor: !isExpanded }))}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="check-label">
                      Minor
                      <span className="check-count" style={{ color: errorCount > 0 ? '#eab308' : 'var(--text-muted)' }}>({errorCount})</span>
                    </span>
                    <span className="check-status">
                      <span className={`check-icon ${errorCount > 0 ? 'acceptable' : 'pass'}`}>
                        {getFeedbackIcon(errorCount > 0 ? 'acceptable' : 'pass')}
                      </span>
                      <span className="check-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                    </span>
                  </div>
                  {isExpanded && errorCount > 0 && (
                    <div className="feedback-corrections-list">
                      {minorItems.map((item) => (
                        <div
                          key={item.id}
                          className={`feedback-correction-item ${activeUnderlineId === item.id ? 'active' : ''}`}
                          onClick={() => setActiveUnderlineId(item.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <span className="correction-original" style={{ fontStyle: item.category === 'expression' ? 'italic' : 'normal' }}>{item.text}</span>
                          <span className="correction-arrow">→</span>
                          <span className="correction-fix" style={{ fontWeight: item.category === 'expression' ? '600' : 'normal' }}>{item.correction}</span>
                          {item.explanation && <p className="correction-explanation">{item.explanation}</p>}
                          {item.exampleSentence && (
                            <details style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}>Example</summary>
                              <p style={{ margin: '4px 0 0 8px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>{item.exampleSentence}</p>
                            </details>
                          )}
                        </div>
                      ))}

                      {/* Model sentence / example */}
                      {modelSentence && (
                        <div className="practice-example-sentence" style={{ margin: '12px 0 0 0' }}>
                          <span className="example-label">Example:</span>
                          <p className="example-text" style={{ margin: '4px 0 0 0' }}>
                            {renderHighlightedModelSentence}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 3. Vocab Panel Section */}
            {(() => {
              const isExpanded = expandedCategories['vocab'] !== false
              const vocabCount = nurfWords.length
              return (
                <div className={`feedback-check-item ${vocabCount > 0 ? 'acceptable' : 'pass'}`} style={{ marginBottom: '12px' }}>
                  <div
                    className="feedback-check-header"
                    onClick={() => setExpandedCategories(prev => ({ ...prev, vocab: !isExpanded }))}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="check-label">
                      Vocab
                      {vocabCount > 0 && <span className="check-count">({vocabCount})</span>}
                    </span>
                    <span className="check-status">
                      <span className="check-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                    </span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '8px 0' }}>
                      {nurfWords.length > 0 ? (
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
                      ) : (
                        <p style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                          Words from tutor suggestions will appear here.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Follow-up chat messages */}
            {chatMessages.filter(msg => !msg.hasFeedback).map((msg, i) => (
              <div
                key={i}
                className={`practice-chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}
              >
                {msg.content}
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          {/* Panel footer - follow-up questions */}
          <div className="practice-panel-footer">
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

            {/* Document body container */}
            <div style={{ position: 'relative' }}>
              {/* Placeholder shown when empty */}
              {!content && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    color: 'var(--text-muted, #9ca3af)',
                    pointerEvents: 'none',
                    fontSize: '1.1rem',
                    lineHeight: '1.8',
                  }}
                >
                  Start writing in {lesson.targetLanguage}...
                </div>
              )}

              {/* Inline feedback underlines overlay */}
              {showWordStatus && inlineFeedback.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none',
                    overflow: 'hidden',
                  }}
                >
                  {getUnderlineRects().map((rect, idx) => {
                    const isError = rect.severity === 'major' || (rect.category === 'grammar' && rect.severity !== 'minor') || (rect.category === 'spelling' && rect.severity !== 'minor')
                    const isActive = activeUnderlineId === rect.id
                    return (
                      <div
                        key={`${rect.id}-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnderlineClick(rect)
                        }}
                        style={{
                          position: 'absolute',
                          left: rect.left,
                          top: rect.top,
                          width: rect.width,
                          height: rect.height,
                          pointerEvents: 'auto',
                          cursor: 'pointer',
                          // Wavy underline using SVG pattern
                          background: isError
                            ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3' viewBox='0 0 6 3'%3E%3Cpath d='M0 3 Q1.5 0 3 3 T6 3' fill='none' stroke='%23ef4444' stroke-width='1'/%3E%3C/svg%3E")`
                            : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3' viewBox='0 0 6 3'%3E%3Cpath d='M0 3 Q1.5 0 3 3 T6 3' fill='none' stroke='%23eab308' stroke-width='1'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'repeat-x',
                          opacity: isActive ? 1 : 0.8,
                          transition: 'opacity 0.15s ease',
                        }}
                        title={`${rect.category}: ${rect.explanation}`}
                      />
                    )
                  })}
                </div>
              )}

              {/* Document body - fully editable (uncontrolled) */}
              <div
                ref={documentRef}
                className="freewriting-document-body"
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onInput={handleDocumentInput}
                onBlur={saveContent}
                style={{
                  minHeight: '400px',
                  outline: 'none',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.8',
                  fontSize: '1.1rem',
                  color: darkMode ? '#f1f5f9' : '#0f172a',
                  caretColor: darkMode ? '#f1f5f9' : '#0f172a',
                }}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Selection feedback popup */}
      {selectionFeedbackPopup && selection && !feedbackLoading && (
        <div
          className="selection-feedback-popup"
          style={{
            position: 'fixed',
            left: selectionFeedbackPopup.x,
            top: selectionFeedbackPopup.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 1000,
            background: 'var(--bg-primary, #fff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '8px',
            padding: '6px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="button primary small"
            onClick={handleSubmitSelectionForFeedback}
            style={{
              padding: '4px 12px',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Get Feedback
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            or ⌘+Enter
          </span>
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
