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

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const attemptInputRef = useRef(null)
  const chatEndRef = useRef(null)

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
        <aside className="practice-chat-panel">
          <div className="practice-chat-header">
            <h2>Tutor</h2>
          </div>
          <div className="practice-chat-messages">
            {chatMessages.length === 0 && !isComplete && (
              <div className="practice-chat-empty">
                <p className="muted">
                  Type your attempt at expressing the sentence in {lesson.targetLanguage}, and I'll give you feedback.
                </p>
              </div>
            )}
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

          {/* Feedback details */}
          {feedback && (
            <div className="practice-feedback-details">
              {feedback.naturalness && (
                <div className="feedback-item">
                  <span className="feedback-label">Naturalness</span>
                  <span className="feedback-value">{feedback.naturalness}/5</span>
                </div>
              )}
              {feedback.accuracy && (
                <div className="feedback-item">
                  <span className="feedback-label">Accuracy</span>
                  <span className="feedback-value">{feedback.accuracy}/5</span>
                </div>
              )}
              {feedback.grammarIssues?.length > 0 && (
                <div className="feedback-item full-width">
                  <span className="feedback-label">Grammar Notes</span>
                  <ul className="feedback-list">
                    {feedback.grammarIssues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.suggestions?.length > 0 && (
                <div className="feedback-item full-width">
                  <span className="feedback-label">Suggestions</span>
                  <ul className="feedback-list">
                    {feedback.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
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

              {/* Current sentence workspace - inline in document */}
              {!isComplete && currentSentence && (
                <span className="practice-current-sentence">
                  <span className="practice-source-text">{currentSentence.text}</span>
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
                </span>
              )}
            </div>

            {/* Actions bar - outside the paper flow */}
            {!isComplete && currentSentence && (
              <div className="practice-actions-bar">
                {!feedback && (
                  <button
                    className="button primary"
                    onClick={handleSubmitAttempt}
                    disabled={!userAttempt.trim() || feedbackLoading}
                  >
                    {feedbackLoading ? 'Checking...' : 'Submit'}
                  </button>
                )}

                {/* Model sentence and actions */}
                {feedback && modelSentence && (
                  <div className="practice-model-section">
                    <div className="practice-model-sentence">
                      <span className="label">Model:</span>
                      <p className="model-text">{modelSentence}</p>
                    </div>
                    <div className="practice-actions">
                      <button
                        className="button ghost"
                        onClick={() => handleFinalize(false)}
                      >
                        Keep Mine
                      </button>
                      <button
                        className="button primary"
                        onClick={() => handleFinalize(true)}
                      >
                        Use Model
                      </button>
                    </div>
                  </div>
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
