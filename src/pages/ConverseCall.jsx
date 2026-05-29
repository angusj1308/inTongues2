import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { startConverseCall, saveConverseRecording } from '../services/converseAgent'
import Orb from '../components/speak/converse/Orb'

const SunIcon = () => (
  <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const MoonIcon = () => (
  <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const ConverseCall = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
  const params = location.state || {}
  const persona = params.persona
  const level = params.level
  const language = params.language
  const voiceGender = params.voiceGender || 'female'
  const initialFeedback = params.feedback === true
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')

  const [callState, setCallState] = useState('connecting') // connecting|idle|learner-speaking|agent-thinking|agent-speaking|ending|error
  const [errorMessage, setErrorMessage] = useState('')
  const [feedback, setFeedback] = useState(initialFeedback)
  const [durationSec, setDurationSec] = useState(0)
  const [amplitude, setAmplitude] = useState(0)

  const conversationRef = useRef(null)
  const conversationIdRef = useRef(null)
  const startedAtRef = useRef(null)
  const ampRafRef = useRef(null)
  const isEndingRef = useRef(false)
  const restartingRef = useRef(false)

  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    try { localStorage.setItem('darkMode', JSON.stringify(darkMode)) } catch {}
  }, [darkMode])

  // Pull RMS amplitude from the SDK's input (learner) or output (agent)
  // analyser depending on who is talking. Drives the orb's reactive pulse.
  useEffect(() => {
    let cancelled = false

    const tick = () => {
      const c = conversationRef.current
      if (!cancelled && c && (callState === 'learner-speaking' || callState === 'agent-speaking')) {
        try {
          const getter = callState === 'learner-speaking'
            ? c.getInputByteFrequencyData
            : c.getOutputByteFrequencyData
          const data = getter?.call(c)
          if (data && data.length) {
            // Use mid-band energy as the amplitude signal; ignore very low/high bins.
            let sum = 0
            const lo = 4, hi = Math.min(data.length, 64)
            for (let i = lo; i < hi; i++) sum += data[i] * data[i]
            const rms = Math.sqrt(sum / (hi - lo)) / 255
            setAmplitude(Math.min(1, rms * 2.2))
          }
        } catch {
          /* analyser not ready yet */
        }
      } else if (!cancelled) {
        setAmplitude(0)
      }
      ampRafRef.current = requestAnimationFrame(tick)
    }
    ampRafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(ampRafRef.current)
    }
  }, [callState])

  // Duration timer ticks once per second while the call is active.
  useEffect(() => {
    if (!startedAtRef.current) return
    if (callState === 'ending' || callState === 'error') return
    const id = setInterval(() => {
      setDurationSec(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [callState])

  const handleStartSession = useCallback(async (withFeedback) => {
    setCallState('connecting')
    setErrorMessage('')
    try {
      const conv = await startConverseCall({
        persona,
        level,
        language,
        nativeLanguage,
        voiceGender,
        feedback: withFeedback,
        callbacks: {
          onConnect: ({ conversationId } = {}) => {
            conversationIdRef.current = conversationId || conversationIdRef.current
            if (!startedAtRef.current) startedAtRef.current = Date.now()
            setCallState('idle')
          },
          onDisconnect: () => {
            if (isEndingRef.current || restartingRef.current) return
            setCallState('ending')
          },
          onError: (err) => {
            console.error('Converse SDK error:', err)
            setCallState('error')
            setErrorMessage(typeof err === 'string' ? err : err?.message || 'Call error')
          },
          onModeChange: ({ mode } = {}) => {
            // SDK exposes 'listening' (waiting for/hearing the user) and
            // 'speaking' (agent is talking).
            if (mode === 'speaking') setCallState('agent-speaking')
            else if (mode === 'listening') setCallState('learner-speaking')
          },
          onStatusChange: ({ status } = {}) => {
            if (status === 'connecting') setCallState('connecting')
          },
        },
      })
      conversationRef.current = conv
      // Some SDK versions expose getId() rather than the connect payload.
      try {
        const id = conv.getId?.()
        if (id) conversationIdRef.current = id
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error('Failed to start converse call:', err)
      setCallState('error')
      setErrorMessage(err?.message || 'Failed to start call')
    }
  }, [persona, level, language, nativeLanguage, voiceGender])

  // Kick off the call when the page mounts.
  useEffect(() => {
    if (!language) {
      setCallState('error')
      setErrorMessage('Missing call parameters')
      return
    }
    handleStartSession(initialFeedback)
    // Clean up on unmount: best-effort recording save + close session.
    return () => {
      const conv = conversationRef.current
      conversationRef.current = null
      const id = conversationIdRef.current
      try { conv?.endSession?.() } catch {}
      if (id) saveConverseRecording(id).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEndCall = async () => {
    isEndingRef.current = true
    setCallState('ending')
    const conv = conversationRef.current
    const id = conversationIdRef.current
    conversationRef.current = null
    try { await conv?.endSession?.() } catch {}
    if (id) saveConverseRecording(id).catch(() => {})
    navigate('/dashboard', { state: { initialTab: 'speak' } })
  }

  // Flipping feedback mid-call cleanly restarts the session with a new signed
  // URL and updated prompt. The orb stays mounted so the visual is continuous;
  // there's an unavoidable brief audio gap during the swap.
  const handleToggleFeedback = async () => {
    const next = !feedback
    setFeedback(next)
    if (callState === 'connecting' || callState === 'error') return
    restartingRef.current = true
    const conv = conversationRef.current
    const oldId = conversationIdRef.current
    conversationRef.current = null
    conversationIdRef.current = null
    try { await conv?.endSession?.() } catch {}
    // Save the segment that's ending so partial transcripts aren't lost.
    if (oldId) saveConverseRecording(oldId).catch(() => {})
    await handleStartSession(next)
    restartingRef.current = false
  }

  const orbLabel = {
    connecting: 'Connecting',
    idle: 'Listening',
    'learner-speaking': 'You are speaking',
    'agent-thinking': 'Thinking',
    'agent-speaking': 'Speaker is speaking',
    ending: 'Ending call',
    error: 'Call error',
  }[callState]

  return (
    <div className="converse-call-page">
      <div className="reader-hover-shell wchat-hover-shell">
        <div className="reader-hover-hitbox" />
        <header className="dashboard-header reader-hover-header wchat-hover-header">
          <div className="dashboard-brand-band reader-header-band listening-brand-band">
            <div className="listening-header-left">
              <button
                className="reader-header-button icon-button reader-back-button"
                onClick={handleEndCall}
                type="button"
                aria-label="End call and go back"
              >
                <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            </div>
            <div className="listening-header-actions reader-header-actions">
              <div className="wchat-feedback-toggle">
                <button
                  className={`wchat-toggle-track ${feedback ? 'is-on' : ''}`}
                  onClick={handleToggleFeedback}
                  type="button"
                  aria-label={feedback ? 'Disable feedback' : 'Enable feedback'}
                  aria-pressed={feedback}
                >
                  <span className="wchat-toggle-thumb" />
                </button>
                <span className="wchat-toggle-label">Feedback</span>
              </div>
              {/* Disabled controls retained for visual continuity from the chat header. */}
              <button className="reader-header-button ui-text reader-word-status-trigger" disabled aria-disabled="true">Aa</button>
              <button className="reader-header-button icon-button reader-palette-trigger" disabled aria-disabled="true">
                <span className="palette-circle" />
              </button>
              <button
                className="reader-header-button icon-button reader-theme-trigger"
                type="button"
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={(e) => { setDarkMode((v) => !v); e.currentTarget.blur() }}
              >
                {darkMode ? <MoonIcon /> : <SunIcon />}
              </button>
            </div>
          </div>
        </header>
      </div>

      <main className="converse-call-stage">
        <Orb state={callState} amplitude={amplitude} label={orbLabel} />
        {callState === 'connecting' && (
          <p className="converse-call-status">Connecting…</p>
        )}
        {callState === 'error' && (
          <div className="converse-call-error">
            <p>{errorMessage || 'Something went wrong.'}</p>
            <button className="converse-call-retry" onClick={() => handleStartSession(feedback)}>
              Try again
            </button>
          </div>
        )}
        {callState !== 'connecting' && callState !== 'error' && (
          <p className="converse-call-timer">{formatDuration(durationSec)}</p>
        )}
        <button
          className="converse-call-end"
          onClick={handleEndCall}
          aria-label="End call"
          disabled={callState === 'connecting'}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M21 15.46l-5.27-.61a1 1 0 0 0-.85.27l-1.91 1.91a15.05 15.05 0 0 1-6.59-6.59l1.91-1.91a1 1 0 0 0 .27-.85L7.95 2.4a1 1 0 0 0-1-.85H3.04a1 1 0 0 0-1 1.05A18.94 18.94 0 0 0 21 22.96a1 1 0 0 0 1.05-1V16.46a1 1 0 0 0-1.05-1z" transform="rotate(135 12 12)" />
          </svg>
        </button>
      </main>
    </div>
  )
}

export default ConverseCall
