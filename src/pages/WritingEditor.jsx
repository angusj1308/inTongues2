import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  TEXT_TYPES,
  getWritingPiece,
  saveWritingContent,
  updateWritingTitle,
  updateWritingStatus,
  submitForFeedback,
} from '../services/writing'

const AUTO_SAVE_INTERVAL = 30000 // 30 seconds
const FOCUS_MODE_DELAY = 2000 // 2 seconds before dimming chrome

const WritingEditor = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [piece, setPiece] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [error, setError] = useState('')
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const contentRef = useRef(content)
  const titleRef = useRef(title)
  const hasUnsavedChanges = useRef(false)
  const autoSaveTimer = useRef(null)
  const focusModeTimer = useRef(null)

  // Keep refs in sync
  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    titleRef.current = title
  }, [title])

  // Load piece
  useEffect(() => {
    const loadPiece = async () => {
      if (!user || !id) {
        setLoading(false)
        return
      }

      try {
        const loadedPiece = await getWritingPiece(user.uid, id)
        if (!loadedPiece) {
          setError('Piece not found')
          setLoading(false)
          return
        }

        setPiece(loadedPiece)
        setTitle(loadedPiece.title || '')
        setContent(loadedPiece.content || '')
        setLoading(false)
      } catch (err) {
        console.error('Failed to load piece:', err)
        setError('Failed to load your writing')
        setLoading(false)
      }
    }

    loadPiece()
  }, [id, user])

  // Save function
  const save = useCallback(async (forceContentSave = false) => {
    if (!user || !id) return

    const currentContent = contentRef.current
    const currentTitle = titleRef.current

    if (!hasUnsavedChanges.current && !forceContentSave) return

    setSaving(true)
    setSaveSuccess(false)

    try {
      // Save content
      await saveWritingContent(user.uid, id, currentContent)

      // Save title if changed
      if (piece && currentTitle !== piece.title) {
        await updateWritingTitle(user.uid, id, currentTitle)
      }

      setLastSaved(new Date())
      hasUnsavedChanges.current = false
      setSaveSuccess(true)
      // Reset success indicator after animation
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }, [id, piece, user])

  // Auto-save setup
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (hasUnsavedChanges.current) {
        save()
      }
    }, AUTO_SAVE_INTERVAL)

    return () => {
      if (autoSaveTimer.current) {
        clearInterval(autoSaveTimer.current)
      }
    }
  }, [save])

  // Save on blur
  useEffect(() => {
    const handleBlur = () => {
      if (hasUnsavedChanges.current) {
        save()
      }
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [save])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Focus mode: dim chrome when typing
  const triggerFocusMode = useCallback(() => {
    setIsFocusMode(true)
    if (focusModeTimer.current) {
      clearTimeout(focusModeTimer.current)
    }
    focusModeTimer.current = setTimeout(() => {
      setIsFocusMode(false)
    }, FOCUS_MODE_DELAY)
  }, [])

  // Cleanup focus mode timer
  useEffect(() => {
    return () => {
      if (focusModeTimer.current) {
        clearTimeout(focusModeTimer.current)
      }
    }
  }, [])

  const handleContentChange = (e) => {
    setContent(e.target.value)
    hasUnsavedChanges.current = true
    triggerFocusMode()
  }

  const handleTitleChange = (e) => {
    setTitle(e.target.value)
    hasUnsavedChanges.current = true
    triggerFocusMode()
  }

  const handleSave = async () => {
    await save(true)
  }

  const handleSubmitForFeedback = async () => {
    if (!user || !id) return

    // Save first
    await save(true)

    setSubmitting(true)
    try {
      await submitForFeedback(user.uid, id)
      setPiece((prev) => ({ ...prev, status: 'submitted' }))
      setShowFeedbackPanel(true)
    } catch (err) {
      console.error('Failed to submit for feedback:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkComplete = async () => {
    if (!user || !id) return

    await save(true)

    try {
      await updateWritingStatus(user.uid, id, 'complete')
      setPiece((prev) => ({ ...prev, status: 'complete' }))
    } catch (err) {
      console.error('Failed to mark complete:', err)
    }
  }

  const handleBack = async () => {
    if (hasUnsavedChanges.current) {
      await save(true)
    }
    navigate('/dashboard', { state: { initialTab: 'write' } })
  }

  if (loading) {
    return (
      <div className="writing-editor-page">
        <div className="writing-editor-loading">
          <p className="muted">Loading your writing...</p>
        </div>
      </div>
    )
  }

  if (error || !piece) {
    return (
      <div className="writing-editor-page">
        <div className="writing-editor-error">
          <p className="error">{error || 'Something went wrong'}</p>
          <button className="button ghost" onClick={() => navigate('/dashboard', { state: { initialTab: 'write' } })}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const typeInfo = TEXT_TYPES.find((t) => t.id === piece.textType)
  const typeLabel = typeInfo?.label || piece.textType
  const wordCount = content.split(/\s+/).filter(Boolean).length

  // Format the date nicely
  const formatDate = (date) => {
    if (!date) return ''
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  // Get status info
  const getStatusInfo = () => {
    if (saving) return { label: 'Saving', icon: '○', class: 'saving' }
    if (saveSuccess) return { label: 'Saved', icon: '✓', class: 'saved' }
    if (piece.status === 'submitted') return { label: 'Submitted', icon: '◉', class: 'submitted' }
    if (piece.status === 'complete') return { label: 'Complete', icon: '✓', class: 'complete' }
    return { label: 'Draft', icon: '○', class: 'draft' }
  }

  const status = getStatusInfo()

  return (
    <div className={`writing-editor-page ${isFocusMode ? 'focus-mode' : ''}`}>
      <header className="writing-editor-header">
        <nav className="writing-editor-breadcrumb">
          <button className="writing-editor-nav-link" onClick={handleBack}>
            Dashboard
          </button>
          <span className="writing-editor-nav-separator">/</span>
          <span className="writing-editor-nav-current">Write</span>
        </nav>
        <div className="writing-editor-header-right">
          <div className={`writing-editor-status-pill ${status.class}`}>
            <span className="writing-editor-status-icon">{status.icon}</span>
            <span className="writing-editor-status-label">{status.label}</span>
          </div>
        </div>
      </header>

      <div className={`writing-editor-main ${showFeedbackPanel ? 'with-feedback' : ''}`}>
        <div className="writing-editor-canvas">
          <div className="writing-editor-content">
            <div className="writing-editor-meta">
              <span className="writing-editor-type-badge">{typeLabel}</span>
              <span className="writing-editor-meta-separator">·</span>
              <span className="writing-editor-language">{piece.language}</span>
            </div>

            <input
              type="text"
              className="writing-editor-title"
              value={title}
              onChange={handleTitleChange}
              placeholder={formatDate(piece.createdAt) || 'Untitled'}
            />

            <div className="writing-editor-title-underline" />

            <textarea
              className="writing-editor-textarea"
              value={content}
              onChange={handleContentChange}
              placeholder={`Start writing your ${typeLabel.toLowerCase()}...`}
            />
          </div>
        </div>

        {showFeedbackPanel && (
          <aside className="writing-feedback-panel">
            <div className="writing-feedback-header">
              <h3>Feedback</h3>
              <button
                className="writing-feedback-close"
                onClick={() => setShowFeedbackPanel(false)}
                aria-label="Close feedback panel"
              >
                ×
              </button>
            </div>
            <div className="writing-feedback-content">
              {piece.feedback?.length > 0 ? (
                piece.feedback.map((fb) => (
                  <div key={fb.id} className="writing-feedback-item">
                    <p>{fb.content}</p>
                    <span className="writing-feedback-date">
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              ) : piece.status === 'submitted' ? (
                <div className="writing-feedback-empty">
                  <span className="writing-feedback-empty-icon">◎</span>
                  <p>Your writing has been submitted.</p>
                  <p className="muted">AI feedback will appear here soon.</p>
                </div>
              ) : (
                <div className="writing-feedback-empty">
                  <span className="writing-feedback-empty-icon">💬</span>
                  <p>No feedback yet</p>
                  <p className="muted">Submit your writing to receive feedback on grammar, vocabulary, and style.</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <footer className="writing-editor-footer">
        <div className="writing-editor-footer-left">
          <span className="writing-editor-word-count">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
          {lastSaved && !saving && (
            <span className="writing-editor-last-saved">
              Last saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="writing-editor-footer-right">
          <button
            className="writing-editor-action-btn secondary"
            onClick={() => setShowFeedbackPanel(!showFeedbackPanel)}
          >
            <span className="writing-editor-action-icon">💬</span>
            Feedback
          </button>
          {piece.status !== 'complete' && (
            <>
              <button
                className="writing-editor-action-btn secondary"
                onClick={handleSubmitForFeedback}
                disabled={submitting || piece.status === 'submitted'}
              >
                {submitting ? (
                  <>
                    <span className="writing-editor-action-icon spinning">◌</span>
                    Submitting
                  </>
                ) : piece.status === 'submitted' ? (
                  <>
                    <span className="writing-editor-action-icon">✓</span>
                    Submitted
                  </>
                ) : (
                  <>
                    <span className="writing-editor-action-icon">↗</span>
                    Submit
                  </>
                )}
              </button>
              <button
                className="writing-editor-action-btn primary"
                onClick={handleMarkComplete}
              >
                <span className="writing-editor-action-icon">✓</span>
                Complete
              </button>
            </>
          )}
          {piece.status === 'complete' && (
            <div className="writing-editor-complete-badge">
              <span className="writing-editor-action-icon">✓</span>
              Completed
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}

export default WritingEditor
