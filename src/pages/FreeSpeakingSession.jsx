import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRealtimeTranscription } from '../hooks/useRealtimeTranscription'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { loadUserVocab, normaliseExpression, upsertVocabEntry } from '../services/vocab'
import { WaveformVisualizer } from '../components/speak/shared/WaveformVisualizer'
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

// Get the icon for feedback state
const getFeedbackIcon = (state) => {
  switch (state) {
    case 'pass': return '✓'
    case 'acceptable': return '~'
    case 'fail': return '✗'
    default: return '?'
  }
}

const FreeSpeakingSession = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  // Get languages from profile
  const activeLanguage = profile?.lastUsedLanguage || ''
  const nativeLanguage = profile?.nativeLanguage || 'English'

  // Recording state
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)

  // Feedback state
  const [inlineFeedback, setInlineFeedback] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [modelSentence, setModelSentence] = useState('')
  const [activeUnderlineId, setActiveUnderlineId] = useState(null)
  const [error, setError] = useState(null)

  // Vocab state
  const [userVocab, setUserVocab] = useState({})
  const [nurfWords, setNurfWords] = useState([])
  const [wordTranslations, setWordTranslations] = useState({})

  // Follow-up question state
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([])

  // UI state
  const [panelWidth, setPanelWidth] = useState(() => Math.max(480, Math.floor(window.innerWidth / 3)))
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  })
  const [showCorrections, setShowCorrections] = useState(true)

  // Refs
  const documentRef = useRef(null)
  const chatEndRef = useRef(null)
  const isResizing = useRef(false)
  const autoFeedbackTimeoutRef = useRef(null)
  const lastAnalyzedTextRef = useRef('')
  const playbackRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Use realtime transcription hook
  const {
    isStreaming,
    transcript: liveTranscript,
    startStreaming,
    stopStreaming,
    reset: resetTranscription,
    analyserNode: transcriptionAnalyser
  } = useRealtimeTranscription({
    language: activeLanguage,
    onTranscription: (text) => {
      setTranscription(text)
    },
    onFinalTranscription: (text) => {
      setTranscription(text)
    }
  })

  // Use audio recorder hook
  const {
    isRecording,
    isPaused,
    recordingTime,
    permissionStatus,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    analyserNode: recorderAnalyser
  } = useAudioRecorder({
    maxDuration: 600 // 10 minutes max
  })

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Sync dark mode with document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Load user vocab on mount
  useEffect(() => {
    if (user && activeLanguage) {
      loadUserVocab(user.uid, activeLanguage)
        .then(vocab => setUserVocab(vocab))
        .catch(err => console.warn('Could not load vocab:', err))
    }
  }, [user, activeLanguage])

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

  // Auto-analyze transcription as user speaks
  useEffect(() => {
    // Only auto-analyze if we have new content and not currently analyzing
    const currentText = transcription || liveTranscript || ''
    if (!currentText || currentText.length < 20 || isAnalyzing) return
    if (currentText === lastAnalyzedTextRef.current) return

    // Clear existing timeout
    if (autoFeedbackTimeoutRef.current) {
      clearTimeout(autoFeedbackTimeoutRef.current)
    }

    // Debounce auto-feedback - wait for pause in speech
    autoFeedbackTimeoutRef.current = setTimeout(() => {
      analyzeTranscription(currentText)
    }, 2000) // 2 second pause triggers analysis

    return () => {
      if (autoFeedbackTimeoutRef.current) {
        clearTimeout(autoFeedbackTimeoutRef.current)
      }
    }
  }, [transcription, liveTranscript, isAnalyzing])

  // Analyze transcription for feedback
  const analyzeTranscription = async (text) => {
    if (!text || text.length < 10 || isAnalyzing) return
    if (text === lastAnalyzedTextRef.current) return

    setIsAnalyzing(true)
    lastAnalyzedTextRef.current = text

    try {
      const response = await fetch('/api/freewriting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: text,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage,
          textType: 'speech',
          fullDocument: text,
          feedbackInTarget: false,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get feedback')
      }

      const data = await response.json()

      // Convert corrections to inline feedback format
      if (data.feedback?.corrections) {
        const newInlineFeedback = data.feedback.corrections.map((c, idx) => {
          const startIndex = text.indexOf(c.original)
          return {
            id: `feedback-${Date.now()}-${idx}`,
            text: c.original,
            startIndex: startIndex >= 0 ? startIndex : -1,
            endIndex: startIndex >= 0 ? startIndex + c.original.length : -1,
            category: c.category || 'grammar',
            severity: c.severity || 'major',
            correction: c.corrected || c.correction,
            explanation: c.explanation,
            exampleSentence: c.exampleSentence
          }
        }).filter(f => f.startIndex >= 0)

        setInlineFeedback(newInlineFeedback)
      }

      if (data.modelSentence) {
        setModelSentence(data.modelSentence)
      }

      // Update vocab status for words user produced
      if (user) {
        const words = text.match(/[\p{L}\p{M}]+/gu) || []
        const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))]

        // Mark first 30 words as 'familiar' (user can produce them)
        uniqueWords.slice(0, 30).forEach(async (word) => {
          const existing = userVocab[word]
          if (!existing || (existing.status !== 'known' && existing.status !== 'familiar')) {
            try {
              await upsertVocabEntry(user.uid, activeLanguage, word, null, 'familiar')
              setUserVocab(prev => ({
                ...prev,
                [word]: { ...prev[word], status: 'familiar' }
              }))
            } catch (err) {
              // Silent fail
            }
          }
        })
      }
    } catch (err) {
      console.error('Analysis error:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Start recording session
  const handleStart = async () => {
    setError(null)
    setTranscription('')
    setInlineFeedback([])
    lastAnalyzedTextRef.current = ''

    try {
      await Promise.all([
        startRecording(),
        startStreaming()
      ])
      setIsSessionActive(true)
    } catch (err) {
      console.error('Error starting:', err)
      setError('Could not start recording. Please check microphone permissions.')
    }
  }

  // Stop recording
  const handleStop = async () => {
    try {
      stopRecording()
      const result = await stopStreaming()

      if (result.audioBlob) {
        setAudioBlob(result.audioBlob)
        setAudioUrl(result.audioUrl)
      }

      // Final transcript
      const finalText = result.text || transcription || liveTranscript
      setTranscription(finalText)

      // Do final analysis
      if (finalText && finalText.length > 10) {
        await analyzeTranscription(finalText)
      }

      // Open panel to show feedback
      setIsPanelOpen(true)
    } catch (err) {
      console.error('Error stopping:', err)
      setError('Error stopping recording')
    }
  }

  // Reset session
  const handleReset = () => {
    resetRecording()
    resetTranscription()
    setTranscription('')
    setAudioUrl(null)
    setAudioBlob(null)
    setInlineFeedback([])
    setModelSentence('')
    setError(null)
    setIsSessionActive(false)
    setIsPanelOpen(false)
    setChatMessages([])
    lastAnalyzedTextRef.current = ''
  }

  // Toggle playback
  const togglePlayback = () => {
    if (!playbackRef.current) return
    if (isPlaying) {
      playbackRef.current.pause()
    } else {
      playbackRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  // Extract NURF words from corrections
  useEffect(() => {
    if (!inlineFeedback.length) {
      setNurfWords([])
      return
    }

    // Get words user produced
    const userProducedWords = new Set(
      (transcription.match(/[\p{L}\p{M}]+/gu) || []).map(w => w.toLowerCase())
    )

    // Extract words from corrections that user didn't produce
    const correctionWords = []
    inlineFeedback.forEach(c => {
      const correctionText = c.correction || ''
      const words = correctionText.match(/[\p{L}\p{M}]+/gu) || []
      words.forEach(word => {
        const normalised = word.toLowerCase()
        if (!userProducedWords.has(normalised)) {
          correctionWords.push({ word, normalised, context: c.explanation })
        }
      })
    })

    const uniqueWords = [...new Map(correctionWords.map(w => [w.normalised, w])).values()]

    const wordList = uniqueWords
      .map(({ word, normalised, context }) => {
        const vocabEntry = userVocab[normalised]
        const status = vocabEntry?.status || 'new'
        if (status === 'known') return null
        return {
          word: normalised,
          displayWord: word,
          normalised,
          status,
          translation: wordTranslations[normalised]?.translation || null,
          context
        }
      })
      .filter(Boolean)

    setNurfWords(wordList)

    // Fetch translations
    const wordsNeedingTranslation = wordList.filter(w => !w.translation)
    wordsNeedingTranslation.slice(0, 10).forEach(async (w) => {
      try {
        const response = await fetch('/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: w.displayWord,
            sourceLang: activeLanguage,
            targetLang: nativeLanguage,
            context: w.context
          })
        })
        if (response.ok) {
          const data = await response.json()
          setWordTranslations(prev => ({
            ...prev,
            [w.normalised]: { translation: data.translation }
          }))
          setNurfWords(prev => prev.map(word =>
            word.normalised === w.normalised
              ? { ...word, translation: data.translation }
              : word
          ))
        }
      } catch (err) {
        console.warn('Failed to fetch translation:', err)
      }
    })
  }, [inlineFeedback, transcription, userVocab, activeLanguage, nativeLanguage])

  // Handle word status change
  const handleWordStatusChange = useCallback(async (word, newStatus) => {
    if (!user || !activeLanguage) return

    try {
      const normalised = normaliseExpression(word)
      const dbStatus = newStatus === 'new' ? 'unknown' : newStatus

      await upsertVocabEntry(user.uid, activeLanguage, word, null, dbStatus)

      setUserVocab(prev => ({
        ...prev,
        [normalised]: { ...prev[normalised], status: dbStatus }
      }))

      setNurfWords(prev => prev.map(w =>
        w.normalised === normalised ? { ...w, status: dbStatus } : w
      ))
    } catch (err) {
      console.error('Failed to update word status:', err)
    }
  }, [user, activeLanguage])

  // Handle follow-up question
  const handleFollowUp = async () => {
    if (!followUpQuestion.trim() || followUpLoading) return

    setFollowUpLoading(true)
    const question = followUpQuestion.trim()
    setFollowUpQuestion('')

    setChatMessages(prev => [...prev, { role: 'user', content: question }])

    try {
      const response = await fetch('/api/practice/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: {
            userAttempt: transcription,
            modelSentence,
            targetLanguage: activeLanguage,
            sourceLanguage: nativeLanguage,
            contextSummary: 'Free speaking practice - user recorded their speech',
            currentCorrections: inlineFeedback.map(f => ({
              original: f.text,
              correction: f.correction,
              category: f.category,
              explanation: f.explanation
            }))
          }
        })
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (err) {
      console.error('Follow-up error:', err)
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I couldn\'t process your question.',
        isError: true
      }])
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
      const base = status === 'new' ? '#F97316' : getLanguageColor(activeLanguage)
      const highlighted = opacity && opacity > 0

      return (
        <span
          key={idx}
          className={`reader-word ${highlighted ? 'reader-word--highlighted' : ''}`}
          style={highlighted ? { '--hlt-base': base, '--hlt-opacity': opacity } : {}}
        >
          {token}
        </span>
      )
    })
  }, [modelSentence, userVocab, activeLanguage])

  // Get display text
  const displayText = transcription || liveTranscript || ''

  // Permission denied - show message
  if (permissionStatus === 'denied') {
    return (
      <div className="free-speaking-page" data-theme={darkMode ? 'dark' : 'light'}>
        <header className="practice-header">
          <div className="practice-header-left">
            <button className="practice-header-button" onClick={() => navigate('/dashboard')}>
              <svg className="practice-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="practice-title">Free Speaking</h1>
          </div>
        </header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', flexDirection: 'column', gap: '1rem' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
            <line x1="1" y1="1" x2="23" y2="23" stroke="#ef4444" />
          </svg>
          <h2>Microphone Access Required</h2>
          <p className="muted">Please enable microphone access in your browser settings to use free speaking.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="free-speaking-page" data-theme={darkMode ? 'dark' : 'light'}>
      {/* Header */}
      <header className="practice-header">
        <div className="practice-header-left">
          <button className="practice-header-button" onClick={() => navigate('/dashboard')}>
            <svg className="practice-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="practice-title">Free Speaking</h1>
        </div>

        <div className="practice-header-center">
          {/* Empty center for layout balance */}
        </div>

        <div className="practice-header-actions">
          {/* iOS-style toggle for corrections */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ opacity: showCorrections ? 1 : 0.5 }}>Corrections</span>
            <div
              onClick={() => setShowCorrections(!showCorrections)}
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                backgroundColor: showCorrections ? '#1f2937' : '#d1d5db',
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
                  left: showCorrections ? '22px' : '2px',
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
            borderRadius: '0 8px 8px 0',
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
              const spellingGrammarItems = inlineFeedback.filter(f =>
                f.category === 'grammar' || f.category === 'spelling' || f.category === 'punctuation'
              )
              const majorCount = spellingGrammarItems.filter(f => f.severity !== 'minor').length
              const minorCount = spellingGrammarItems.filter(f => f.severity === 'minor').length
              const totalCount = spellingGrammarItems.length
              const isExpanded = expandedCategories['grammar'] !== false
              const hasMajor = majorCount > 0
              return (
                <div className={`feedback-check-item ${hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass')}`} style={{ marginBottom: '12px' }}>
                  <div
                    className="feedback-check-header"
                    onClick={() => setExpandedCategories(prev => ({ ...prev, grammar: !isExpanded }))}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="check-label">
                      Spelling & Grammar
                      <span className="check-count" style={{ color: hasMajor ? '#ef4444' : (minorCount > 0 ? '#eab308' : 'var(--text-muted)') }}>({totalCount})</span>
                    </span>
                    <span className="check-status">
                      <span className={`check-icon ${hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass')}`}>
                        {getFeedbackIcon(hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass'))}
                      </span>
                      <span className="check-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                    </span>
                  </div>
                  {isExpanded && totalCount > 0 && (
                    <div className="feedback-corrections-list">
                      {spellingGrammarItems.map((item) => {
                        const isMinor = item.severity === 'minor'
                        return (
                          <div
                            key={item.id}
                            className={`feedback-correction-item ${activeUnderlineId === item.id ? 'active' : ''}`}
                            onClick={() => setActiveUnderlineId(item.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <span className="correction-original" style={{ color: isMinor ? '#eab308' : '#ef4444', textDecoration: 'line-through' }}>{item.text}</span>
                            <span className="correction-arrow">→</span>
                            <span className="correction-fix">{item.correction}</span>
                            <p className="correction-explanation">{item.explanation}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 2. Accuracy Section */}
            {(() => {
              const accuracyItems = inlineFeedback.filter(f =>
                f.category === 'accuracy' || f.category === 'naturalness' || f.category === 'expression'
              )
              const majorCount = accuracyItems.filter(f => f.severity !== 'minor').length
              const minorCount = accuracyItems.filter(f => f.severity === 'minor').length
              const totalCount = accuracyItems.length
              const isExpanded = expandedCategories['accuracy'] !== false
              const hasMajor = majorCount > 0
              return (
                <div className={`feedback-check-item ${hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass')}`} style={{ marginBottom: '12px' }}>
                  <div
                    className="feedback-check-header"
                    onClick={() => setExpandedCategories(prev => ({ ...prev, accuracy: !isExpanded }))}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="check-label">
                      Accuracy
                      <span className="check-count" style={{ color: hasMajor ? '#ef4444' : (minorCount > 0 ? '#eab308' : 'var(--text-muted)') }}>({totalCount})</span>
                    </span>
                    <span className="check-status">
                      <span className={`check-icon ${hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass')}`}>
                        {getFeedbackIcon(hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass'))}
                      </span>
                      <span className="check-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                    </span>
                  </div>
                  {isExpanded && totalCount > 0 && (
                    <div className="feedback-corrections-list">
                      {accuracyItems.map((item) => {
                        const isMinor = item.severity === 'minor'
                        return (
                          <div
                            key={item.id}
                            className={`feedback-correction-item ${activeUnderlineId === item.id ? 'active' : ''}`}
                            onClick={() => setActiveUnderlineId(item.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <span className="correction-original" style={{ color: isMinor ? '#eab308' : '#ef4444', textDecoration: 'line-through' }}>{item.text}</span>
                            <span className="correction-arrow">→</span>
                            <span className="correction-fix">{item.correction}</span>
                            {item.explanation && <p className="correction-explanation">{item.explanation}</p>}
                          </div>
                        )
                      })}

                      {/* Model sentence */}
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

            {/* 3. Vocab Section */}
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
                            const languageColor = getLanguageColor(activeLanguage)

                            return (
                              <div key={wordData.normalised} className="practice-word-row">
                                <div className="practice-word-row-left">
                                  <span className="practice-word-row-word">{wordData.displayWord}</span>
                                  <span className="practice-word-row-translation">{wordData.translation || '...'}</span>
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
                          New words from corrections will appear here.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Follow-up chat messages */}
            {chatMessages.map((msg, i) => (
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
          />
        </aside>

        {/* Right side - Document Area */}
        <main
          className="freewriting-document-area"
          style={{
            marginLeft: isPanelOpen ? panelWidth : 0,
            transition: 'margin-left 0.2s ease',
          }}
        >
          {/* Floating Recording Card */}
          <div className="free-speaking-recording-card">
            {error && (
              <div className="floating-recording-error">
                {error}
              </div>
            )}

            {/* Waveform */}
            <div className="floating-recording-waveform">
              <WaveformVisualizer
                analyserNode={transcriptionAnalyser || recorderAnalyser}
                isRecording={isRecording && !isPaused}
                height={60}
                barColor={isRecording ? '#ef4444' : '#64748b'}
              />
            </div>

            {/* Timer */}
            <div className={`floating-recording-timer ${isRecording ? 'recording' : ''}`}>
              {isRecording && !isPaused && (
                <span className="recording-indicator">
                  <span className="recording-dot"></span>
                </span>
              )}
              <span className="timer-display">{formatTime(recordingTime)}</span>
            </div>

            {/* Controls */}
            <div className="floating-recording-controls">
              {!isRecording && !audioUrl ? (
                <button
                  className="floating-btn floating-btn-record"
                  onClick={handleStart}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                  <span>Start Recording</span>
                </button>
              ) : isRecording ? (
                <>
                  <button
                    className="floating-btn floating-btn-secondary"
                    onClick={isPaused ? resumeRecording : pauseRecording}
                  >
                    {isPaused ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    )}
                    <span>{isPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                  <button
                    className="floating-btn floating-btn-stop"
                    onClick={handleStop}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    <span>Stop</span>
                  </button>
                </>
              ) : (
                <button
                  className="floating-btn floating-btn-secondary"
                  onClick={handleReset}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span>Start Over</span>
                </button>
              )}
            </div>

            {/* Status text */}
            {isAnalyzing && (
              <p className="floating-recording-tip" style={{ color: '#3b82f6' }}>
                Analyzing...
              </p>
            )}
          </div>

          {/* Document */}
          <div className="freewriting-document">
            <div
              className="freewriting-document-content"
              ref={documentRef}
              style={{
                minHeight: '300px',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.8',
                fontSize: '1.1rem',
              }}
            >
              {displayText ? (
                <>
                  {displayText}
                  {isRecording && <span className="typing-cursor">|</span>}
                </>
              ) : (
                <span className="muted" style={{ fontStyle: 'italic' }}>
                  {isRecording
                    ? 'Listening... Start speaking and your words will appear here.'
                    : 'Click "Start Recording" and speak freely. Your speech will be transcribed here and analyzed for feedback.'}
                </span>
              )}
            </div>

            {/* Audio playback at bottom */}
            {audioUrl && !isRecording && (
              <div className="spontaneous-playback-section">
                <audio
                  ref={playbackRef}
                  src={audioUrl}
                  onEnded={() => setIsPlaying(false)}
                />
                <button className="btn-playback-large" onClick={togglePlayback}>
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
                  <span>{isPlaying ? 'Pause Recording' : 'Play Your Recording'}</span>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default FreeSpeakingSession
