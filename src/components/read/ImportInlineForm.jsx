import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const LEVELS = ['Beginner', 'Intermediate', 'Native']

const AUDIO_OPTIONS = [
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text only' },
]

const VOICE_OPTIONS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
]

const PUBLIC_DOMAIN_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
]

const STEP_ORDER = [
  'file',
  'title',
  'author',
  'language',
  'level',
  'audio',
  'voice',
  'publicDomain',
  'confirm',
]

export default function ImportInlineForm({ activeLanguage }) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [step, setStep] = useState('file')
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [originalLanguage, setOriginalLanguage] = useState('')
  const [level, setLevel] = useState('Beginner')
  const [audio, setAudio] = useState(null) // 'audio' | 'text'
  const [voice, setVoice] = useState(null) // 'female' | 'male'
  const [isPublicDomain, setIsPublicDomain] = useState(null) // 'yes' | 'no'

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef(null)
  const titleInputRef = useRef(null)
  const authorInputRef = useRef(null)
  const languageInputRef = useRef(null)
  const prevStepRef = useRef(step)
  const [stepDirection, setStepDirection] = useState('')

  useEffect(() => {
    const prev = prevStepRef.current
    if (prev !== step) {
      const prevIdx = STEP_ORDER.indexOf(prev)
      const nextIdx = STEP_ORDER.indexOf(step)
      if (prevIdx >= 0 && nextIdx >= 0) {
        setStepDirection(nextIdx > prevIdx ? 'right' : 'left')
      }
      prevStepRef.current = step
    }
    if (step === 'title' && titleInputRef.current) titleInputRef.current.focus()
    if (step === 'author' && authorInputRef.current) authorInputRef.current.focus()
    if (step === 'language' && languageInputRef.current) languageInputRef.current.focus()
  }, [step])

  const advance = (next) => setStep(next)

  const resetFrom = (target) => {
    const idx = STEP_ORDER.indexOf(target)
    if (idx < 0) return
    if (idx <= STEP_ORDER.indexOf('file')) setFile(null)
    if (idx <= STEP_ORDER.indexOf('title')) setTitle('')
    if (idx <= STEP_ORDER.indexOf('author')) setAuthor('')
    if (idx <= STEP_ORDER.indexOf('language')) setOriginalLanguage('')
    if (idx <= STEP_ORDER.indexOf('level')) setLevel('Beginner')
    if (idx <= STEP_ORDER.indexOf('audio')) setAudio(null)
    if (idx <= STEP_ORDER.indexOf('voice')) setVoice(null)
    if (idx <= STEP_ORDER.indexOf('publicDomain')) setIsPublicDomain(null)
    setStep(target)
  }

  const acceptFile = (picked) => {
    if (!picked) return
    const name = picked.name?.toLowerCase() || ''
    const ok = ['.txt', '.pdf', '.epub'].some((ext) => name.endsWith(ext))
    if (!ok) return
    setFile(picked)
    advance('title')
  }

  const handleFilePick = (event) => {
    acceptFile(event.target.files?.[0] || null)
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    acceptFile(event.dataTransfer.files?.[0] || null)
  }

  const handleLevelPick = (value) => {
    setLevel(value)
    advance('audio')
  }

  const handleAudioPick = (value) => {
    setAudio(value)
    if (value === 'text') {
      setVoice(null)
      advance('publicDomain')
    } else {
      advance('voice')
    }
  }

  const handleVoicePick = (value) => {
    setVoice(value)
    advance('publicDomain')
  }

  const handlePublicDomainPick = (value) => {
    setIsPublicDomain(value)
    advance('confirm')
  }

  const handleSubmit = async () => {
    if (!file || !originalLanguage.trim() || !title.trim() || !activeLanguage || submitting) return
    setError('')
    setSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('originalLanguage', originalLanguage.trim())
      formData.append('outputLanguage', activeLanguage)
      formData.append('translationMode', 'graded')
      formData.append('level', level)
      formData.append('author', author.trim())
      formData.append('title', title.trim())
      formData.append('isPublicDomain', isPublicDomain === 'yes' ? 'true' : 'false')
      formData.append('userId', user?.uid || '')
      formData.append('voiceGender', voice || 'male')
      formData.append('generateAudio', audio === 'audio' ? 'true' : 'false')

      const response = await fetch('http://localhost:4000/api/import-upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        try {
          const data = await response.json()
          if (data?.error === 'SCANNED_PDF_NOT_SUPPORTED') {
            setError(data.message)
            return
          }
          if (data?.message) {
            setError('Upload failed: ' + data.message)
            return
          }
          const fallbackText = await response.text()
          setError('Upload failed: ' + fallbackText)
          return
        } catch (e) {
          const fallbackText = await response.text()
          setError('Upload failed: ' + fallbackText)
          return
        }
      }

      await response.json()
      navigate('/read/library')
    } catch (err) {
      console.error('Failed to submit import request', err)
      setError('Upload failed. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  const completed = STEP_ORDER.indexOf(step)
  const credits = 5 + (audio === 'audio' ? 2 : 0)
  const breadcrumbs = []
  if (file && completed > STEP_ORDER.indexOf('file')) {
    const name = file.name
    const display = name.length > 22 ? `${name.slice(0, 20)}…` : name
    breadcrumbs.push({ key: 'file', label: display })
  }
  if (title.trim() && completed > STEP_ORDER.indexOf('title')) {
    const display = title.length > 22 ? `${title.slice(0, 20)}…` : title
    breadcrumbs.push({ key: 'title', label: display })
  }
  if (completed > STEP_ORDER.indexOf('author')) {
    breadcrumbs.push({ key: 'author', label: author.trim() || '—' })
  }
  if (originalLanguage.trim() && completed > STEP_ORDER.indexOf('language')) {
    breadcrumbs.push({ key: 'language', label: originalLanguage.trim() })
  }
  if (completed > STEP_ORDER.indexOf('level')) {
    breadcrumbs.push({ key: 'level', label: level })
  }
  if (audio && completed > STEP_ORDER.indexOf('audio')) {
    breadcrumbs.push({ key: 'audio', label: audio === 'audio' ? 'Audio' : 'Text only' })
  }
  if (voice && completed > STEP_ORDER.indexOf('voice')) {
    breadcrumbs.push({ key: 'voice', label: voice === 'female' ? 'Female' : 'Male' })
  }
  if (isPublicDomain && completed > STEP_ORDER.indexOf('publicDomain')) {
    breadcrumbs.push({
      key: 'publicDomain',
      label: isPublicDomain === 'yes' ? 'Public domain' : 'Not public',
    })
  }

  const renderInputStep = ({ heading, value, onChange, placeholder, inputRef, nextStep, allowEmpty = false }) => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (allowEmpty || value.trim()) advance(nextStep)
      }
    }
    return (
      <>
        <h3 className="genq-heading">{heading}</h3>
        <div className="genq-setting-form">
          <input
            ref={inputRef}
            type="text"
            className="genq-line-input"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="genq-continue-link"
            onClick={() => (allowEmpty || value.trim()) && advance(nextStep)}
            disabled={!allowEmpty && !value.trim()}
          >
            Continue <span aria-hidden="true">→</span>
          </button>
        </div>
      </>
    )
  }

  const renderStep = () => {
    if (step === 'file') {
      return (
        <>
          <h3 className="genq-heading">Pick a book file</h3>
          <div className="genq-setting-form">
            <button
              type="button"
              className={`genq-file-dropzone${isDragging ? ' is-dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="genq-file-dropzone-primary">
                {file ? file.name : 'Choose a file or drop one here'}
              </span>
              {!file && (
                <>
                  <span className="genq-file-dropzone-secondary">
                    .txt, .pdf, or .epub
                  </span>
                  <span className="genq-file-dropzone-note">
                    Scanned PDFs aren’t supported (quality and copyright reasons).
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf,.epub"
              onChange={handleFilePick}
              style={{ display: 'none' }}
            />
          </div>
        </>
      )
    }
    if (step === 'title') {
      return renderInputStep({
        heading: 'Book title',
        value: title,
        onChange: setTitle,
        placeholder: 'e.g. The Great Gatsby',
        inputRef: titleInputRef,
        nextStep: 'author',
      })
    }
    if (step === 'author') {
      return renderInputStep({
        heading: 'Who wrote it?',
        value: author,
        onChange: setAuthor,
        placeholder: 'Author name (optional)',
        inputRef: authorInputRef,
        nextStep: 'language',
        allowEmpty: true,
      })
    }
    if (step === 'language') {
      return renderInputStep({
        heading: 'What language is it in?',
        value: originalLanguage,
        onChange: setOriginalLanguage,
        placeholder: 'e.g. English',
        inputRef: languageInputRef,
        nextStep: 'level',
      })
    }
    if (step === 'level') {
      return (
        <>
          <h3 className="genq-heading">Adaptation level</h3>
          <div className="genq-options genq-options--stack">
            {LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                className="genq-option"
                onClick={() => handleLevelPick(value)}
              >
                <span className="genq-option-label">{value}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'audio') {
      return (
        <>
          <h3 className="genq-heading">Audio narration?</h3>
          <div className="genq-options genq-options--stack">
            {AUDIO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="genq-option"
                onClick={() => handleAudioPick(opt.id)}
              >
                <span className="genq-option-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'voice') {
      return (
        <>
          <h3 className="genq-heading">Whose voice?</h3>
          <div className="genq-options genq-options--stack">
            {VOICE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="genq-option"
                onClick={() => handleVoicePick(opt.id)}
              >
                <span className="genq-option-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'publicDomain') {
      return (
        <>
          <h3 className="genq-heading">Is this in the public domain?</h3>
          <div className="genq-options genq-options--stack">
            {PUBLIC_DOMAIN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="genq-option"
                onClick={() => handlePublicDomainPick(opt.id)}
              >
                <span className="genq-option-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'confirm') {
      const audioPhrase = audio === 'audio' && voice ? `, with ${voice} narration` : ''
      const pdPhrase = isPublicDomain === 'yes' ? ', public domain' : ''
      const authorPhrase = author.trim() ? ` by ${author.trim()}` : ''
      return (
        <>
          <h3 className="genq-heading">Ready to import?</h3>
          <p className="genq-summary">
            <span className="genq-summary-key">{title.trim()}</span>{authorPhrase}
            {', from '}
            <span className="genq-summary-key">{originalLanguage.trim()}</span>
            {' adapted to '}
            <span className="genq-summary-key">{level.toLowerCase()}</span> level
            {audioPhrase}
            {pdPhrase}
            .
          </p>
          <div className="genq-spacer" />
          <div className="genq-action-row">
            <div className="genq-cost">
              <span className="genq-cost-label">Cost</span>
              <span className="genq-cost-value">{credits} credits</span>
            </div>
            <button
              type="button"
              className="genq-generate"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Importing…' : 'Import →'}
            </button>
          </div>
          {error && <p className="genq-error">{error}</p>}
        </>
      )
    }
    return null
  }

  return (
    <div className="genq-card">
      <div className="genq-breadcrumbs" aria-label="Progress">
        {breadcrumbs.map((b) => (
          <button
            key={b.key}
            type="button"
            className="genq-breadcrumb"
            onClick={() => resetFrom(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="genq-body">
        <div
          key={step}
          className={`genq-step ${
            stepDirection === 'right'
              ? 'slide-in-right'
              : stepDirection === 'left'
                ? 'slide-in-left'
                : ''
          }`}
        >
          {renderStep()}
        </div>
      </div>
    </div>
  )
}
