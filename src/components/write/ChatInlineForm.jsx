import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PLACEHOLDERS = [
  'A friend to chat casually with',
  'A recruiter interviewing me for a marketing job',
  'A waiter at a busy restaurant taking my order',
  'Socrates, to question my views',
  'Someone to debate me on climate change',
]

const LEVELS = ['Beginner', 'Intermediate', 'Native']

const STEP_ORDER = ['persona', 'level']

export default function ChatInlineForm({ activeLanguage }) {
  const navigate = useNavigate()
  const [step, setStep] = useState('persona')
  const [persona, setPersona] = useState('')
  const [level, setLevel] = useState(null)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [stepDirection, setStepDirection] = useState('')
  const inputRef = useRef(null)
  const prevStepRef = useRef(step)

  useEffect(() => {
    const prev = STEP_ORDER.indexOf(prevStepRef.current)
    const curr = STEP_ORDER.indexOf(step)
    setStepDirection(curr > prev ? 'right' : curr < prev ? 'left' : '')
    prevStepRef.current = step
  }, [step])

  useEffect(() => {
    if (step === 'persona' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [step])

  useEffect(() => {
    if (persona) return
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [persona])

  const advance = (next) => setStep(next)

  const resetFrom = (target) => {
    const idx = STEP_ORDER.indexOf(target)
    if (idx < 0) return
    if (idx <= STEP_ORDER.indexOf('level')) setLevel(null)
    setStep(target)
  }

  const handleSelectLevel = (l) => {
    setLevel(l)
    navigate('/write/chat', {
      state: { persona: persona.trim(), level: l, language: activeLanguage },
    })
  }

  const breadcrumbs = []
  const completed = STEP_ORDER.indexOf(step)
  if (persona && completed > STEP_ORDER.indexOf('persona')) {
    const label = persona.length > 28 ? persona.slice(0, 28) + '…' : persona
    breadcrumbs.push({ key: 'persona', label })
  }

  const renderStep = () => {
    if (step === 'persona') {
      return (
        <>
          <h3 className="genq-heading">Who do you want to talk to?</h3>
          <div className="genq-setting-form">
            <textarea
              ref={inputRef}
              className="genq-textarea"
              placeholder={PLACEHOLDERS[placeholderIndex]}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && persona.trim()) {
                  advance('level')
                }
              }}
              rows={3}
            />
            <button
              type="button"
              className="genq-continue-link"
              onClick={() => persona.trim() && advance('level')}
              disabled={!persona.trim()}
            >
              Continue <span aria-hidden="true">→</span>
            </button>
          </div>
        </>
      )
    }

    if (step === 'level') {
      return (
        <>
          <h3 className="genq-heading">What's your level?</h3>
          <div className="genq-options genq-options--stack">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                className="genq-option"
                onClick={() => handleSelectLevel(l)}
              >
                <span className="genq-option-label">{l}</span>
              </button>
            ))}
          </div>
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
