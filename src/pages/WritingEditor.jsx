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

// Theme options for the writing editor
const themeOptions = [
  {
    id: 'light',
    label: 'Light',
    background: '#FFFFFF',
    text: '#1A1A1A',
    tone: 'light',
  },
  {
    id: 'dark',
    label: 'Dark',
    background: '#1a1a1a',
    text: '#e5e5e5',
    tone: 'dark',
  },
]

// Font options for the writing editor
const fontOptions = [
  {
    id: 'garamond',
    label: 'Garamond',
    fontFamily: "'EB Garamond', 'Garamond', 'Georgia', serif",
    titleFamily: "'EB Garamond', 'Garamond', 'Georgia', serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    fontFamily: "'Inter', 'SF Pro Text', system-ui, -apple-system, sans-serif",
    titleFamily: "'Inter', 'SF Pro Text', system-ui, -apple-system, sans-serif",
  },
  {
    id: 'crimson',
    label: 'Crimson',
    fontFamily: "'Crimson Pro', 'Times New Roman', serif",
    titleFamily: "'Crimson Pro', 'Times New Roman', serif",
  },
]

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
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [editorTheme, setEditorTheme] = useState('light')
  const [editorFont, setEditorFont] = useState('garamond')

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

  // Theme and font cycling
  const activeTheme = themeOptions.find((t) => t.id === editorTheme) || themeOptions[0]
  const activeFont = fontOptions.find((f) => f.id === editorFont) || fontOptions[0]

  const cycleTheme = () => {
    const currentIndex = themeOptions.findIndex((t) => t.id === editorTheme)
    const nextIndex = (currentIndex + 1) % themeOptions.length
    setEditorTheme(themeOptions[nextIndex].id)
  }

  const cycleFont = () => {
    const currentIndex = fontOptions.findIndex((f) => f.id === editorFont)
    const nextIndex = (currentIndex + 1) % fontOptions.length
    setEditorFont(fontOptions[nextIndex].id)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [save])

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
  const wordCount = content.split(/\s+/).filter(Boolean).length

  // Format the date in the target language
  const formatDateInLanguage = (date, language) => {
    if (!date) return ''
    const d = date instanceof Date ? date : new Date(date)

    // Map language names to locale codes
    const localeMap = {
      'Spanish': 'es-ES',
      'French': 'fr-FR',
      'German': 'de-DE',
      'Italian': 'it-IT',
      'Portuguese': 'pt-PT',
      'Japanese': 'ja-JP',
      'Chinese': 'zh-CN',
      'Korean': 'ko-KR',
      'Russian': 'ru-RU',
      'Arabic': 'ar-SA',
      'Dutch': 'nl-NL',
      'Swedish': 'sv-SE',
      'Norwegian': 'nb-NO',
      'Danish': 'da-DK',
      'Polish': 'pl-PL',
      'Turkish': 'tr-TR',
      'Greek': 'el-GR',
      'Hebrew': 'he-IL',
      'Hindi': 'hi-IN',
      'Thai': 'th-TH',
      'Vietnamese': 'vi-VN',
      'Indonesian': 'id-ID',
      'Malay': 'ms-MY',
    }

    const locale = localeMap[language] || 'en-US'

    return d.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  // SVG Icons
  const icons = {
    check: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    circle: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
    loader: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    ),
    send: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    messageCircle: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    checkCircle: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    save: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    ),
    arrowLeft: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    ),
    sun: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    ),
    moon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  }

  // Get status info - only show for saving/saved/submitted/complete, not draft
  const getStatusInfo = () => {
    if (saving) return { label: 'Saving', icon: icons.loader, class: 'saving', show: true }
    if (saveSuccess) return { label: 'Saved', icon: icons.check, class: 'saved', show: true }
    if (piece.status === 'submitted') return { label: 'Submitted', icon: icons.checkCircle, class: 'submitted', show: true }
    if (piece.status === 'complete') return { label: 'Complete', icon: icons.check, class: 'complete', show: true }
    return { label: 'Draft', icon: icons.circle, class: 'draft', show: false }
  }

  const status = getStatusInfo()

  return (
    <div
      className="writing-editor-page writing-editor-themed"
      style={{
        '--editor-bg': activeTheme.background,
        '--editor-text': activeTheme.text,
        '--editor-font': activeFont.fontFamily,
        '--editor-title-font': activeFont.titleFamily,
      }}
      data-editor-tone={activeTheme.tone}
    >
      {/* Hover header shell */}
      <div className="writing-editor-hover-shell">
        <div className="writing-editor-hover-hitbox" />
        <header className="writing-editor-header writing-editor-hover-header">
          <button className="writing-editor-back-btn" onClick={handleBack}>
            <span className="writing-editor-back-icon">{icons.arrowLeft}</span>
            Back to dashboard
          </button>
          <div className="writing-editor-header-right">
            <button
              className="writing-editor-header-btn"
              type="button"
              aria-label={`Font: ${activeFont.label}`}
              onClick={(e) => {
                cycleFont()
                e.currentTarget.blur()
              }}
            >
              Aa
            </button>
            <button
              className="writing-editor-header-btn icon-btn"
              type="button"
              aria-label={activeTheme.tone === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={(e) => {
                cycleTheme()
                e.currentTarget.blur()
              }}
            >
              {activeTheme.tone === 'dark' ? icons.sun : icons.moon}
            </button>
            <button
              className="writing-editor-header-btn icon-btn"
              onClick={handleSave}
              disabled={saving}
              title="Save"
            >
              {saving ? icons.loader : icons.save}
            </button>
            {status.show && (
              <div className={`writing-editor-status-pill ${status.class}`}>
                <span className="writing-editor-status-icon">{status.icon}</span>
                <span className="writing-editor-status-label">{status.label}</span>
              </div>
            )}
          </div>
        </header>
      </div>

      <div className={`writing-editor-main ${showFeedbackPanel ? 'with-feedback' : ''}`}>
        <div className="writing-editor-canvas">
          <div className="writing-editor-content">
            <div className="writing-editor-date">
              {formatDateInLanguage(piece.createdAt, piece.language)}
            </div>

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
              placeholder="What's on your mind today..."
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
        </div>
        <div className="writing-editor-footer-right">
          <button
            className="writing-editor-action-btn secondary"
            onClick={handleSave}
            disabled={saving}
          >
            <span className="writing-editor-action-icon">{saving ? icons.loader : icons.save}</span>
            {saving ? 'Saving' : 'Save'}
          </button>
          <button
            className="writing-editor-action-btn secondary"
            onClick={() => setShowFeedbackPanel(!showFeedbackPanel)}
          >
            <span className="writing-editor-action-icon">{icons.messageCircle}</span>
            Feedback
          </button>
        </div>
      </footer>
    </div>
  )
}

export default WritingEditor
