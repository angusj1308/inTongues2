import { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const ImportBookPanel = ({ activeLanguage = '', onBack, headingLevel = 'h2' }) => {
  const { user } = useAuth()
  const [file, setFile] = useState(null)
  const [originalLanguage, setOriginalLanguage] = useState('')
  const [translationMode, setTranslationMode] = useState('literal')
  const [level, setLevel] = useState('A1')
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [isPublicDomain, setIsPublicDomain] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!activeLanguage) {
    return (
      <div className="import-book-panel">
        <p className="muted small ui-text">Select a language to import a book.</p>
      </div>
    )
  }

  const HeadingTag = useMemo(() => headingLevel || 'h2', [headingLevel])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)

    if (
      !file ||
      !originalLanguage ||
      !title ||
      (translationMode === 'graded' && !level) ||
      !activeLanguage
    ) {
      alert('Please fill in all required fields')
      setSubmitting(false)
      return
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('originalLanguage', originalLanguage)
      formData.append('outputLanguage', activeLanguage)
      formData.append('translationMode', translationMode)
      if (translationMode === 'graded') {
        formData.append('level', level)
      }
      formData.append('author', author)
      formData.append('title', title)
      formData.append('isPublicDomain', isPublicDomain ? 'true' : 'false')
      formData.append('userId', user?.uid || '')

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
    } catch (error) {
      console.error('Failed to submit import request', error)
      alert('Upload failed. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  const isSubmitDisabled =
    !file ||
    !originalLanguage ||
    !title ||
    (translationMode === 'graded' && !level) ||
    submitting ||
    !activeLanguage

  return (
    <div className="import-book-panel">
      <div className="page-header">
        <div className="page-header-title">
          <HeadingTag className="text-center">Import a Book</HeadingTag>
          <p className="muted small text-center ui-text">
            Import any book and get a full adaptation in your target language at your level.
          </p>
        </div>
        {onBack && (
          <button className="button ghost" type="button" onClick={onBack}>
            Back
          </button>
        )}
      </div>

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

        <fieldset className="radio-group">
          <legend className="ui-text">Translation mode</legend>
          <label className="inline ui-text">
            <input
              type="radio"
              name="translationMode"
              value="literal"
              checked={translationMode === 'literal'}
              onChange={(event) => setTranslationMode(event.target.value)}
            />
            Literal translation
          </label>
          <label className="inline ui-text">
            <input
              type="radio"
              name="translationMode"
              value="graded"
              checked={translationMode === 'graded'}
              onChange={(event) => setTranslationMode(event.target.value)}
            />
            Simplified graded reader
          </label>
        </fieldset>

        {translationMode === 'graded' && (
          <label className="ui-text">
            Level
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
            </select>
          </label>
        )}

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

        <label className="checkbox ui-text">
          <input
            type="checkbox"
            checked={isPublicDomain}
            onChange={(event) => setIsPublicDomain(event.target.checked)}
          />
          <span className="ui-text">This is a public domain text</span>
        </label>

        <button type="submit" className="button primary" disabled={isSubmitDisabled}>
          {submitting ? 'Submitting...' : 'Import book'}
        </button>
      </form>
    </div>
  )
}

export default ImportBookPanel
