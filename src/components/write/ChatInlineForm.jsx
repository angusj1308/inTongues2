import { useEffect, useRef, useState } from 'react'

const PLACEHOLDERS = [
  'A friend to chat casually with',
  'A recruiter interviewing me for a marketing job',
  'A waiter at a busy restaurant taking my order',
  'Socrates, to question my views',
  'Someone to debate me on climate change',
]

const STEP_ORDER = ['persona']

export default function ChatInlineForm({ activeLanguage }) {
  const [step, setStep] = useState('persona')
  const [persona, setPersona] = useState('')
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

  const handleSubmit = () => {
    if (!persona.trim()) return
    // TODO: navigate to chat with persona
  }

  const breadcrumbs = []

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
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
              }}
              rows={3}
            />
            <button
              type="button"
              className="genq-continue-link"
              onClick={handleSubmit}
              disabled={!persona.trim()}
            >
              Continue <span aria-hidden="true">→</span>
            </button>
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
            onClick={() => setStep(b.key)}
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
