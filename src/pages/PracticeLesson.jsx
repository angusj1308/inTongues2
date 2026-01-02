import { useCallback, useEffect, useRef, useState } from 'react'
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
          fullTranscript: lesson.fullTranscript,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get feedback')
      }

      const data = await response.json()

      setFeedback(data.feedback)
      setModelSentence(data.modelSentence || '')

      // Add tutor response to chat
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.feedback?.explanation || 'Here is my feedback on your attempt.',
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

      if (result.isComplete) {
        setChatMessages([
          {
            role: 'assistant',
            content: '🎉 Congratulations! You\'ve completed this practice lesson!',
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
        if (attemptData.feedback) {
          setFeedback(attemptData.feedback)
          setModelSentence(attemptData.modelSentence || '')
          setChatMessages([
            {
              role: 'assistant',
              content: attemptData.feedback.explanation || '',
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
            fullTranscript: lesson.fullTranscript,
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
      {/* Header */}
      <header className="practice-header">
        <button className="button ghost back-button" onClick={() => navigate('/dashboard')}>
          ← Back
        </button>
        <div className="practice-header-info">
          <span className="practice-header-meta">
            {lesson.sourceLanguage} → {lesson.targetLanguage} • {lesson.completedCount}/{lesson.sentences?.length || 0} sentences
          </span>
        </div>
        <div className="practice-header-actions">
          <button
            className="button ghost danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </button>
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

            {/* Chat messages */}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`practice-chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}
              >
                {msg.content}
              </div>
            ))}

            {/* Feedback checklist - shown while checking or after feedback */}
            {(feedbackLoading || feedback) && (
              <div className="practice-feedback-checklist">
                <div className={`feedback-check-item ${feedback ? (feedback.correctness >= 4 ? 'pass' : 'fail') : 'checking'}`}>
                  <span className="check-label">Grammar & Spelling</span>
                  <span className="check-status">
                    {!feedback ? (
                      <span className="checking-text">checking...</span>
                    ) : feedback.correctness >= 4 ? (
                      <span className="check-icon pass">✓</span>
                    ) : (
                      <span className="check-icon fail">✗</span>
                    )}
                  </span>
                </div>
                <div className={`feedback-check-item ${feedback ? (feedback.accuracy >= 4 ? 'pass' : 'fail') : 'checking'}`}>
                  <span className="check-label">Accuracy</span>
                  <span className="check-status">
                    {!feedback ? (
                      <span className="checking-text">checking...</span>
                    ) : feedback.accuracy >= 4 ? (
                      <span className="check-icon pass">✓</span>
                    ) : (
                      <span className="check-icon fail">✗</span>
                    )}
                  </span>
                </div>
                <div className={`feedback-check-item ${feedback ? (feedback.naturalness >= 4 ? 'pass' : 'fail') : 'checking'}`}>
                  <span className="check-label">Naturalness</span>
                  <span className="check-status">
                    {!feedback ? (
                      <span className="checking-text">checking...</span>
                    ) : feedback.naturalness >= 4 ? (
                      <span className="check-icon pass">✓</span>
                    ) : (
                      <span className="check-icon fail">✗</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Feedback explanation - only shows issues */}
            {feedback && feedback.explanation && (
              <div className="practice-feedback-explanation">
                {feedback.explanation}
              </div>
            )}

            {/* Example sentence - shown after feedback */}
            {feedback && modelSentence && (
              <div className="practice-example-sentence">
                <span className="example-label">Example:</span>
                <p className="example-text">{modelSentence}</p>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Follow-up input */}
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
              {/* Completed sentences - clickable to navigate */}
              {lesson.sentences?.map((s, i) => {
                const attempt = lesson.attempts?.find((a) => a.sentenceIndex === i)
                if (attempt?.status === 'finalized') {
                  return (
                    <span
                      key={i}
                      className={`practice-document-sentence ${i === lesson.currentIndex ? 'current' : ''}`}
                      onClick={() => handleGoToSentence(i)}
                      title="Click to revise"
                    >
                      {attempt.finalText}{' '}
                    </span>
                  )
                }
                return null
              })}

              {/* Current sentence workspace - clean textarea */}
              {!isComplete && currentSentence && (
                <textarea
                  ref={attemptInputRef}
                  className="practice-inline-input"
                  value={userAttempt}
                  onChange={(e) => setUserAttempt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Continue writing..."
                  rows={1}
                  disabled={feedbackLoading}
                />
              )}
            </div>

            {/* Actions bar - simple buttons */}
            {!isComplete && currentSentence && (
              <div className="practice-actions-bar">
                {!feedback ? (
                  <button
                    className="button primary"
                    onClick={handleSubmitAttempt}
                    disabled={!userAttempt.trim() || feedbackLoading}
                  >
                    {feedbackLoading ? 'Checking...' : 'Submit'}
                  </button>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => handleFinalize(false)}
                    disabled={!userAttempt.trim()}
                  >
                    Next
                  </button>
                )}
              </div>
            )}
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
