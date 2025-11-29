import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ImportTextPage = () => {
  const navigate = useNavigate()
  const { language } = useParams()
  const { user } = useAuth()

  const [file, setFile] = useState(null)
  const [originalLanguage, setOriginalLanguage] = useState('')
  const [translationMode, setTranslationMode] = useState('literal')
  const [level, setLevel] = useState('A1')
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [isPublicDomain, setIsPublicDomain] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    setSubmitting(true)

    if (!file || !originalLanguage || !title || (translationMode === 'graded' && !level)) {
      alert('Please fill in all required fields')
      setSubmitting(false)
      return
    }

    console.log({
      fileName: file?.name,
      originalLanguage,
      outputLanguage: language,
      translationMode,
      level: translationMode === 'graded' ? level : null,
      author,
      title,
      isPublicDomain,
      userId: user?.uid,
    })

    alert('Import request captured (backend to be implemented).')
    setSubmitting(false)
  }

  const isSubmitDisabled =
    !file ||
    !originalLanguage ||
    !title ||
    (translationMode === 'graded' && !level) ||
    submitting

  return (
    <div className="page">
      <div className="card">
        <div className="page-header">
          <div>
            <h1>Import a Book</h1>
            <p className="muted small">Upload a text file and provide details for translation.</p>
          </div>
          <button className="button ghost" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Upload file
            <input
              type="file"
              accept=".txt,.pdf,.epub"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <p className="muted small">Accepted formats: .txt, .pdf, .epub</p>
          </label>

          <label>
            Original language
            <input
              type="text"
              value={originalLanguage}
              onChange={(event) => setOriginalLanguage(event.target.value)}
              placeholder="e.g., Spanish"
            />
          </label>

          <label>
            Output language
            <input type="text" value={language || ''} disabled />
            <p className="muted small">Language is set by your selection and cannot be changed here.</p>
          </label>

          <fieldset className="radio-group">
            <legend>Translation mode</legend>
            <label className="inline">
              <input
                type="radio"
                name="translationMode"
                value="literal"
                checked={translationMode === 'literal'}
                onChange={(event) => setTranslationMode(event.target.value)}
              />
              Literal translation
            </label>
            <label className="inline">
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
            <label>
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

          <label>
            Author
            <input
              type="text"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Author name"
            />
          </label>

          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Book title"
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={isPublicDomain}
              onChange={(event) => setIsPublicDomain(event.target.checked)}
            />
            <span>This is a public domain text</span>
          </label>

          <button type="submit" className="button primary" disabled={isSubmitDisabled}>
            {submitting ? 'Submitting...' : 'Import book'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ImportTextPage
