import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../../context/AuthContext'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../firebase'
import { upsertVocabEntry } from '../../../services/vocab'
import { LANGUAGE_HIGHLIGHT_COLORS, STATUS_OPACITY } from '../../../constants/highlightColors'

// Word status constants for the vocab panel
const STATUS_LEVELS = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'U', 'R', 'F', 'K']

// Helper to get language color with case-insensitive lookup
const getLanguageColor = (language) => {
  if (!language) return LANGUAGE_HIGHLIGHT_COLORS?.default || '#3b82f6'
  const exactMatch = LANGUAGE_HIGHLIGHT_COLORS?.[language]
  if (exactMatch) return exactMatch
  const capitalized = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase()
  return LANGUAGE_HIGHLIGHT_COLORS?.[capitalized] || LANGUAGE_HIGHLIGHT_COLORS?.default || '#3b82f6'
}

// Get background style for a status button when active
const getStatusButtonStyle = (statusLevel, isActive, languageColor) => {
  if (!isActive) return {}

  switch (statusLevel) {
    case 'new':
      return {
        background: `color-mix(in srgb, #F97316 ${(STATUS_OPACITY?.new || 0.5) * 100}%, white)`,
        color: '#9a3412'
      }
    case 'unknown':
      return {
        background: `color-mix(in srgb, ${languageColor} ${(STATUS_OPACITY?.unknown || 0.4) * 100}%, white)`,
        color: '#1e293b'
      }
    case 'recognised':
      return {
        background: `color-mix(in srgb, ${languageColor} ${(STATUS_OPACITY?.recognised || 0.3) * 100}%, white)`,
        color: '#1e293b'
      }
    case 'familiar':
      return {
        background: `color-mix(in srgb, ${languageColor} ${(STATUS_OPACITY?.familiar || 0.2) * 100}%, white)`,
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

/**
 * Speaking Practice Session - Side-by-side layout
 * Left: Feedback panel with tutor chat
 * Right: Recording panel with collapsible prompt
 */
export function SpeakingPracticeSession({ lesson, activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [currentIndex, setCurrentIndex] = useState(lesson.currentIndex || 0)
  const [userRecording, setUserRecording] = useState(null)
  const [isAssessing, setIsAssessing] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [exemplar, setExemplar] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [showExemplar, setShowExemplar] = useState(false)
  const [error, setError] = useState(null)
  const [vocabToSave, setVocabToSave] = useState([])
  const [savedVocab, setSavedVocab] = useState({})
  const [expandedCategories, setExpandedCategories] = useState({ grammar: true, accuracy: true, vocab: true })

  // Collapsible prompt state
  const [promptCollapsed, setPromptCollapsed] = useState(false)

  // Tutor chat state
  const [tutorMessages, setTutorMessages] = useState([])
  const [tutorInput, setTutorInput] = useState('')
  const [tutorSending, setTutorSending] = useState(false)
  const tutorMessagesEndRef = useRef(null)

  // Recording state (simple like pronunciation practice)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  // Exemplar prefetch state
  const [exemplarCache, setExemplarCache] = useState({}) // index -> exemplar
  const [fetchingExemplars, setFetchingExemplars] = useState(false)
  const lastFetchedBatchRef = useRef(-1)

  const sentences = lesson.sentences || []
  const currentSentence = sentences[currentIndex]

  // Reset state when navigating to a new sentence
  useEffect(() => {
    setUserRecording(null)
    setFeedback(null)
    setTranscript(null)
    // Use cached exemplar if available
    setExemplar(exemplarCache[currentIndex] || null)
    setShowExemplar(false)
    setError(null)
    setVocabToSave([])
    setSavedVocab({})
    setPromptCollapsed(false)
    setTutorMessages([])
    setTutorInput('')
  }, [currentIndex, exemplarCache])

  // Scroll tutor messages
  useEffect(() => {
    tutorMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [tutorMessages])

  // Prefetch exemplars in batches of 5
  const prefetchExemplars = useCallback(async (startIndex) => {
    if (fetchingExemplars || startIndex < 0 || startIndex >= sentences.length) return

    const batchNumber = Math.floor(startIndex / 5)
    if (batchNumber <= lastFetchedBatchRef.current) return

    const batchStart = batchNumber * 5
    const batchEnd = Math.min(batchStart + 5, sentences.length)

    const sentencesToFetch = []
    const indices = []
    for (let i = batchStart; i < batchEnd; i++) {
      if (!exemplarCache[i] && sentences[i]?.text) {
        sentencesToFetch.push(sentences[i].text)
        indices.push(i)
      }
    }

    if (sentencesToFetch.length === 0) {
      lastFetchedBatchRef.current = batchNumber
      return
    }

    setFetchingExemplars(true)
    try {
      const response = await fetch('/api/speech/exemplars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentences: sentencesToFetch,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage
        })
      })

      if (response.ok) {
        const { exemplars } = await response.json()
        setExemplarCache(prev => {
          const updated = { ...prev }
          indices.forEach((idx, i) => {
            if (exemplars[i]) updated[idx] = exemplars[i]
          })
          return updated
        })
        lastFetchedBatchRef.current = batchNumber
      }
    } catch (err) {
      console.error('Exemplar prefetch failed:', err)
    } finally {
      setFetchingExemplars(false)
    }
  }, [sentences, activeLanguage, nativeLanguage, exemplarCache, fetchingExemplars])

  // Initial prefetch and trigger when 2 left in batch
  useEffect(() => {
    if (lastFetchedBatchRef.current < 0 && sentences.length > 0) {
      prefetchExemplars(0)
    }

    const currentBatch = Math.floor(currentIndex / 5)
    const positionInBatch = currentIndex % 5
    if (positionInBatch >= 3) {
      prefetchExemplars((currentBatch + 1) * 5)
    }
  }, [currentIndex, sentences.length, prefetchExemplars])

  // Update lesson progress in Firestore
  const updateProgress = useCallback(async (index, completed = false) => {
    if (!user?.uid || !lesson.id) return

    try {
      const lessonRef = doc(db, 'users', user.uid, 'practiceLessons', lesson.id)
      const updates = {
        currentIndex: index,
        updatedAt: serverTimestamp()
      }

      if (completed) {
        const updatedSentences = [...sentences]
        if (updatedSentences[index]) {
          updatedSentences[index] = { ...updatedSentences[index], status: 'completed' }
        }
        updates.sentences = updatedSentences
        updates.completedCount = updatedSentences.filter(s => s.status === 'completed').length

        if (updates.completedCount >= sentences.length) {
          updates.status = 'complete'
        }
      }

      await updateDoc(lessonRef, updates)
    } catch (err) {
      console.error('Failed to update progress:', err)
    }
  }, [user?.uid, lesson.id, sentences])

  // Recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setUserRecording({ blob, url })
        stream.getTracks().forEach(track => track.stop())
        setPromptCollapsed(true) // Collapse prompt after recording

        // Auto-submit for assessment
        await handleAssessment(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Recording error:', err)
      setError('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Handle assessment after recording stops
  const handleAssessment = async (blob) => {
    setIsAssessing(true)
    setError(null)

    try {
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]
        const cachedExemplar = exemplarCache[currentIndex]

        const response = await fetch('/api/speech/speaking-practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Audio,
            nativeSentence: currentSentence.text,
            targetLanguage: activeLanguage,
            sourceLanguage: nativeLanguage,
            exemplar: cachedExemplar,
            contextSummary: lesson.contextSummary || ''
          })
        })

        if (!response.ok) {
          throw new Error('Assessment failed')
        }

        const result = await response.json()
        setFeedback(result.feedback)
        setExemplar(result.exemplar)
        setTranscript(result.feedback?.userTranscription || null)
        setVocabToSave(result.vocab || [])
        setIsAssessing(false)
      }
    } catch (err) {
      console.error('Assessment error:', err)
      setError('Could not assess your translation. Please try again.')
      setIsAssessing(false)
    }
  }

  // Handle "I'm not sure" button
  const handleNotSure = async () => {
    setIsAssessing(true)
    setError(null)
    setPromptCollapsed(true)

    try {
      const response = await fetch('/api/speech/speaking-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nativeSentence: currentSentence.text,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage,
          skipRecording: true,
          contextSummary: lesson.contextSummary || ''
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get exemplar')
      }

      const result = await response.json()
      setExemplar(result.exemplar)
      setVocabToSave(result.vocab || [])
      setShowExemplar(true)
      setIsAssessing(false)
    } catch (err) {
      console.error('Error getting exemplar:', err)
      setError('Could not get the translation. Please try again.')
      setIsAssessing(false)
    }
  }

  // Tutor chat - ask follow-up questions
  const handleTutorSend = async () => {
    if (!tutorInput.trim() || tutorSending) return

    const question = tutorInput.trim()
    setTutorInput('')
    setTutorSending(true)

    // Add user message immediately
    setTutorMessages(prev => [...prev, { role: 'user', content: question }])

    try {
      const response = await fetch('/api/tutor/speak-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          nativeSentence: currentSentence.text,
          exemplar,
          feedback,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage
        })
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      setTutorMessages(prev => [...prev, { role: 'tutor', content: data.response }])
    } catch (err) {
      console.error('Tutor error:', err)
      setTutorMessages(prev => [...prev, { role: 'tutor', content: 'Sorry, I could not process your question. Please try again.' }])
    } finally {
      setTutorSending(false)
    }
  }

  // Navigation
  const goToNext = useCallback(() => {
    if (currentIndex < sentences.length - 1) {
      const nextIndex = currentIndex + 1
      updateProgress(nextIndex, true)
      setCurrentIndex(nextIndex)
    }
  }, [currentIndex, sentences.length, updateProgress])

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1
      updateProgress(prevIndex)
      setCurrentIndex(prevIndex)
    }
  }, [currentIndex, updateProgress])

  // Retry recording
  const retryRecording = () => {
    setUserRecording(null)
    setFeedback(null)
    setTranscript(null)
    setError(null)
    setPromptCollapsed(false)
    setTutorMessages([])
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'ArrowRight' && (feedback || showExemplar)) {
        e.preventDefault()
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrevious()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNext, goToPrevious, feedback, showExemplar])

  if (sentences.length === 0) {
    return createPortal(
      <div className="speaking-session-fullpage">
        <div className="speaking-practice-container">
          <div className="speaking-practice-empty">
            <p className="muted">No sentences found in this lesson.</p>
            <button className="btn btn-secondary" onClick={onBack}>
              Go Back
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  const isComplete = currentIndex >= sentences.length - 1 && (feedback || showExemplar)
  const hasFeedback = feedback || showExemplar
  const languageColor = getLanguageColor(activeLanguage)

  // Render feedback categories
  const renderGrammarSection = () => {
    const corrections = feedback?.corrections || []
    const grammarCorrections = corrections.filter(c => c.category === 'grammar' || c.category === 'spelling')
    const majorCount = grammarCorrections.filter(c => c.severity !== 'minor').length
    const minorCount = grammarCorrections.filter(c => c.severity === 'minor').length
    const totalCount = grammarCorrections.length
    const isExpanded = expandedCategories.grammar
    const hasMajor = majorCount > 0
    const state = hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass')

    return (
      <div className={`speaking-feedback-section ${state}`}>
        <div
          className="speaking-feedback-header"
          onClick={() => setExpandedCategories(prev => ({ ...prev, grammar: !prev.grammar }))}
        >
          <span className="speaking-feedback-title">
            Grammar & Spelling
            <span className={`speaking-feedback-count ${hasMajor ? 'error' : minorCount > 0 ? 'warn' : ''}`}>
              ({totalCount})
            </span>
          </span>
          <span className="speaking-feedback-status">
            <span className={`speaking-feedback-icon ${state}`}>{getFeedbackIcon(state)}</span>
            <span className="speaking-feedback-chevron">{isExpanded ? '▲' : '▼'}</span>
          </span>
        </div>
        {isExpanded && totalCount > 0 && (
          <div className="speaking-feedback-corrections">
            {grammarCorrections.map((c, idx) => (
              <div key={idx} className="speaking-correction-item">
                <span className={`correction-original ${c.severity === 'minor' ? 'minor' : ''}`}>{c.original}</span>
                <span className="correction-arrow">→</span>
                <span className="correction-fix">{c.correction}</span>
                {c.explanation && <p className="correction-explanation">{c.explanation}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderAccuracySection = () => {
    const corrections = feedback?.corrections || []
    const accuracyCorrections = corrections.filter(c => c.category === 'accuracy' || c.category === 'naturalness')
    const majorCount = accuracyCorrections.filter(c => c.severity !== 'minor').length
    const minorCount = accuracyCorrections.filter(c => c.severity === 'minor').length
    const totalCount = accuracyCorrections.length
    const isExpanded = expandedCategories.accuracy
    const hasMajor = majorCount > 0
    const state = hasMajor ? 'fail' : (minorCount > 0 ? 'acceptable' : 'pass')

    return (
      <div className={`speaking-feedback-section ${state}`}>
        <div
          className="speaking-feedback-header"
          onClick={() => setExpandedCategories(prev => ({ ...prev, accuracy: !prev.accuracy }))}
        >
          <span className="speaking-feedback-title">
            Accuracy
            <span className={`speaking-feedback-count ${hasMajor ? 'error' : minorCount > 0 ? 'warn' : ''}`}>
              ({totalCount})
            </span>
          </span>
          <span className="speaking-feedback-status">
            <span className={`speaking-feedback-icon ${state}`}>{getFeedbackIcon(state)}</span>
            <span className="speaking-feedback-chevron">{isExpanded ? '▲' : '▼'}</span>
          </span>
        </div>
        {isExpanded && totalCount > 0 && (
          <div className="speaking-feedback-corrections">
            {accuracyCorrections.map((c, idx) => (
              <div key={idx} className="speaking-correction-item">
                <span className={`correction-original ${c.severity === 'minor' ? 'minor' : ''}`}>{c.original}</span>
                <span className="correction-arrow">→</span>
                <span className="correction-fix">{c.correction}</span>
                {c.explanation && <p className="correction-explanation">{c.explanation}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderVocabSection = () => {
    if (vocabToSave.length === 0) return null

    const isExpanded = expandedCategories.vocab

    return (
      <div className="speaking-feedback-section vocab">
        <div
          className="speaking-feedback-header"
          onClick={() => setExpandedCategories(prev => ({ ...prev, vocab: !prev.vocab }))}
        >
          <span className="speaking-feedback-title">
            Vocabulary
            <span className="speaking-feedback-count">({vocabToSave.length})</span>
          </span>
          <span className="speaking-feedback-chevron">{isExpanded ? '▲' : '▼'}</span>
        </div>
        {isExpanded && (
          <div className="speaking-vocab-list">
            {vocabToSave.map((word, idx) => {
              const currentStatus = savedVocab[word.text] || 'new'
              const statusIndex = STATUS_LEVELS.indexOf(currentStatus)
              const validStatusIndex = statusIndex >= 0 ? statusIndex : 0

              return (
                <div key={idx} className="speaking-vocab-row">
                  <div className="speaking-vocab-text">
                    <span className="speaking-vocab-word">{word.text}</span>
                    <span className="speaking-vocab-translation">{word.translation}</span>
                  </div>
                  <div className="speaking-vocab-status">
                    {STATUS_ABBREV.map((abbrev, i) => {
                      const isActive = i === validStatusIndex
                      const style = getStatusButtonStyle(STATUS_LEVELS[i], isActive, languageColor)

                      return (
                        <button
                          key={abbrev}
                          type="button"
                          className={`speaking-status-btn ${isActive ? 'active' : ''}`}
                          style={style}
                          onClick={async () => {
                            if (!user?.uid) return
                            const newStatus = STATUS_LEVELS[i] === 'new' ? 'unknown' : STATUS_LEVELS[i]
                            try {
                              await upsertVocabEntry(user.uid, activeLanguage, word.text, word.translation, newStatus)
                              setSavedVocab(prev => ({ ...prev, [word.text]: STATUS_LEVELS[i] }))
                            } catch (err) {
                              console.error('Failed to save vocab:', err)
                            }
                          }}
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
        )}
      </div>
    )
  }

  return createPortal(
    <div className="speaking-session-fullpage">
      <div className="speaking-practice-container">
        {/* Header */}
        <div className="speaking-practice-header">
          <div className="speaking-header-left">
            <div className="speaking-practice-nav">
              <button
                type="button"
                className="speaking-nav-btn"
                onClick={goToPrevious}
                disabled={currentIndex === 0}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="speaking-nav-counter">{currentIndex + 1} / {sentences.length}</span>
              <button
                type="button"
                className="speaking-nav-btn"
                onClick={goToNext}
                disabled={currentIndex >= sentences.length - 1}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
            </div>
            <h2 className="speaking-lesson-title">{lesson.title || 'Speaking Practice'}</h2>
          </div>
          <button type="button" className="speaking-close-btn" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Two-column layout */}
        <div className="speaking-practice-columns">
          {/* Left Panel - Feedback & Tutor */}
          <div className="speaking-panel-left">
            {!hasFeedback ? (
              <div className="speaking-panel-empty">
                <div className="speaking-panel-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <p>Record to get feedback</p>
              </div>
            ) : (
              <div className="speaking-feedback-content">
                {/* Feedback sections */}
                {feedback && (
                  <>
                    {renderGrammarSection()}
                    {renderAccuracySection()}
                  </>
                )}

                {/* Vocab section */}
                {renderVocabSection()}

                {/* Tutor chat area */}
                <div className="speaking-tutor-section">
                  {tutorMessages.length > 0 && (
                    <div className="speaking-tutor-messages">
                      {tutorMessages.map((msg, idx) => (
                        <div key={idx} className={`speaking-tutor-message ${msg.role}`}>
                          {msg.content}
                        </div>
                      ))}
                      {tutorSending && (
                        <div className="speaking-tutor-message tutor typing">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      )}
                      <div ref={tutorMessagesEndRef} />
                    </div>
                  )}
                  <div className="speaking-tutor-input">
                    <input
                      type="text"
                      placeholder="Ask about the feedback..."
                      value={tutorInput}
                      onChange={(e) => setTutorInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleTutorSend()}
                      disabled={tutorSending}
                    />
                    <button
                      type="button"
                      onClick={handleTutorSend}
                      disabled={!tutorInput.trim() || tutorSending}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Recording & Results */}
          <div className="speaking-panel-right">
            {/* Before feedback: Recording interface */}
            {!hasFeedback && (
              <div className="speaking-record-zone">
                {/* Original prompt */}
                <div className="speaking-section speaking-original">
                  <span className="speaking-section-label">Original</span>
                  <p className="speaking-section-text">{currentSentence?.text || 'No text available'}</p>
                </div>

                {/* Recording controls */}
                <div className="speaking-record-controls">
                  {!isAssessing ? (
                    <>
                      <p className="speaking-record-instruction">
                        {isRecording ? 'Recording... tap to stop' : `Speak in ${activeLanguage}`}
                      </p>
                      <button
                        type="button"
                        className={`speaking-record-btn ${isRecording ? 'recording' : ''}`}
                        onClick={toggleRecording}
                      >
                        {isRecording ? (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="2" />
                          </svg>
                        ) : (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="12" r="6" />
                          </svg>
                        )}
                      </button>
                      {!isRecording && (
                        <button className="speaking-skip-btn" onClick={handleNotSure} disabled={isAssessing}>
                          I'm not sure
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="speaking-loading">
                      <div className="spinner" />
                      <p className="muted">{userRecording ? 'Analyzing...' : 'Getting translation...'}</p>
                    </div>
                  )}

                  {/* Error state */}
                  {error && (
                    <div className="speaking-error">
                      <p>{error}</p>
                      <button className="speaking-action-btn secondary" onClick={retryRecording}>Try Again</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* After feedback: Three sections in thirds */}
            {hasFeedback && (
              <div className="speaking-results-grid">
                {/* Original */}
                <div className="speaking-section speaking-original">
                  <span className="speaking-section-label">Original</span>
                  <p className="speaking-section-text">{currentSentence?.text || 'No text available'}</p>
                </div>

                {/* Your translation */}
                <div className="speaking-section speaking-translation">
                  <span className="speaking-section-label">Your translation</span>
                  <p className="speaking-section-text">{transcript || '—'}</p>
                </div>

                {/* Tutor's example */}
                <div className="speaking-section speaking-example">
                  <span className="speaking-section-label">Tutor's example</span>
                  <p className="speaking-section-text">{exemplar || '—'}</p>
                </div>

                {/* Action buttons */}
                <div className="speaking-actions">
                  {userRecording && (
                    <button className="speaking-action-btn secondary" onClick={retryRecording}>Try Again</button>
                  )}
                  {!isComplete ? (
                    <button className="speaking-action-btn primary" onClick={goToNext}>Continue</button>
                  ) : (
                    <button className="speaking-action-btn primary" onClick={onBack}>Finish</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default SpeakingPracticeSession
