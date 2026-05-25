import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { TEXT_TYPES } from '../../services/writing'
import { createFreeWritingLesson } from '../../services/freewriting'

export default function FreeWriteInlineForm({ activeLanguage }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [selectedType, setSelectedType] = useState('')
  const [customType, setCustomType] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('type')
  const [stepDirection, setStepDirection] = useState('')

  const allTypes = [...TEXT_TYPES, { id: 'other', label: 'Other' }]

  const goTo = (next) => {
    const order = ['type', 'title']
    const ci = order.indexOf(step)
    const ni = order.indexOf(next)
    setStepDirection(ni > ci ? 'right' : 'left')
    setStep(next)
  }

  const handleSelectType = (id) => {
    setSelectedType(id)
    if (id !== 'other') {
      goTo('title')
    }
  }

  const handleCreate = async () => {
    if (!selectedType) return
    if (selectedType === 'other' && !customType.trim()) {
      setError('Please enter a custom type')
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
      navigate(`/freewrite/${newLesson.id}`)
    } catch (err) {
      console.error('Failed to create free writing:', err)
      setError('Failed to create. Please try again.')
      setLoading(false)
    }
  }

  const breadcrumbs = [{ key: 'type', label: 'Free Write' }]
  if (step === 'title' || selectedType) {
    const match = TEXT_TYPES.find((t) => t.id === selectedType)
    breadcrumbs.push({ key: 'title', label: match?.label || customType || 'Type' })
  }

  const renderStep = () => {
    if (step === 'type') {
      return (
        <>
          <h3 className="genq-heading">What would you like to write?</h3>
          <div className="genq-options genq-options--grid">
            {allTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                className="genq-option"
                onClick={() => handleSelectType(t.id)}
              >
                <span className="genq-option-label">{t.label}</span>
              </button>
            ))}
          </div>
          {selectedType === 'other' && (
            <div style={{ marginTop: 12 }}>
              <input
                type="text"
                className="genq-line-input"
                placeholder="e.g., Letter, Blog Post, Recipe..."
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && customType.trim() && goTo('title')}
                autoFocus
              />
              <button
                type="button"
                className="genq-option"
                style={{ marginTop: 8, width: '100%' }}
                onClick={() => customType.trim() && goTo('title')}
                disabled={!customType.trim()}
              >
                <span className="genq-option-label">Continue</span>
              </button>
            </div>
          )}
        </>
      )
    }

    if (step === 'title') {
      const typeLabel = TEXT_TYPES.find((t) => t.id === selectedType)?.label || customType || selectedType
      return (
        <>
          <h3 className="genq-heading">Title</h3>
          <input
            type="text"
            className="genq-line-input"
            placeholder={`Untitled ${typeLabel}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            disabled={loading}
            autoFocus
          />
          {error && <p className="genq-error">{error}</p>}
          <button
            type="button"
            className="genq-option"
            style={{ marginTop: 12, width: '100%' }}
            onClick={handleCreate}
            disabled={loading}
          >
            <span className="genq-option-label">{loading ? 'Creating...' : 'Start Writing'}</span>
          </button>
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
