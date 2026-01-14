import { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const LEVELS = ['Beginner', 'Intermediate', 'Native']

const ImportBookPanel = ({
  activeLanguage = '',
  onBack,
  onClose,
  headingLevel = 'h2',
  isModal = false,
}) => {
  const { user } = useAuth()
  const [file, setFile] = useState(null)
  const [originalLanguage, setOriginalLanguage] = useState('')
  const [levelIndex, setLevelIndex] = useState(0)
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [voiceGender, setVoiceGender] = useState('male')
  const [isPublicDomain, setIsPublicDomain] = useState(false)
  const [generateAudio, setGenerateAudio] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const HeadingTag = useMemo(() => headingLevel || 'h2', [headingLevel])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)

    if (!file || !originalLanguage || !title || !activeLanguage) {
      alert('Please fill in all required fields')
      setSubmitting(false)
      return
    }

    const selectedLevel = LEVELS[levelIndex] || 'Beginner'

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('originalLanguage', originalLanguage)
      formData.append('outputLanguage', activeLanguage)
      formData.append('translationMode', 'graded')
      formData.append('level', selectedLevel)
      formData.append('author', author)
      formData.append('title', title)
      formData.append('isPublicDomain', isPublicDomain ? 'true' : 'false')
      formData.append('userId', user?.uid || '')
      formData.append('voiceGender', voiceGender)
      formData.append('generateAudio', generateAudio ? 'true' : 'false')

      const response = await fetch('http://localhost:4000/api/import-upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        try {
          const data = await response.json()

          // Specific handling for scanned PDFs
          if (data?.error === 'SCANNED_PDF_NOT_SUPPORTED') {
            alert(data.message)
            return
          }

          // Generic JSON error message fallback
          if (data?.message) {
            alert('Upload failed: ' + data.message)
            return
          }

          // If JSON has no useful message, fall back to text
          const fallbackText = await response.text()
          alert('Upload failed: ' + fallbackText)
          return
        } catch (e) {
          // If JSON parsing fails, fall back to original behaviour
          const fallbackText = await response.text()
          alert('Upload failed: ' + fallbackText)
          return
        }
      }

      await response.json()
      alert('Import started successfully.')
      if (onClose) {
        onClose()
      }
    } catch (error) {
      console.error('Failed to submit import request', error)
      alert('Upload failed. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  const isSubmitDisabled =
    !file || !originalLanguage || !title || submitting || !activeLanguage

  const panelContent = (
    <>
      <div className="import-modal-header">
        <HeadingTag className="import-modal-title">Import</HeadingTag>
        <p className="import-modal-subtitle">
          Import a book and get a full adaptation in your target language.
        </p>
        {onClose && (
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      {!activeLanguage ? (
        <p className="muted small ui-text">Select a language to import a book.</p>
      ) : (
        <form className="import-form" onSubmit={handleSubmit}>
          <div className="import-form-section">
            <label className="import-label">
              <span className="import-label-text">Book file</span>
              <div className="import-file-input">
                <input
                  type="file"
                  accept=".txt,.pdf,.epub"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </div>
              <span className="import-hint">.txt, .pdf, or .epub</span>
            </label>
          </div>

          <div className="import-form-row">
            <label className="import-label">
              <span className="import-label-text">Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Book title"
                className="import-input"
              />
            </label>
            <label className="import-label">
              <span className="import-label-text">Author</span>
              <input
                type="text"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Author name"
                className="import-input"
              />
            </label>
          </div>

          <div className="import-form-section">
            <label className="import-label">
              <span className="import-label-text">Original language</span>
              <input
                type="text"
                value={originalLanguage}
                onChange={(event) => setOriginalLanguage(event.target.value)}
                placeholder="e.g., English"
                className="import-input"
              />
            </label>
          </div>

          <div className="import-form-section">
            <span className="import-label-text">Adaptation level</span>
            <div className="import-level-options">
              {LEVELS.map((level, index) => (
                <button
                  key={level}
                  type="button"
                  className={`import-level-option${levelIndex === index ? ' is-active' : ''}`}
                  onClick={() => setLevelIndex(index)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="import-form-section">
            <span className="import-label-text">Voice</span>
            <div className="import-voice-options">
              <button
                className={`import-voice-option${voiceGender === 'male' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setVoiceGender('male')}
              >
                Male
              </button>
              <button
                className={`import-voice-option${voiceGender === 'female' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setVoiceGender('female')}
              >
                Female
              </button>
            </div>
          </div>

          <div className="import-form-section import-checkboxes">
            <label className="import-checkbox-label">
              <input
                type="checkbox"
                checked={isPublicDomain}
                onChange={(event) => setIsPublicDomain(event.target.checked)}
              />
              <span>Public domain text</span>
            </label>
            <label className="import-checkbox-label">
              <input
                type="checkbox"
                checked={generateAudio}
                onChange={(event) => setGenerateAudio(event.target.checked)}
              />
              <span>Generate audio</span>
            </label>
          </div>

          <div className="import-actions">
            {(onBack || onClose) && (
              <button className="import-btn-secondary" type="button" onClick={onClose || onBack}>
                Cancel
              </button>
            )}
            <button type="submit" className="import-btn-primary" disabled={isSubmitDisabled}>
              {submitting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      )}
    </>
  )

  if (isModal) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container import-book-modal" onClick={(e) => e.stopPropagation()}>
          {panelContent}
        </div>
      </div>
    )
  }

  return <div className="import-book-panel">{panelContent}</div>
}

export default ImportBookPanel
