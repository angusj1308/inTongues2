import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { startConverseCall, saveConverseRecording } from '../services/converseAgent'
import {
  getWritingChat,
  appendCallRecord,
  patchCallRecord,
} from '../services/writingChat'
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

// Wait up to ~30s for ElevenLabs to finalise the call audio, retrying the
// /api/converse/recording endpoint with light backoff. Returns the audioUrl
// or null if it never becomes available in time.
const fetchRecordingWithRetry = async (conversationId) => {
  const delays = [3000, 5000, 7000, 9000, 12000]
  for (const wait of delays) {
    try {
      const result = await saveConverseRecording(conversationId)
      if (result?.audioUrl) return result.audioUrl
      if (!result?.pending) return null
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, wait))
  }
  return null
}

const ConverseCall = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuth()
  const state = location.state || {}
  const [params, setParams] = useState({
    chatId: state.chatId || null,
    persona: state.persona || '',
    level: state.level || '',
    language: state.language || '',
    voiceGender: state.voiceGender || 'female',
    feedback: state.feedback === true,
  })
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')

  const [callState, setCallState] = useState('connecting')
  const [errorMessage, setErrorMessage] = useState('')
  const [feedback, setFeedback] = useState(params.feedback)
  const [durationSec, setDurationSec] = useState(0)

  const conversationRef = useRef(null)
  const conversationIdRef = useRef(null)
  const startedAtRef = useRef(null)
  const restartingRef = useRef(null) // holds the user-initiated reason for disconnect ('end'|'restart'|null)
  const transcriptRef = useRef([])
  const segmentStartRef = useRef(null) // start time of the *current* signed-url segment (resets across feedback restarts)
  const callRecordIdRef = useRef(null) // id of the appended call record, used for patching audio later
  // When the user finishes speaking the SDK fires onMessage(source='user').
  // From there until onModeChange('speaking') we're in the "thinking" gap.
  const thinkingTimeoutRef = useRef(null)

  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    try { localStorage.setItem('darkMode', JSON.stringify(darkMode)) } catch {}
  }, [darkMode])

  // If we landed here with only a chatId (from the phone icon on an existing
  // thread), pull the thread's params before starting the call.
  useEffect(() => {
    let cancelled = false
    const needsHydrate = params.chatId && !params.language && user?.uid
    if (!needsHydrate) return
    getWritingChat(user.uid, params.chatId).then((chat) => {
      if (cancelled || !chat) return
      setParams((p) => ({
        ...p,
        persona: chat.persona || '',
        level: chat.level || '',
        language: chat.language || '',
        voiceGender: chat.voiceGender || 'female',
      }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [params.chatId, user?.uid])

  useEffect(() => {
    if (!startedAtRef.current) return
    if (callState === 'ending' || callState === 'error') return
    const id = setInterval(() => {
      setDurationSec(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [callState])

  const clearThinkingTimer = () => {
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current)
      thinkingTimeoutRef.current = null
    }
  }

  const handleStartSession = useCallback(async (withFeedback) => {
    setCallState('connecting')
    setErrorMessage('')
    segmentStartRef.current = Date.now()
    try {
      const conv = await startConverseCall({
        persona: params.persona,
        level: params.level,
        language: params.language,
        nativeLanguage,
        voiceGender: params.voiceGender,
        feedback: withFeedback,
        callbacks: {
          onConnect: ({ conversationId } = {}) => {
            conversationIdRef.current = conversationId || conversationIdRef.current
            if (!startedAtRef.current) startedAtRef.current = Date.now()
            setCallState('idle')
          },
          onDisconnect: () => {
            // Ignore disconnects we triggered ourselves (end / feedback restart).
            if (restartingRef.current) return
            setCallState('ending')
          },
          onError: (err) => {
            const msg = typeof err === 'string' ? err : err?.message || ''
            const isPermission = /permission|denied|notallowed|getusermedia/i.test(msg)
            console.error('Converse SDK error:', err)
            setCallState('error')
            setErrorMessage(isPermission
              ? 'Microphone access denied. Allow microphone access in your browser settings to start a call.'
              : (msg || 'Call error'))
          },
          onMessage: ({ message, source } = {}) => {
            if (!message) return
            const role = source === 'user' ? 'user' : 'assistant'
            transcriptRef.current = [...transcriptRef.current, { role, content: message }]
            if (role === 'user') {
              // User just finished speaking → enter the "thinking" gap until
              // the agent starts speaking. Clear after a safety timeout in
              // case the speaking transition never arrives.
              clearThinkingTimer()
              setCallState('agent-thinking')
              thinkingTimeoutRef.current = setTimeout(() => {
                setCallState((s) => (s === 'agent-thinking' ? 'idle' : s))
              }, 8000)
            }
          },
          onModeChange: ({ mode } = {}) => {
            if (mode === 'speaking') {
              clearThinkingTimer()
              setCallState('agent-speaking')
              // Half-duplex: mute the mic while the agent is talking so the
              // speakers can't loop back through. Trade-off: no
              // interrupt-by-voice — wait for the agent to finish.
              try { conversationRef.current?.setMicMuted?.(true) } catch {}
            } else if (mode === 'listening') {
              // SDK is now listening for the user. If we're already showing
              // 'agent-thinking', keep that until the user actually starts
              // speaking (amplitude detection below).
              setCallState((s) =>
                s === 'agent-thinking' || s === 'connecting' ? s : 'idle',
              )
              // Re-open the mic now that the agent's done.
              try { conversationRef.current?.setMicMuted?.(false) } catch {}
            }
          },
          onStatusChange: ({ status } = {}) => {
            if (status === 'connecting') setCallState('connecting')
          },
        },
      })
      conversationRef.current = conv
      try {
        const id = conv.getId?.()
        if (id) conversationIdRef.current = id
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error('Failed to start converse call:', err)
      const msg = err?.message || 'Failed to start call'
      const isPermission = /permission|denied|notallowed|getusermedia/i.test(msg)
      setCallState('error')
      setErrorMessage(isPermission
        ? 'Microphone access denied. Allow microphone access in your browser settings to start a call.'
        : msg)
    }
  }, [params.persona, params.level, params.language, params.voiceGender, nativeLanguage])

  // While idle/listening, raise amplitude detection on the mic input to
  // promote the orb to 'learner-speaking' as soon as the user starts talking.
  useEffect(() => {
    if (callState !== 'idle') return
    let cancelled = false
    let raf
    const tick = () => {
      if (cancelled) return
      const c = conversationRef.current
      try {
        const data = c?.getInputByteFrequencyData?.call(c)
        if (data && data.length) {
          let sum = 0
          const lo = 4, hi = Math.min(data.length, 64)
          for (let i = lo; i < hi; i++) sum += data[i] * data[i]
          const rms = Math.sqrt(sum / (hi - lo)) / 255
          if (rms > 0.06) {
            setCallState('learner-speaking')
            return
          }
        }
      } catch {
        /* ignore */
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [callState])

  // While 'learner-speaking', drop back to 'idle' when the user falls silent.
  useEffect(() => {
    if (callState !== 'learner-speaking') return
    let cancelled = false
    let silentSince = null
    let raf
    const tick = () => {
      if (cancelled) return
      const c = conversationRef.current
      try {
        const data = c?.getInputByteFrequencyData?.call(c)
        if (data && data.length) {
          let sum = 0
          const lo = 4, hi = Math.min(data.length, 64)
          for (let i = lo; i < hi; i++) sum += data[i] * data[i]
          const rms = Math.sqrt(sum / (hi - lo)) / 255
          if (rms < 0.04) {
            if (!silentSince) silentSince = Date.now()
            else if (Date.now() - silentSince > 500) {
              setCallState('idle')
              return
            }
          } else {
            silentSince = null
          }
        }
      } catch {
        /* ignore */
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [callState])

  // Kick off the call when params are ready.
  useEffect(() => {
    if (!params.language) return
    if (conversationRef.current) return
    handleStartSession(params.feedback)
    return () => {
      // Cleanup on unmount: end the session and append a call record so the
      // thread shows what happened even if the user closes the tab abruptly.
      const conv = conversationRef.current
      const conversationId = conversationIdRef.current
      conversationRef.current = null
      try { conv?.endSession?.() } catch {}
      finaliseCallRecord(conversationId).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.language])

  // Best-effort recording save on tab close / refresh / browser back. The
  // unmount cleanup above handles the React-side teardown, but its fetches
  // won't reliably complete during a page unload — sendBeacon will.
  useEffect(() => {
    const flushOnUnload = () => {
      const conv = conversationRef.current
      const conversationId = conversationIdRef.current
      try { conv?.endSession?.() } catch {}
      if (conversationId && typeof navigator.sendBeacon === 'function') {
        try {
          const blob = new Blob([JSON.stringify({ conversationId })], {
            type: 'application/json',
          })
          navigator.sendBeacon('/api/converse/recording', blob)
        } catch {
          /* best effort */
        }
      }
    }
    window.addEventListener('beforeunload', flushOnUnload)
    window.addEventListener('pagehide', flushOnUnload)
    return () => {
      window.removeEventListener('beforeunload', flushOnUnload)
      window.removeEventListener('pagehide', flushOnUnload)
    }
  }, [])

  // Build the call record, append it to the thread, then poll for the audio
  // URL and patch it in once ready.
  const finaliseCallRecord = async (conversationId) => {
    if (!params.chatId || !user?.uid) return
    if (!conversationId && transcriptRef.current.length === 0) return
    const startedAt = segmentStartRef.current || startedAtRef.current || Date.now()
    const endedAt = Date.now()
    const durSec = Math.max(0, Math.round((endedAt - startedAt) / 1000))
    const record = {
      id: `call-${endedAt}`,
      conversationId: conversationId || null,
      audioUrl: null,
      durationSec: durSec,
      transcript: [...transcriptRef.current],
      startedAt,
      endedAt,
    }
    callRecordIdRef.current = record.id
    try {
      await appendCallRecord(user.uid, params.chatId, record)
    } catch (err) {
      console.error('Failed to append call record:', err)
    }
    if (conversationId) {
      const audioUrl = await fetchRecordingWithRetry(conversationId)
      if (audioUrl) {
        try {
          await patchCallRecord(user.uid, params.chatId, record.id, { audioUrl })
        } catch (err) {
          console.error('Failed to patch call record audio:', err)
        }
      }
    }
    transcriptRef.current = []
  }

  const handleEndCall = async () => {
    restartingRef.current = 'end'
    setCallState('ending')
    const conv = conversationRef.current
    const conversationId = conversationIdRef.current
    conversationRef.current = null
    conversationIdRef.current = null
    try { await conv?.endSession?.() } catch {}
    // Fire-and-forget the recording mirror + thread append.
    finaliseCallRecord(conversationId).catch(() => {})
    // Let the ending fade animation play before we navigate away.
    await new Promise((r) => setTimeout(r, 380))
    if (params.chatId) {
      try { localStorage.setItem('wchat-active', params.chatId) } catch {}
      navigate('/write/chat')
    } else {
      navigate('/dashboard', { state: { initialTab: 'speak' } })
    }
  }

  const handleToggleFeedback = async () => {
    const next = !feedback
    setFeedback(next)
    if (callState === 'connecting' || callState === 'error') return
    restartingRef.current = 'restart'
    const conv = conversationRef.current
    const oldId = conversationIdRef.current
    conversationRef.current = null
    conversationIdRef.current = null
    try { await conv?.endSession?.() } catch {}
    finaliseCallRecord(oldId).catch(() => {})
    transcriptRef.current = []
    await handleStartSession(next)
    restartingRef.current = null
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
        <header className="dashboard-header reader-hover-header reader-hover-header--pinned wchat-hover-header">
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
        <Orb
          state={callState}
          label={orbLabel}
          color={darkMode ? '#FBFAF8' : '#1C1A17'}
        />
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
