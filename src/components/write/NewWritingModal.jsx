import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { TEXT_TYPES } from '../../services/writing'
import { ADAPTATION_LEVELS, createPracticeLesson, splitIntoSentences } from '../../services/practice'
import { createFreeWritingLesson } from '../../services/freewriting'

const MODES = [
  {
    id: 'free',
    title: 'Free Writing',
    desc: 'Write journals, essays, stories, and more',
  },
  {
    id: 'practice',
    title: 'Translation Practice',
    desc: 'Express ideas from your native language',
  },
]

const SOURCE_OPTIONS = [
  { id: 'text', label: 'Paste Text' },
  { id: 'youtube', label: 'YouTube Video' },
]

const NewWritingModal = ({ activeLanguage, initialMode, onClose, onCreated }) => {
  const { user } = useAuth()

  // Step management - start with initialMode if provided
  const [mode, setMode] = useState(initialMode || null) // 'free' or 'practice'

  // Free writing state
  const [selectedType, setSelectedType] = useState('')
  const [customType, setCustomType] = useState('')
  const [title, setTitle] = useState('')

  // Practice state
  const [sourceType, setSourceType] = useState('')
  const [adaptationLevel, setAdaptationLevel] = useState('native')
  const [textContent, setTextContent] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeTitle, setYoutubeTitle] = useState('')

  // Shared state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const handleBack = () => {
    setMode(null)
    setError('')
  }

  const handleCreateFreeWriting = async () => {
    if (!selectedType) {
      setError('Please select a text type')
      return
    }

    if (selectedType === 'other' && !customType.trim()) {
      setError('Please enter a custom text type')
      return
    }

    setLoading(true)
    setError('')

    try {
      const textType = selectedType === 'other' ? customType.trim() : selectedType
      const newLesson = await createFreeWritingLesson(user.uid, {
        title: title.trim() || `Untitled ${textType}`,
        textType,
        targetLanguage: activeLanguage,
        sourceLanguage: 'English',
      })
      onCreated(newLesson, 'free')
    } catch (err) {
      console.error('Failed to create free writing:', err)
      setError('Failed to create. Please try again.')
      setLoading(false)
    }
  }

  const handleCreatePractice = async () => {
    if (!sourceType) {
      setError('Please select a source')
      return
    }

    setLoading(true)
    setError('')

    try {
      let sentences = []
      let lessonTitle = `Practice - ${new Date().toLocaleDateString()}`

      if (sourceType === 'text') {
        if (!textContent.trim()) {
          setError('Please enter some text')
          setLoading(false)
          return
        }
        sentences = splitIntoSentences(textContent)
        if (sentences.length === 0) {
          setError('Could not extract sentences from the text')
          setLoading(false)
          return
        }
        lessonTitle = textContent.slice(0, 40).trim() + (textContent.length > 40 ? '...' : '')

        const lessonData = {
          title: lessonTitle,
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
        onCreated(newLesson, 'practice')
      } else if (sourceType === 'youtube') {
        if (!youtubeUrl.trim()) {
          setError('Please enter a YouTube URL')
          setLoading(false)
          return
        }

        // Create lesson immediately with importing status
        lessonTitle = youtubeTitle.trim() || `YouTube Import - ${new Date().toLocaleDateString()}`

        const lessonData = {
          title: lessonTitle,
          sourceLanguage: 'English',
          targetLanguage: activeLanguage,
          adaptationLevel,
          sourceType,
          youtubeUrl: youtubeUrl.trim(),
          status: 'importing',
          sentences: [],
        }

        const newLesson = await createPracticeLesson(user.uid, lessonData)

        // Trigger background import (fire and forget)
        fetch('/api/transcribe/background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: youtubeUrl.trim(),
            lessonId: newLesson.id,
            uid: user.uid,
          }),
        }).catch(err => console.error('Background import trigger failed:', err))

        // Return to dashboard immediately - don't navigate to lesson
        onCreated(newLesson, 'practice', { stayOnDashboard: true })
      }
    } catch (err) {
      console.error('Import error:', err)
      setError(err.message || 'Failed to create practice lesson')
    } finally {
      setLoading(false)
    }
  }

  const canSubmitFree = selectedType && (selectedType !== 'other' || customType.trim())
  const canSubmitPractice = sourceType && (
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
    >
      <div className="modal-content new-writing-modal">
        {/* Header */}
        <div className="modal-header">
          <h2>
            {!mode && 'New Writing'}
            {mode === 'free' && 'Free Writing'}
            {mode === 'practice' && 'Translation Practice'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {/* Step 1: Mode Selection */}
          {!mode && (
            <div className="mode-selection">
              <p className="mode-prompt">What would you like to work on?</p>
              <div className="mode-options">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className="mode-option"
                    onClick={() => setMode(m.id)}
                  >
                    <span className="mode-option-title">{m.title}</span>
                    <span className="mode-option-desc">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2a: Free Writing Options */}
          {mode === 'free' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="text-type">
                  What would you like to write?
                </label>
                <select
                  id="text-type"
                  className="form-input form-select"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Select a type...</option>
                  {TEXT_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                  <option value="other">Other</option>
                </select>
              </div>

              {selectedType === 'other' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="custom-type">
                    Custom type
                  </label>
                  <input
                    id="custom-type"
                    type="text"
                    className="form-input"
                    placeholder="e.g., Letter, Blog Post, Recipe..."
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="piece-title">
                  Title (optional)
                </label>
                <input
                  id="piece-title"
                  type="text"
                  className="form-input"
                  placeholder={selectedType && selectedType !== 'other' ? `Untitled ${TEXT_TYPES.find(t => t.id === selectedType)?.label || ''}` : 'Enter a title...'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* Step 2b: Practice Options */}
          {mode === 'practice' && (
            <>
              <div className="form-group">
                <label className="form-label">Import from</label>
                <div className="text-type-grid two-col">
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
                    placeholder="Paste a paragraph or article..."
                    rows={4}
                    disabled={loading}
                  />
                </div>
              )}

              {sourceType === 'youtube' && (
                <>
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
                  <div className="form-group">
                    <label className="form-label" htmlFor="practice-title">
                      Title
                    </label>
                    <input
                      id="practice-title"
                      type="text"
                      className="form-input"
                      value={youtubeTitle}
                      onChange={(e) => setYoutubeTitle(e.target.value)}
                      placeholder="Enter a title for this practice..."
                      disabled={loading}
                    />
                  </div>
                </>
              )}

              {sourceType && (
                <div className="form-group">
                  <label className="form-label">Difficulty</label>
                  <div className="text-type-grid three-col">
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
            </>
          )}

          {error && <p className="error small">{error}</p>}
        </div>

        {/* Footer */}
        {mode && (
          <div className="modal-footer">
            <button className="button ghost" onClick={handleBack} disabled={loading}>
              Back
            </button>
            <button
              className="button primary"
              onClick={mode === 'free' ? handleCreateFreeWriting : handleCreatePractice}
              disabled={loading || (mode === 'free' ? !canSubmitFree : !canSubmitPractice)}
            >
              {loading ? 'Creating...' : 'Start Writing'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default NewWritingModal
