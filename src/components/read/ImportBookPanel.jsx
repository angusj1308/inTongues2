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
      <div className="page-header">
        <div className="page-header-title">
          <HeadingTag className="text-center">Import a Book</HeadingTag>
          <p className="muted small text-center ui-text">
            Import any book and get a full adaptation in your target language at your level.
          </p>
        </div>
        {onClose && (
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      {!activeLanguage ? (
        <p className="muted small ui-text">Select a language to import a book.</p>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <label className="ui-text">
            Upload file
            <input
              type="file"
              accept=".txt,.pdf,.epub"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <p className="muted small ui-text">Accepted formats: .txt, .pdf, .epub</p>
          </label>

          <label className="ui-text">
            Original language
            <input
              type="text"
              value={originalLanguage}
              onChange={(event) => setOriginalLanguage(event.target.value)}
              placeholder="e.g., Spanish"
            />
          </label>

          <label className="ui-text">
            Adapt to your level
            <div className="slider-row">
              <input
                type="range"
                min="0"
                max={LEVELS.length - 1}
                value={levelIndex}
                onChange={(event) => setLevelIndex(Number(event.target.value))}
                style={{ '--range-progress': `${(levelIndex / (LEVELS.length - 1)) * 100}%` }}
              />
            </div>
            <div className="slider-marks">
              {LEVELS.map((level, index) => (
                <span
                  key={level}
                  className={`slider-mark${levelIndex === index ? ' active' : ''}`}
                >
                  {level}
                </span>
              ))}
            </div>
          </label>

          <label className="ui-text">
            Author
            <input
              type="text"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Author name"
            />
          </label>

          <label className="ui-text">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Book title"
            />
          </label>

          <label className="ui-text">
            Voice gender
            <div className="voice-gender-toggle" role="radiogroup" aria-label="Voice gender">
              <button
                className={`voice-gender-option${voiceGender === 'male' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setVoiceGender('male')}
                aria-pressed={voiceGender === 'male'}
              >
                Male
              </button>
              <button
                className={`voice-gender-option${voiceGender === 'female' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setVoiceGender('female')}
                aria-pressed={voiceGender === 'female'}
              >
                Female
              </button>
            </div>
          </label>

          <label className="checkbox ui-text public-domain-checkbox">
            <span className="ui-text">This is a public domain text</span>
            <input
              type="checkbox"
              checked={isPublicDomain}
              onChange={(event) => setIsPublicDomain(event.target.checked)}
            />
          </label>

          <label className="checkbox ui-text">
            <span className="ui-text">Generate audio</span>
            <input
              type="checkbox"
              checked={generateAudio}
              onChange={(event) => setGenerateAudio(event.target.checked)}
            />
            <p className="muted small ui-text">Audio generation is optional and may take some time</p>
          </label>

          <div className="action-row">
            {(onBack || onClose) && (
              <button className="button ghost" type="button" onClick={onClose || onBack}>
                Cancel
              </button>
            )}
            <button type="submit" className="button primary" disabled={isSubmitDisabled}>
              {submitting ? 'Submitting...' : 'Import book'}
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
