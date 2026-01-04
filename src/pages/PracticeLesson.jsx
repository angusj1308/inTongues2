import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  deletePracticeLesson,
  finalizeAttempt,
  getCompletedDocument,
  getPracticeLesson,
  saveAttempt,
  updatePracticeLesson,
} from '../services/practice'
import { loadUserVocab, normaliseExpression } from '../services/vocab'
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

  // Display settings
  const [showWordStatus, setShowWordStatus] = useState(true)
  const [darkMode, setDarkMode] = useState(() => {
    // Check if dark mode is already set
    return document.documentElement.getAttribute('data-theme') === 'dark'
  })

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!feedback) {
        handleSubmitAttempt()
      }
    }
  }

  const handleDelete = async () => {
    try {
      await deletePracticeLesson(user.uid, lessonId)
      navigate('/dashboard')
    } catch (err) {
      console.error('Delete error:', err)
      setError('Failed to delete lesson.')
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
        setUserAttempt(attemptData.userText || '')
        // Sync contentEditable span with loaded text
        if (attemptInputRef.current) {
          attemptInputRef.current.textContent = attemptData.userText || ''
        }
        if (attemptData.feedback) {
          setFeedback(attemptData.feedback)
          setModelSentence(attemptData.modelSentence || '')
          setChatMessages([
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
        // Clear contentEditable span
        if (attemptInputRef.current) {
          attemptInputRef.current.textContent = ''
        }
      }
    } catch (err) {
      console.error('Navigation error:', err)
    }
  }

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
          </div>
          <div className="practice-chat-messages">
            {/* Current prompt */}
            {!isComplete && currentSentence && (
              <div className="practice-tutor-prompt">
                <span className="prompt-label">Translate this sentence:</span>
                <p className="prompt-text">{currentSentence.text}</p>
              </div>
            )}

            {/* Chat messages with feedback inline */}
            {chatMessages.map((msg, i) => (
              <div key={i}>
                <div
                  className={`practice-chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}
                >
                  {msg.content}
                </div>

                {/* Render feedback components right after the first assistant response */}
                {msg.role === 'assistant' && msg.hasFeedback && (
                  <>
                    {/* Feedback checklist */}
                    <div className="practice-feedback-checklist">
                      <div className={`feedback-check-item ${feedback?.correctness >= 4 ? 'pass' : 'fail'}`}>
                        <span className="check-label">Grammar & Spelling</span>
                        <span className="check-status">
                          <span className={`check-icon ${feedback?.correctness >= 4 ? 'pass' : 'fail'}`}>
                            {feedback?.correctness >= 4 ? '✓' : '✗'}
                          </span>
                        </span>
                      </div>
                      <div className={`feedback-check-item ${feedback?.accuracy >= 4 ? 'pass' : 'fail'}`}>
                        <span className="check-label">Accuracy</span>
                        <span className="check-status">
                          <span className={`check-icon ${feedback?.accuracy >= 4 ? 'pass' : 'fail'}`}>
                            {feedback?.accuracy >= 4 ? '✓' : '✗'}
                          </span>
                        </span>
                      </div>
                      <div className={`feedback-check-item ${feedback?.naturalness >= 4 ? 'pass' : 'fail'}`}>
                        <span className="check-label">Naturalness</span>
                        <span className="check-status">
                          <span className={`check-icon ${feedback?.naturalness >= 4 ? 'pass' : 'fail'}`}>
                            {feedback?.naturalness >= 4 ? '✓' : '✗'}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Example sentence with word status highlighting */}
                    {modelSentence && (
                      <div className="practice-example-sentence">
                        <span className="example-label">Example:</span>
                        <p className="example-text">
                          {renderHighlightedModelSentence}
                        </p>
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
                    onClick={() => handleFinalize(false)}
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
              {/* Render sentences with current one editable */}
              {lesson.sentences?.map((s, i) => {
                const attempt = lesson.attempts?.find((a) => a.sentenceIndex === i)
                const isCurrent = i === lesson.currentIndex
                const isFinalized = attempt?.status === 'finalized'

                // Current sentence - always editable
                if (isCurrent && !isComplete) {
                  return (
                    <span
                      key={i}
                      ref={attemptInputRef}
                      className="practice-inline-input current"
                      contentEditable={!feedbackLoading}
                      suppressContentEditableWarning
                      onInput={(e) => setUserAttempt(e.currentTarget.textContent || '')}
                      onKeyDown={handleKeyDown}
                      data-placeholder="Continue writing..."
                    />
                  )
                }

                // Finalized sentences - clickable to navigate
                if (isFinalized) {
                  return (
                    <span
                      key={i}
                      className="practice-document-sentence"
                      onClick={() => handleGoToSentence(i)}
                      title="Click to revise"
                    >
                      {renderTextWithWordStatus(attempt.finalText, `doc-${i}-`)}{' '}
                    </span>
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
    </div>
  )
}

export default PracticeLesson
