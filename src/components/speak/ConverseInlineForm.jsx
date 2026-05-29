import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { createWritingChat } from '../../services/writingChat'

const PLACEHOLDERS = [
  'A friend to chat casually with',
  'A recruiter interviewing me for a marketing job',
  'A waiter at a busy restaurant taking my order',
  'Socrates, to question my views',
  'Someone to debate me on climate change',
]

const LEVELS = ['Beginner', 'Intermediate', 'Native']
const GENDERS = ['Female', 'Male']

const STEP_ORDER = ['start', 'persona', 'level', 'gender']

export default function ConverseInlineForm({ activeLanguage }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [starting, setStarting] = useState(false)
  // No history wiring yet, so start straight on the persona step. The
  // New/Recent fork is kept in STEP_ORDER for when conversations are stored.
  const [step, setStep] = useState('persona')
  const [persona, setPersona] = useState('')
  const [level, setLevel] = useState(null)
  const [gender, setGender] = useState(null)
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
    if (idx <= STEP_ORDER.indexOf('gender')) setGender(null)
    setStep(target)
  }

  const handleSelectLevel = (l) => {
    setLevel(l)
    advance('gender')
  }

  const handleSelectGender = async (g) => {
    if (starting) return
    setGender(g)
    setStarting(true)
    const params = {
      persona: persona.trim(),
      level,
      language: activeLanguage,
      voiceGender: g.toLowerCase(),
      feedback: false,
    }
    // Create the thread upfront so the call view can append the call record
    // when it ends. If thread creation fails we still launch the call —
    // anonymous mode is better than a dead end.
    let chatId = null
    try {
      if (user?.uid) {
        const chat = await createWritingChat(user.uid, {
          persona: params.persona,
          level: params.level,
          language: params.language,
          voiceGender: params.voiceGender,
        })
        chatId = chat?.id || null
      }
    } catch (err) {
      console.error('Failed to create speak thread:', err)
    }
    navigate('/converse/call', { state: { ...params, chatId } })
  }

  const breadcrumbs = []
  const completed = STEP_ORDER.indexOf(step)
  if (persona && completed > STEP_ORDER.indexOf('persona')) {
    const label = persona.length > 28 ? persona.slice(0, 28) + '…' : persona
    breadcrumbs.push({ key: 'persona', label })
  }
  if (level && completed > STEP_ORDER.indexOf('level')) {
    breadcrumbs.push({ key: 'level', label: level })
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

    if (step === 'gender') {
      return (
        <>
          <h3 className="genq-heading">Whose voice?</h3>
          <div className="genq-options genq-options--stack">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                className="genq-option"
                onClick={() => handleSelectGender(g)}
              >
                <span className="genq-option-label">{g}</span>
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
