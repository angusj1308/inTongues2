import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { createPost } from '../../services/community'

const LANGUAGES = ['General', 'English', 'Spanish', 'French', 'Italian']
const TITLE_MIN = 10
const TITLE_MAX = 200
const BODY_MIN = 20
const BODY_MAX = 5000

export function CreatePostModal({ onClose, onPostCreated, defaultLanguage = 'General' }) {
  const { user, profile } = useAuth()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [language, setLanguage] = useState(defaultLanguage)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const titleValid = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX
  const bodyValid = body.trim().length >= BODY_MIN && body.trim().length <= BODY_MAX
  const canSubmit = titleValid && bodyValid && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || !user) return

    setSubmitting(true)
    setError('')

    try {
      const newPost = await createPost(user.uid, profile, {
        title,
        body,
        language,
      })
      onPostCreated?.(newPost)
      onClose()
    } catch (err) {
      console.error('Failed to create post:', err)
      setError('Failed to create post. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content community-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Ask the Community</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="create-post-form">
          <div className="form-group">
            <label htmlFor="post-title">Title</label>
            <input
              id="post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's your question?"
              maxLength={TITLE_MAX}
              autoFocus
            />
            <div className="form-hint">
              <span className={title.trim().length < TITLE_MIN ? 'invalid' : ''}>
                {title.trim().length}/{TITLE_MAX}
              </span>
              {title.trim().length < TITLE_MIN && (
                <span className="hint-text">Minimum {TITLE_MIN} characters</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="post-body">Details</label>
            <textarea
              id="post-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Provide more context about your question..."
              rows={6}
              maxLength={BODY_MAX}
            />
            <div className="form-hint">
              <span className={body.trim().length < BODY_MIN ? 'invalid' : ''}>
                {body.trim().length}/{BODY_MAX}
              </span>
              {body.trim().length < BODY_MIN && (
                <span className="hint-text">Minimum {BODY_MIN} characters</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="post-language">Language</label>
            <select
              id="post-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <div className="form-hint">
              <span className="hint-text">Tag your question with the relevant language</span>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {submitting ? 'Posting...' : 'Post Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreatePostModal
