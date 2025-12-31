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

  const contentRef = useRef(content)
  const titleRef = useRef(title)
  const hasUnsavedChanges = useRef(false)
  const autoSaveTimer = useRef(null)

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

    try {
      // Save content
      await saveWritingContent(user.uid, id, currentContent)

      // Save title if changed
      if (piece && currentTitle !== piece.title) {
        await updateWritingTitle(user.uid, id, currentTitle)
      }

      setLastSaved(new Date())
      hasUnsavedChanges.current = false
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

  const handleContentChange = (e) => {
    setContent(e.target.value)
    hasUnsavedChanges.current = true
  }

  const handleTitleChange = (e) => {
    setTitle(e.target.value)
    hasUnsavedChanges.current = true
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

  return (
    <div className="writing-editor-page">
      <header className="writing-editor-header">
        <div className="writing-editor-header-left">
          <button className="button ghost" onClick={handleBack}>
            &larr; Back
          </button>
          <span className="writing-editor-type-badge">{typeLabel}</span>
          <span className="writing-editor-language">{piece.language}</span>
        </div>
        <div className="writing-editor-header-right">
          {saving && <span className="writing-editor-save-status">Saving...</span>}
          {!saving && lastSaved && (
            <span className="writing-editor-save-status muted">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <div className={`writing-editor-main ${showFeedbackPanel ? 'with-feedback' : ''}`}>
        <div className="writing-editor-content">
          <input
            type="text"
            className="writing-editor-title"
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
          />

          <textarea
            className="writing-editor-textarea"
            value={content}
            onChange={handleContentChange}
            placeholder={`Start writing your ${typeLabel.toLowerCase()} in ${piece.language}...`}
          />
        </div>

        {showFeedbackPanel && (
          <aside className="writing-feedback-panel">
            <div className="writing-feedback-header">
              <h3>Feedback</h3>
              <button
                className="button ghost small"
                onClick={() => setShowFeedbackPanel(false)}
              >
                Hide
              </button>
            </div>
            <div className="writing-feedback-content">
              {piece.feedback?.length > 0 ? (
                piece.feedback.map((fb) => (
                  <div key={fb.id} className="writing-feedback-item">
                    <p>{fb.content}</p>
                    <span className="writing-feedback-date muted small">
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              ) : piece.status === 'submitted' ? (
                <p className="muted small">
                  Your writing has been submitted. AI feedback will appear here soon.
                </p>
              ) : (
                <p className="muted small">
                  Submit your writing to receive feedback on grammar, vocabulary, and style.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      <footer className="writing-editor-footer">
        <div className="writing-editor-footer-left">
          <span className="writing-editor-word-count muted small">
            {content.split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <div className="writing-editor-footer-right">
          <button className="button ghost" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!showFeedbackPanel && (
            <button
              className="button ghost"
              onClick={() => setShowFeedbackPanel(true)}
            >
              Show Feedback
            </button>
          )}
          {piece.status !== 'complete' && (
            <>
              <button
                className="button ghost"
                onClick={handleSubmitForFeedback}
                disabled={submitting || piece.status === 'submitted'}
              >
                {submitting
                  ? 'Submitting...'
                  : piece.status === 'submitted'
                    ? 'Submitted'
                    : 'Submit for Feedback'}
              </button>
              <button className="button primary" onClick={handleMarkComplete}>
                Mark Complete
              </button>
            </>
          )}
          {piece.status === 'complete' && (
            <span className="writing-editor-status-badge complete">Complete</span>
          )}
        </div>
      </footer>
    </div>
  )
}

export default WritingEditor
