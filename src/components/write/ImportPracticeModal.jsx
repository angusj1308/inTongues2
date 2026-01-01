import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ADAPTATION_LEVELS, SOURCE_TYPES, createPracticeLesson, splitIntoSentences } from '../../services/practice'

const ImportPracticeModal = ({ activeLanguage, onClose, onCreated }) => {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [sourceType, setSourceType] = useState('text')
  const [adaptationLevel, setAdaptationLevel] = useState('native')
  const [sourceLanguage, setSourceLanguage] = useState('English')
  const [textContent, setTextContent] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [processingStatus, setProcessingStatus] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let sentences = []

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
      } else if (sourceType === 'youtube') {
        if (!youtubeUrl.trim()) {
          setError('Please enter a YouTube URL.')
          setLoading(false)
          return
        }
        setProcessingStatus('Fetching transcript...')
        // Call the existing transcribe endpoint
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
          // Use segments as sentences
          sentences = data.segments.map(seg => seg.text.trim()).filter(s => s.length > 0)
        } else if (data.text) {
          sentences = splitIntoSentences(data.text)
        }

        if (sentences.length === 0) {
          setError('Could not extract sentences from the video.')
          setLoading(false)
          return
        }
      } else {
        setError('This import source is not yet supported.')
        setLoading(false)
        return
      }

      setProcessingStatus('Creating lesson...')

      const lessonData = {
        title: title.trim() || `Practice - ${new Date().toLocaleDateString()}`,
        sourceLanguage,
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
      setProcessingStatus('')
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content import-practice-modal">
        <div className="modal-header">
          <h2>Start Practice Lesson</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="practice-title">Title (optional)</label>
            <input
              id="practice-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Practice Lesson"
              disabled={loading}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="source-language">Source Language</label>
              <input
                id="source-language"
                type="text"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                placeholder="English"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="target-language">Target Language</label>
              <input
                id="target-language"
                type="text"
                value={activeLanguage}
                disabled
                className="disabled-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="adaptation-level">Adaptation Level</label>
            <select
              id="adaptation-level"
              value={adaptationLevel}
              onChange={(e) => setAdaptationLevel(e.target.value)}
              disabled={loading}
            >
              {ADAPTATION_LEVELS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label}
                </option>
              ))}
            </select>
            <p className="form-hint">
              {adaptationLevel === 'beginner' && 'Simplified vocabulary and shorter sentences'}
              {adaptationLevel === 'intermediate' && 'Natural expressions with some simplification'}
              {adaptationLevel === 'native' && 'Original content as-is, no adaptation'}
            </p>
          </div>

          <div className="form-group">
            <label>Import Source</label>
            <div className="source-type-tabs">
              {SOURCE_TYPES.filter(t => t.id === 'text' || t.id === 'youtube').map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`source-type-tab ${sourceType === type.id ? 'active' : ''}`}
                  onClick={() => setSourceType(type.id)}
                  disabled={loading}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {sourceType === 'text' && (
            <div className="form-group">
              <label htmlFor="text-content">Paste your text</label>
              <textarea
                id="text-content"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste the content you want to practice with..."
                rows={8}
                disabled={loading}
              />
              <p className="form-hint">
                Enter text in {sourceLanguage}. It will be split into sentences for practice.
              </p>
            </div>
          )}

          {sourceType === 'youtube' && (
            <div className="form-group">
              <label htmlFor="youtube-url">YouTube URL</label>
              <input
                id="youtube-url"
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={loading}
              />
              <p className="form-hint">
                We'll extract the transcript and split it into sentences.
              </p>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
          {processingStatus && <p className="form-status">{processingStatus}</p>}

          <div className="modal-actions">
            <button type="button" className="button ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? 'Processing...' : 'Start Practice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ImportPracticeModal
