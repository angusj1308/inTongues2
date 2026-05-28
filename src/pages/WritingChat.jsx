import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import {
  createWritingChat,
  updateWritingChat,
  deleteWritingChat,
  regenerateChatTitle,
  subscribeToWritingChats,
} from '../services/writingChat'
import {
  loadUserVocab,
  upsertVocabEntry,
  normaliseExpression,
} from '../services/vocab'
import {
  READER_PALETTE_ORDER,
  DEFAULT_READER_PALETTE,
  resolveReaderPalette,
} from '../constants/highlightColors'
import WordToken from '../components/read/WordToken'

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)

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

const parseResponse = (raw) => {
  const parts = raw.split('\n---\n')
  if (parts.length >= 2) {
    return { text: parts[0].trim(), translation: parts.slice(1).join('\n---\n').trim() }
  }
  return { text: raw.trim(), translation: null }
}

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const d = new Date(timestamp)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const WritingChat = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, updateProfile } = useAuth()
  const { persona, level, language, voiceGender } = location.state || {}
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(() => {
    try { return localStorage.getItem('wchat-active') || null } catch { return null }
  })
  const [expandedTranslations, setExpandedTranslations] = useState(new Set())
  const [revealedText, setRevealedText] = useState(new Set())
  const [corrections, setCorrections] = useState(true)
  const [listenFirst, setListenFirst] = useState(() => {
    try { return localStorage.getItem('wchat-listen-first') === 'true' } catch { return false }
  })
  const [loaded, setLoaded] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [vocab, setVocab] = useState({})
  const [wordPopup, setWordPopup] = useState(null)
  const [showWordStatus, setShowWordStatus] = useState(() => {
    try { return localStorage.getItem('wchat-word-status') !== 'false' } catch { return true }
  })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteRef = useRef(null)
  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const createdRef = useRef(false)
  const backfilledRef = useRef(false)

  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    try { localStorage.setItem('darkMode', JSON.stringify(darkMode)) } catch {}
  }, [darkMode])

  useEffect(() => {
    try { localStorage.setItem('wchat-listen-first', listenFirst ? 'true' : 'false') } catch {}
  }, [listenFirst])

  useEffect(() => {
    try { localStorage.setItem('wchat-word-status', showWordStatus ? 'true' : 'false') } catch {}
  }, [showWordStatus])

  const paletteName = profile?.readerHighlightPalette || DEFAULT_READER_PALETTE
  const palette = resolveReaderPalette(paletteName)
  const paletteShade = darkMode ? palette.dark : palette.light

  useEffect(() => {
    if (!paletteOpen) return
    const handleClick = (e) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target)) {
        setPaletteOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [paletteOpen])

  const selectPalette = (name) => {
    setPaletteOpen(false)
    if (name === paletteName) return
    updateProfile({ readerHighlightPalette: name }).catch((err) => {
      console.error('Failed to update palette:', err)
    })
  }

  useEffect(() => {
    if (!user?.uid) return
    const unsubscribe = subscribeToWritingChats(
      user.uid,
      (nextChats) => {
        setChats(nextChats)
        setLoaded(true)
      },
      (err) => {
        console.error('Chat subscription error:', err)
        setLoaded(true)
      }
    )
    return unsubscribe
  }, [user?.uid])

  // One-off backfill: regenerate clean titles for older chats whose title
  // is still the raw/truncated persona.
  useEffect(() => {
    if (!loaded || !user?.uid || backfilledRef.current || chats.length === 0) return
    backfilledRef.current = true
    chats.forEach((c) => {
      if (!c.persona || !c.title) return
      const strippedTitle = c.title.replace(/…$/, '').trim().toLowerCase()
      const personaLower = c.persona.trim().toLowerCase()
      // Title still looks like the raw/truncated persona (persona starts with it).
      if (strippedTitle && personaLower.startsWith(strippedTitle)) {
        regenerateChatTitle(user.uid, c.id, c.persona)
      }
    })
  }, [loaded, chats, user?.uid])

  useEffect(() => {
    if (!loaded || createdRef.current) return
    if (persona) {
      // Arrived from the setup form — always start a fresh chat.
      createdRef.current = true
      createWritingChat(user.uid, { persona, level, language, voiceGender }).then((newChat) => {
        setActiveChatId(newChat.id)
        setMessages([])
        // Clear navigation state so a refresh doesn't spawn another chat.
        navigate(location.pathname, { replace: true, state: {} })
      })
    }
  }, [loaded, persona])

  useEffect(() => {
    if (activeChatId) {
      try { localStorage.setItem('wchat-active', activeChatId) } catch {}
    }
  }, [activeChatId])

  useEffect(() => {
    if (loaded && activeChatId && chats.length > 0) {
      const chat = chats.find((c) => c.id === activeChatId)
      if (chat) {
        setMessages(chat.messages || [])
      } else if (chats.length > 0) {
        setActiveChatId(chats[0].id)
        setMessages(chats[0].messages || [])
      }
    }
  }, [activeChatId, loaded])

  useEffect(() => {
    inputRef.current?.focus()
  }, [activeChatId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeChat = chats.find((c) => c.id === activeChatId)
  const chatLang = activeChat?.language || language

  useEffect(() => {
    if (!user?.uid || !chatLang) return
    let cancelled = false
    loadUserVocab(user.uid, chatLang)
      .then((entries) => { if (!cancelled) setVocab(entries || {}) })
      .catch((err) => console.error('Vocab load error:', err))
    return () => { cancelled = true }
  }, [user?.uid, chatLang])

  const handleWordClick = async (word, event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const normalised = normaliseExpression(word)
    setWordPopup({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
      word: normalised,
      displayText: word,
      translation: null,
      loading: true,
    })

    try {
      const res = await fetch('/api/translatePhrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phrase: word,
          sourceLang: chatLang,
          targetLang: nativeLanguage,
          skipAudio: true,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setWordPopup((p) => p && p.word === normalised
          ? { ...p, translation: data.translation || '—', loading: false }
          : p)
      } else {
        setWordPopup((p) => p && p.word === normalised ? { ...p, translation: '—', loading: false } : p)
      }
    } catch {
      setWordPopup((p) => p && p.word === normalised ? { ...p, translation: '—', loading: false } : p)
    }
  }

  const handleSetWordStatus = async (status) => {
    if (!wordPopup || !user?.uid || !chatLang) return
    const word = wordPopup.word
    const translation = wordPopup.translation
    // Optimistic update
    setVocab((prev) => ({ ...prev, [word]: { ...(prev[word] || {}), status, translation } }))
    setWordPopup(null)
    try {
      await upsertVocabEntry(user.uid, chatLang, word, translation, status)
    } catch (err) {
      console.error('Failed to set word status:', err)
    }
  }

  const renderWords = (content) => {
    const tokens = (content || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)
    const tone = darkMode ? 'dark' : 'light'
    return tokens.map((token, i) => {
      if (/^[\p{L}\p{N}][\p{L}\p{N}'-]*$/u.test(token)) {
        const entry = vocab[normaliseExpression(token)]
        return (
          <WordToken
            key={i}
            text={token}
            status={entry?.status}
            readerMode={showWordStatus ? 'intensive' : 'extensive'}
            tone={tone}
            onWordClick={handleWordClick}
          />
        )
      }
      return <span key={i}>{token}</span>
    })
  }

  const handlePlay = async (msg) => {
    if (playingId === msg.id) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingId(null)
      return
    }

    if (!msg.audioUrl) return

    audioRef.current?.pause()
    const audio = new Audio(msg.audioUrl)
    audioRef.current = audio
    audio.onended = () => setPlayingId(null)
    audio.play()
    setPlayingId(msg.id)
  }

  const toggleTranslation = (msgId) => {
    setExpandedTranslations((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  const revealText = (msgId) => {
    setRevealedText((prev) => {
      const next = new Set(prev)
      next.add(msgId)
      return next
    })
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        setTranscribing(true)
        try {
          const form = new FormData()
          form.append('audio', blob, 'voice.webm')
          form.append('language', activeChat?.language || language || 'English')
          const res = await fetch('/api/speech/transcribe', { method: 'POST', body: form })
          if (res.ok) {
            const data = await res.json()
            if (data.text) {
              setInputValue((prev) => (prev ? `${prev} ${data.text}` : data.text))
            }
          }
        } catch (err) {
          console.error('Transcription error:', err)
        } finally {
          setTranscribing(false)
          inputRef.current?.focus()
        }
      }

      mediaRecorder.start()
      setRecording(true)
    } catch (err) {
      console.error('Recording error:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  const toggleRecording = () => {
    if (recording) stopRecording()
    else startRecording()
  }

  const handleSend = async () => {
    if (!inputValue.trim() || sending || !activeChat || !user?.uid) return

    const text = inputValue.trim()
    setInputValue('')
    const userMsg = { id: Date.now(), role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setSending(true)

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/writing-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: history,
          persona: activeChat.persona,
          level: activeChat.level,
          language: activeChat.language,
          nativeLanguage,
          voiceGender: activeChat.voiceGender || voiceGender || 'female',
          corrections,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const parsed = parseResponse(data.response)
        const assistantMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: parsed.text,
          translation: parsed.translation,
          correction: data.correction || null,
          audioUrl: data.audioUrl || null,
        }
        const withResponse = [...updatedMessages, assistantMsg]
        setMessages(withResponse)
        await updateWritingChat(user.uid, activeChatId, { messages: withResponse })
      } else {
        await updateWritingChat(user.uid, activeChatId, { messages: updatedMessages })
      }
    } catch (err) {
      console.error('Chat error:', err)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSelectChat = (chatId) => {
    if (chatId === activeChatId) return
    const chat = chats.find((c) => c.id === chatId)
    if (chat) {
      setActiveChatId(chatId)
      setMessages(chat.messages || [])
      setExpandedTranslations(new Set())
    }
  }

  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation()
    if (!user?.uid) return
    const remaining = chats.filter((c) => c.id !== chatId)
    try {
      await deleteWritingChat(user.uid, chatId)
    } catch (err) {
      console.error('Failed to delete chat:', err)
      return
    }
    if (chatId === activeChatId) {
      if (remaining.length > 0) {
        setActiveChatId(remaining[0].id)
        setMessages(remaining[0].messages || [])
      } else {
        setActiveChatId(null)
        setMessages([])
        try { localStorage.removeItem('wchat-active') } catch {}
        navigate('/dashboard', { state: { initialTab: 'write' } })
      }
    }
  }

  const handleNewChat = () => {
    navigate('/dashboard', { state: { initialTab: 'write' } })
  }

  const handleBack = () => {
    navigate('/dashboard', { state: { initialTab: 'write' } })
  }

  const chatLanguage = activeChat?.language || language || 'your target language'

  return (
    <div
      className="wchat-page"
      style={{
        '--hlt-new': paletteShade.new,
        '--hlt-recognised': paletteShade.recognised,
        '--hlt-familiar': paletteShade.familiar,
      }}
    >
      <div className="reader-hover-shell wchat-hover-shell">
        <div className="reader-hover-hitbox" />
        <header className="dashboard-header reader-hover-header wchat-hover-header">
          <div className="dashboard-brand-band reader-header-band listening-brand-band">
            <div className="listening-header-left">
              <button
                className="reader-header-button icon-button reader-back-button"
                onClick={handleBack}
                type="button"
                aria-label="Back"
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
                  className={`wchat-toggle-track ${listenFirst ? 'is-on' : ''}`}
                  onClick={() => setListenFirst((v) => !v)}
                  type="button"
                  aria-label={listenFirst ? 'Disable listen first' : 'Enable listen first'}
                  aria-pressed={listenFirst}
                >
                  <span className="wchat-toggle-thumb" />
                </button>
                <span className="wchat-toggle-label">Listen First</span>
              </div>
              <div className="wchat-feedback-toggle">
                <button
                  className={`wchat-toggle-track ${corrections ? 'is-on' : ''}`}
                  onClick={() => setCorrections((v) => !v)}
                  type="button"
                  aria-label={corrections ? 'Disable feedback' : 'Enable feedback'}
                  aria-pressed={corrections}
                >
                  <span className="wchat-toggle-thumb" />
                </button>
                <span className="wchat-toggle-label">Feedback</span>
              </div>
              <button
                className="reader-header-button icon-button reader-theme-trigger"
                type="button"
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={(e) => {
                  setDarkMode((prev) => !prev)
                  e.currentTarget.blur()
                }}
              >
                {darkMode ? <MoonIcon /> : <SunIcon />}
              </button>

              <button
                className={`reader-header-button ui-text reader-word-status-trigger ${showWordStatus ? 'is-on' : ''}`}
                type="button"
                aria-label={showWordStatus ? 'Hide word status' : 'Show word status'}
                aria-pressed={showWordStatus}
                onClick={(e) => {
                  setShowWordStatus((v) => !v)
                  e.currentTarget.blur()
                }}
                style={showWordStatus ? { color: paletteShade.new } : undefined}
              >
                Aa
              </button>

              <div className="reader-palette-popover-wrap" ref={paletteRef}>
                <button
                  className={`reader-header-button icon-button reader-palette-trigger ${paletteOpen ? 'is-open' : ''}`}
                  type="button"
                  aria-label={`Highlight palette: ${palette.label}`}
                  aria-expanded={paletteOpen}
                  onClick={(e) => {
                    setPaletteOpen((v) => !v)
                    e.currentTarget.blur()
                  }}
                >
                  <span className="palette-circle" style={{ background: paletteShade.new }} />
                </button>
                {paletteOpen && (
                  <div className="reader-palette-popover" role="listbox" aria-label="Highlighter colour">
                    {READER_PALETTE_ORDER.map((name) => {
                      const pal = resolveReaderPalette(name)
                      const shade = darkMode ? pal.dark : pal.light
                      const isActive = name === paletteName
                      return (
                        <button
                          key={name}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`reader-palette-swatch ${isActive ? 'is-active' : ''}`}
                          title={pal.label}
                          onClick={() => selectPalette(name)}
                        >
                          <span className="reader-palette-swatch-circle" style={{ background: shade.new }} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      </div>

      <div className="wchat-body">
        <aside className={`wchat-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
          <h4 className="wchat-sidebar-heading">Recent Chats</h4>
          <ul className="wchat-sidebar-list">
            {chats.map((c) => (
              <li
                key={c.id}
                className={`wchat-sidebar-item ${c.id === activeChatId ? 'is-active' : ''}`}
                onClick={() => handleSelectChat(c.id)}
              >
                <div className="wchat-sidebar-item-text">
                  <span className="wchat-sidebar-item-title">{c.title}</span>
                  <span className="wchat-sidebar-item-meta">{formatRelativeTime(c.lastActivity)}</span>
                </div>
                <button
                  className="wchat-sidebar-delete"
                  onClick={(e) => handleDeleteChat(c.id, e)}
                  aria-label="Delete chat"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <button className="wchat-sidebar-new" onClick={handleNewChat}>
            + New Chat
          </button>
        </aside>

        <button
          className={`wchat-sidebar-tab ${sidebarOpen ? 'is-open' : ''}`}
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle sidebar"
        >
          <svg viewBox="0 0 8 24" width="8" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="4" y1="8" x2="4" y2="16" />
          </svg>
        </button>

        {sidebarOpen && (
          <div className="wchat-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        <div className="wchat-main">

        <main className="wchat-messages">
          <div className="wchat-messages-inner">
          {messages.length === 0 && (
            <div className="wchat-empty">
              <p className="muted">Start the conversation in {chatLanguage}.</p>
            </div>
          )}
          {messages.map((msg) => {
            const hidden =
              listenFirst &&
              msg.role === 'assistant' &&
              msg.audioUrl &&
              !revealedText.has(msg.id)

            return (
              <div key={msg.id} className={`wchat-bubble ${msg.role}`}>
                {msg.role === 'assistant' && msg.audioUrl && (
                  <button
                    className={`wchat-play-btn ${playingId === msg.id ? 'is-playing' : ''}`}
                    onClick={() => handlePlay(msg)}
                    aria-label={playingId === msg.id ? 'Stop' : 'Play'}
                  >
                    {playingId === msg.id ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    )}
                  </button>
                )}
                {hidden ? (
                  <div className="wchat-bubble-content wchat-voice-note">
                    <div className="wchat-waveform" aria-hidden="true">
                      {[10, 18, 8, 22, 14, 26, 12, 20, 9, 24, 16, 11, 19, 7, 21, 13].map((h, i) => (
                        <span key={i} style={{ height: `${h}px` }} />
                      ))}
                    </div>
                    <button
                      className="wchat-reveal-btn"
                      onClick={() => revealText(msg.id)}
                      aria-label="Reveal text"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        <line x1="8" y1="9" x2="16" y2="9" />
                        <line x1="8" y1="13" x2="13" y2="13" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="wchat-bubble-content">
                    {msg.role === 'assistant' && msg.correction && (
                      <div className="wchat-correction wchat-correction--top">
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
                        <span>{msg.correction}</span>
                      </div>
                    )}
                    {msg.role === 'assistant' ? renderWords(msg.content) : msg.content}
                    {msg.role === 'assistant' && msg.translation && (
                      <>
                        <button
                          className={`wchat-translate-btn ${expandedTranslations.has(msg.id) ? 'is-on' : ''}`}
                          onClick={() => toggleTranslation(msg.id)}
                          aria-label="Translate"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>translate</span>
                        </button>
                        {expandedTranslations.has(msg.id) && (
                          <div className="wchat-translation">{msg.translation}</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {sending && (
            <div className="wchat-bubble assistant">
              <div className="wchat-bubble-content wchat-typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
          </div>
        </main>

        <footer className="wchat-footer">
          <input
            ref={inputRef}
            type="text"
            className="wchat-input"
            placeholder={transcribing ? 'Transcribing…' : recording ? 'Recording… tap mic to stop' : `Type in ${chatLanguage}...`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || transcribing}
          />
          {inputValue.trim() ? (
            <button
              className="wchat-send"
              onClick={handleSend}
              disabled={sending}
            >
              <SendIcon />
            </button>
          ) : (
            <button
              className={`wchat-send wchat-mic ${recording ? 'is-recording' : ''}`}
              onClick={toggleRecording}
              disabled={sending || transcribing}
              aria-label={recording ? 'Stop recording' : 'Record voice note'}
            >
              {recording ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          )}
        </footer>
        </div>
      </div>

      {wordPopup && (
        <>
          <div className="wchat-word-popup-backdrop" onClick={() => setWordPopup(null)} />
          <div
            className="wchat-word-popup"
            style={{ left: wordPopup.x, top: wordPopup.y }}
          >
            <div className="wchat-word-popup-word">{wordPopup.displayText}</div>
            <div className="wchat-word-popup-translation">
              {wordPopup.loading ? '…' : wordPopup.translation}
            </div>
            <div className="wchat-word-popup-status">
              {[
                { level: 'unknown', label: 'New' },
                { level: 'recognised', label: 'Seen' },
                { level: 'familiar', label: 'Familiar' },
                { level: 'known', label: 'Known' },
              ].map(({ level, label }) => {
                const current = vocab[wordPopup.word]?.status
                const active = current === level
                return (
                  <button
                    key={level}
                    className={`wchat-word-status-btn ${active ? 'is-active' : ''}`}
                    onClick={() => handleSetWordStatus(level)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default WritingChat
