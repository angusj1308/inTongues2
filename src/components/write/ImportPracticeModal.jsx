import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ADAPTATION_LEVELS, createPracticeLesson, splitIntoSentences } from '../../services/practice'

const SOURCE_OPTIONS = [
  { id: 'text', label: 'Paste Text' },
  { id: 'youtube', label: 'YouTube Video' },
]

const ImportPracticeModal = ({ activeLanguage, onClose, onCreated }) => {
  const { user } = useAuth()
  const [sourceType, setSourceType] = useState('')
  const [adaptationLevel, setAdaptationLevel] = useState('native')
  const [textContent, setTextContent] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!sourceType) {
      setError('Please select a source type')
      return
    }

    setError('')
    setLoading(true)

    try {
      let sentences = []
      let title = `Practice - ${new Date().toLocaleDateString()}`

      if (sourceType === 'text') {
        if (!textContent.trim()) {
          setError('Please enter some text to practice with.')
          setLoading(false)
          return
        }
        sentences = splitIntoSentences(textContent)
        if (sentences.length === 0) {
          setError('Could not extract sentences from the text.')
          setLoading(false)
          return
        }
        title = textContent.slice(0, 40).trim() + (textContent.length > 40 ? '...' : '')
      } else if (sourceType === 'youtube') {
        if (!youtubeUrl.trim()) {
          setError('Please enter a YouTube URL.')
          setLoading(false)
          return
        }

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: youtubeUrl }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to fetch transcript')
        }

        const data = await response.json()
        if (data.segments && data.segments.length > 0) {
          sentences = data.segments.map(seg => seg.text.trim()).filter(s => s.length > 0)
        } else if (data.text) {
          sentences = splitIntoSentences(data.text)
        }

        if (sentences.length === 0) {
          setError('Could not extract sentences from the video.')
          setLoading(false)
          return
        }

        title = data.title || title
      }

      const lessonData = {
        title,
        sourceLanguage: 'English',
        targetLanguage: activeLanguage,
        adaptationLevel,
        sourceType,
        sentences: sentences.map((text, index) => ({
          index,
          text,
          status: 'pending',
        })),
      }

      const newLesson = await createPracticeLesson(user.uid, lessonData)
      onCreated(newLesson)
    } catch (err) {
      console.error('Import error:', err)
      setError(err.message || 'Failed to create practice lesson.')
    } finally {
      setLoading(false)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const canSubmit = sourceType && (
    (sourceType === 'text' && textContent.trim()) ||
    (sourceType === 'youtube' && youtubeUrl.trim())
  )

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="practice-modal-title"
    >
      <div className="modal-content create-piece-modal">
        <div className="modal-header">
          <h2 id="practice-modal-title">Translation Practice</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Import from</label>
            <div className="text-type-grid">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`text-type-option ${sourceType === opt.id ? 'selected' : ''}`}
                  onClick={() => setSourceType(opt.id)}
                  type="button"
                  disabled={loading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {sourceType === 'text' && (
            <div className="form-group">
              <label className="form-label" htmlFor="practice-text">
                Paste your English text
              </label>
              <textarea
                id="practice-text"
                className="form-textarea"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste a paragraph or article you want to practice expressing in your target language..."
                rows={5}
                disabled={loading}
              />
            </div>
          )}

          {sourceType === 'youtube' && (
            <div className="form-group">
              <label className="form-label" htmlFor="practice-url">
                YouTube URL
              </label>
              <input
                id="practice-url"
                type="url"
                className="form-input"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                disabled={loading}
              />
            </div>
          )}

          {sourceType && (
            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <div className="text-type-grid">
                {ADAPTATION_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    className={`text-type-option ${adaptationLevel === level.id ? 'selected' : ''}`}
                    onClick={() => setAdaptationLevel(level.id)}
                    type="button"
                    disabled={loading}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="error small">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="button ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleSubmit}
            disabled={loading || !canSubmit}
          >
            {loading ? 'Processing...' : 'Start Practice'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportPracticeModal
