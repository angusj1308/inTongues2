import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { FloatingRecordingCard } from './FloatingRecordingCard'
import { useRealtimeTranscription } from '../../../hooks/useRealtimeTranscription'
import { useAudioRecorder } from '../../../hooks/useAudioRecorder'
import { loadUserVocab, normaliseExpression, upsertVocabEntry } from '../../../services/vocab'
import { useAuth } from '../../../context/AuthContext'
import {
  LANGUAGE_HIGHLIGHT_COLORS,
  STATUS_OPACITY,
} from '../../../constants/highlightColors'

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
const getFeedbackIcon = (state) => {
  switch (state) {
    case 'pass': return '✓'
    case 'acceptable': return '~'
    case 'fail': return '✗'
    default: return '?'
  }
}

/**
 * Spontaneous speaking session with floating recording card,
 * real-time transcription, and tutor feedback panel (like FreeWriting)
 */
export function SpontaneousSession({ activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()

  // Session states: 'idle' | 'recording' | 'reviewing' | 'analyzing' | 'complete'
  const [sessionState, setSessionState] = useState('idle')

  // Recording and transcription
  const [transcription, setTranscription] = useState('')
  const [finalTranscription, setFinalTranscription] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)

  // Feedback state
  const [feedback, setFeedback] = useState(null)
  const [inlineFeedback, setInlineFeedback] = useState([])
  const [modelSentence, setModelSentence] = useState('')
  const [error, setError] = useState(null)

  // Vocab state
  const [userVocab, setUserVocab] = useState({})
  const [nurfWords, setNurfWords] = useState([])
  const [wordTranslations, setWordTranslations] = useState({})
  const audioRef = useRef(null)

  // Panel state
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(() => Math.max(480, Math.floor(window.innerWidth / 3)))
  const [expandedCategories, setExpandedCategories] = useState({})
  const [activeUnderlineId, setActiveUnderlineId] = useState(null)

  // Follow-up question state
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const chatEndRef = useRef(null)

  // Panel resize
  const isResizing = useRef(false)
  const resizeRef = useRef(null)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRef = useRef(null)

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
      setFinalTranscription(text)
    }
  })

  // Use audio recorder hook for backup/fallback
  const {
    isRecording,
    isPaused,
    recordingTime,
    permissionStatus,
    requestPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    analyserNode: recorderAnalyser
  } = useAudioRecorder({
    maxDuration: 300
  })

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

  // Start recording and transcription
  const handleStart = async () => {
    setError(null)
    setTranscription('')
    setFinalTranscription('')

    try {
      // Start both the audio recorder and real-time transcription
      await Promise.all([
        startRecording(),
        startStreaming()
      ])
      setSessionState('recording')
    } catch (err) {
      console.error('Error starting:', err)
      setError('Could not start recording. Please check microphone permissions.')
    }
  }

  // Stop recording
  const handleStop = async () => {
    try {
      // Stop recording first
      stopRecording()

      // Stop streaming and get final transcript + audio blob
      const result = await stopStreaming()

      if (result.audioBlob) {
        setAudioBlob(result.audioBlob)
        setAudioUrl(result.audioUrl)
      }

      // Use whatever transcript we have
      const finalText = result.text || transcription || liveTranscript
      setFinalTranscription(finalText)
      setSessionState('reviewing')
    } catch (err) {
      console.error('Error stopping:', err)
      setError('Error stopping recording')
    }
  }

  // Reset and start over
  const handleCancel = () => {
    resetRecording()
    resetTranscription()
    setTranscription('')
    setFinalTranscription('')
    setAudioUrl(null)
    setAudioBlob(null)
    setFeedback(null)
    setInlineFeedback([])
    setError(null)
    setSessionState('idle')
    setIsPanelOpen(false)
    setChatMessages([])
  }

  // Submit for feedback analysis
  const handleSubmit = async () => {
    if (!finalTranscription && !transcription) {
      setError('No speech detected. Please try again.')
      return
    }

    setSessionState('analyzing')
    setError(null)

    const textToAnalyze = finalTranscription || transcription

    try {
      // Call the speech analysis API
      const response = await fetch('/api/speech/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcription: textToAnalyze,
          language: activeLanguage,
          nativeLanguage,
          type: 'spontaneous'
        })
      })

      if (!response.ok) {
        throw new Error('Analysis failed')
      }

      const result = await response.json()

      // Store feedback
      setFeedback(result.feedback || result)

      // Convert corrections to inline feedback format (like FreeWriting)
      if (result.feedback?.corrections || result.corrections) {
        const corrections = result.feedback?.corrections || result.corrections || []
        const newInlineFeedback = corrections.map((c, idx) => {
          const startIndex = textToAnalyze.indexOf(c.original)
          return {
            id: `feedback-${Date.now()}-${idx}`,
            text: c.original,
            startIndex: startIndex >= 0 ? startIndex : -1,
            endIndex: startIndex >= 0 ? startIndex + c.original.length : -1,
            category: c.category || c.type || 'grammar',
            severity: c.severity || 'major',
            correction: c.corrected || c.correction,
            explanation: c.explanation
          }
        }).filter(f => f.startIndex >= 0)

        setInlineFeedback(newInlineFeedback)
      }

      setModelSentence(result.modelSentence || result.suggestion || '')
      setSessionState('complete')
      setIsPanelOpen(true)

      // Update vocab status for words in transcription
      if (user) {
        const words = textToAnalyze.match(/[\p{L}\p{M}]+/gu) || []
        const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))]

        // Mark words as 'familiar' (user can produce them)
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
      setError('Could not analyze your speech. Please try again.')
      setSessionState('reviewing')
    }
  }

  // Extract NURF words from corrections
  useEffect(() => {
    if (!feedback?.corrections && !inlineFeedback.length) {
      setNurfWords([])
      return
    }

    const corrections = feedback?.corrections || inlineFeedback

    // Get words user produced
    const transcript = finalTranscription || transcription
    const userProducedWords = new Set(
      (transcript.match(/[\p{L}\p{M}]+/gu) || []).map(w => w.toLowerCase())
    )

    // Extract words from corrections that user didn't write
    const correctionWords = []
    corrections.forEach(c => {
      const correctionText = c.corrected || c.correction || ''
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

    // Fetch translations for words that don't have them
    const wordsNeedingTranslation = wordList.filter(w => !w.translation)
    if (wordsNeedingTranslation.length > 0) {
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
    }
  }, [feedback, inlineFeedback, finalTranscription, transcription, userVocab, activeLanguage, nativeLanguage])

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
            userAttempt: finalTranscription || transcription,
            modelSentence,
            feedback,
            targetLanguage: activeLanguage,
            sourceLanguage: nativeLanguage,
            contextSummary: 'Spontaneous speaking practice',
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

  // Render highlighted transcript with underlines
  const renderHighlightedTranscript = useMemo(() => {
    const text = finalTranscription || transcription
    if (!text) return null

    // Simple rendering without inline feedback underlines (those are rendered as overlay)
    return <span>{text}</span>
  }, [finalTranscription, transcription])

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

  // Get current display text
  const displayText = sessionState === 'recording'
    ? (liveTranscript || transcription || 'Start speaking...')
    : (finalTranscription || transcription || '')

  // Whether to show blurred overlay
  const isOverlayActive = sessionState === 'idle' || sessionState === 'recording' || sessionState === 'reviewing'

  return (
    <div className="spontaneous-session-new">
      {/* Header */}
      <div className="session-header">
        <button className="btn-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h3>Free Speaking Practice</h3>
        {sessionState === 'complete' && (
          <button
            className="floating-btn floating-btn-secondary"
            onClick={handleCancel}
            style={{ marginLeft: 'auto' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            <span>Start Over</span>
          </button>
        )}
      </div>

      {/* Main content area */}
      <div className="spontaneous-layout">
        {/* Tutor panel toggle tab */}
        {sessionState === 'complete' && (
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
        )}

        {/* Left panel - Tutor Feedback (only visible after completion) */}
        {sessionState === 'complete' && (
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
              {/* Spelling & Grammar Section */}
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

              {/* Accuracy Section */}
              {(() => {
                const accuracyItems = inlineFeedback.filter(f =>
                  f.category === 'accuracy' || f.category === 'naturalness' || f.category === 'expression' || f.category === 'vocabulary'
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

              {/* Vocab Panel Section */}
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
                            Words from tutor suggestions will appear here.
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
              ref={resizeRef}
            />
          </aside>
        )}

        {/* Main document area */}
        <main className="spontaneous-document-area">
          {/* Floating recording card overlay */}
          {isOverlayActive && (
            <div className="spontaneous-overlay">
              <FloatingRecordingCard
                isRecording={isRecording}
                isPaused={isPaused}
                recordingTime={recordingTime}
                analyserNode={transcriptionAnalyser || recorderAnalyser}
                onStart={handleStart}
                onStop={handleStop}
                onPause={pauseRecording}
                onResume={resumeRecording}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                hasRecording={sessionState === 'reviewing'}
                permissionStatus={permissionStatus}
                error={error}
              />
            </div>
          )}

          {/* Document paper (blurred when recording) */}
          <div
            className={`spontaneous-document-paper ${isOverlayActive ? 'blurred' : ''}`}
            style={{ maxWidth: '800px', margin: '0 auto' }}
          >
            <h1 className="spontaneous-document-title">Transcript</h1>

            {/* Transcript content */}
            <div className="spontaneous-document-body">
              {sessionState === 'analyzing' ? (
                <div className="analysis-loading">
                  <div className="spinner"></div>
                  <p className="muted">Analyzing your speech...</p>
                </div>
              ) : displayText ? (
                <p style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.8',
                  fontSize: '1.1rem',
                  margin: 0
                }}>
                  {renderHighlightedTranscript}
                  {sessionState === 'recording' && (
                    <span className="typing-cursor">|</span>
                  )}
                </p>
              ) : (
                <p className="muted" style={{ fontStyle: 'italic' }}>
                  Your transcript will appear here as you speak...
                </p>
              )}
            </div>

            {/* Recording playback at bottom (only when complete) */}
            {sessionState === 'complete' && audioUrl && (
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

export default SpontaneousSession
