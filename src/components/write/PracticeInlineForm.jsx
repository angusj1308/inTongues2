import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ADAPTATION_LEVELS, createPracticeLesson, splitIntoSentences } from '../../services/practice'

const SOURCE_OPTIONS = [
  { id: 'text', label: 'Paste Text' },
  { id: 'youtube', label: 'YouTube Video' },
]

export default function PracticeInlineForm({ activeLanguage }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sourceType, setSourceType] = useState('')
  const [adaptationLevel, setAdaptationLevel] = useState('native')
  const [textContent, setTextContent] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeTitle, setYoutubeTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('source')
  const [stepDirection, setStepDirection] = useState('')

  const goTo = (next) => {
    const order = ['source', 'content', 'level']
    const ci = order.indexOf(step)
    const ni = order.indexOf(next)
    setStepDirection(ni > ci ? 'right' : 'left')
    setStep(next)
  }

  const handleSelectSource = (id) => {
    setSourceType(id)
    goTo('content')
  }

  const handleCreate = async () => {
    setLoading(true)
    setError('')

    try {
      if (sourceType === 'text') {
        if (!textContent.trim()) {
          setError('Please enter some text')
          setLoading(false)
          return
        }
        const sentences = splitIntoSentences(textContent)
        if (sentences.length === 0) {
          setError('Could not extract sentences from the text')
          setLoading(false)
          return
        }
        const lessonTitle = textContent.slice(0, 40).trim() + (textContent.length > 40 ? '...' : '')
        const newLesson = await createPracticeLesson(user.uid, {
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
        })
        navigate(`/practice/${newLesson.id}`)
      } else if (sourceType === 'youtube') {
        if (!youtubeUrl.trim()) {
          setError('Please enter a YouTube URL')
          setLoading(false)
          return
        }
        const lessonTitle = youtubeTitle.trim() || `YouTube Import - ${new Date().toLocaleDateString()}`
        const newLesson = await createPracticeLesson(user.uid, {
          title: lessonTitle,
          sourceLanguage: 'English',
          targetLanguage: activeLanguage,
          adaptationLevel,
          sourceType,
          youtubeUrl: youtubeUrl.trim(),
          status: 'importing',
          sentences: [],
        })
        fetch('/api/transcribe/background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: youtubeUrl.trim(),
            lessonId: newLesson.id,
            uid: user.uid,
          }),
        }).catch(err => console.error('Background import trigger failed:', err))
        navigate('/dashboard', { state: { initialTab: 'write' } })
      }
    } catch (err) {
      console.error('Import error:', err)
      setError(err.message || 'Failed to create practice lesson')
    } finally {
      setLoading(false)
    }
  }

  const breadcrumbs = [{ key: 'source', label: 'Practice' }]
  if (sourceType) {
    const srcLabel = SOURCE_OPTIONS.find((s) => s.id === sourceType)?.label || sourceType
    breadcrumbs.push({ key: 'content', label: srcLabel })
  }
  if (step === 'level') {
    breadcrumbs.push({ key: 'level', label: 'Difficulty' })
  }

  const renderStep = () => {
    if (step === 'source') {
      return (
        <>
          <h3 className="genq-heading">Import from</h3>
          <div className="genq-options genq-options--stack">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="genq-option"
                onClick={() => handleSelectSource(opt.id)}
              >
                <span className="genq-option-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )
    }

    if (step === 'content') {
      return (
        <>
          {sourceType === 'text' ? (
            <>
              <h3 className="genq-heading">Paste your English text</h3>
              <textarea
                className="genq-textarea"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste a paragraph or article..."
                rows={4}
                disabled={loading}
                autoFocus
              />
            </>
          ) : (
            <>
              <h3 className="genq-heading">YouTube URL</h3>
              <input
                type="url"
                className="genq-line-input"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                disabled={loading}
                autoFocus
              />
              <input
                type="text"
                className="genq-line-input"
                style={{ marginTop: 8 }}
                value={youtubeTitle}
                onChange={(e) => setYoutubeTitle(e.target.value)}
                placeholder="Title (optional)"
                disabled={loading}
              />
            </>
          )}
          <button
            type="button"
            className="genq-option"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => goTo('level')}
            disabled={sourceType === 'text' ? !textContent.trim() : !youtubeUrl.trim()}
          >
            <span className="genq-option-label">Next</span>
          </button>
        </>
      )
    }

    if (step === 'level') {
      return (
        <>
          <h3 className="genq-heading">Difficulty</h3>
          <div className="genq-options genq-options--stack">
            {ADAPTATION_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                className={`genq-option${adaptationLevel === level.id ? ' is-selected' : ''}`}
                onClick={() => {
                  setAdaptationLevel(level.id)
                  handleCreate()
                }}
                disabled={loading}
              >
                <span className="genq-option-label">{level.label}</span>
              </button>
            ))}
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
            onClick={() => goTo(b.key)}
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
