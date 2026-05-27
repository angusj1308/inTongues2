import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'

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

const parseResponse = (raw) => {
  const parts = raw.split('\n---\n')
  if (parts.length >= 2) {
    return { text: parts[0].trim(), translation: parts.slice(1).join('\n---\n').trim() }
  }
  return { text: raw.trim(), translation: null }
}

const WritingChat = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
  const { persona, level, language } = location.state || {}
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [expandedTranslations, setExpandedTranslations] = useState(new Set())
  const [corrections, setCorrections] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    try { localStorage.setItem('darkMode', JSON.stringify(darkMode)) } catch {}
  }, [darkMode])

  useEffect(() => {
    if (!activeChatId && persona) {
      const newChat = {
        id: Date.now(),
        persona,
        level,
        language,
        title: persona.length > 30 ? persona.slice(0, 30) + '…' : persona,
        messages: [],
        lastActivity: Date.now(),
      }
      setChats([newChat])
      setActiveChatId(newChat.id)
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [activeChatId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeChat = chats.find((c) => c.id === activeChatId)

  const toggleTranslation = (msgId) => {
    setExpandedTranslations((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  const handleSend = async () => {
    if (!inputValue.trim() || sending || !activeChat) return

    const text = inputValue.trim()
    setInputValue('')
    const userMsg = { id: Date.now(), role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setSending(true)

    setChats((prev) =>
      prev.map((c) => (c.id === activeChatId ? { ...c, messages: updatedMessages, lastActivity: Date.now() } : c))
    )

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
        }
        const withResponse = [...updatedMessages, assistantMsg]
        setMessages(withResponse)
        setChats((prev) =>
          prev.map((c) => (c.id === activeChatId ? { ...c, messages: withResponse, lastActivity: Date.now() } : c))
        )
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
      setMessages(chat.messages)
      setExpandedTranslations(new Set())
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
    <div className="wchat-page">
      <div className="reader-hover-shell wchat-hover-shell">
        <div className="reader-hover-hitbox" />
        <header className="reader-hover-header wchat-hover-header">
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
                <span className="wchat-sidebar-item-title">{c.title}</span>
                <span className="wchat-sidebar-item-meta">{formatRelativeTime(c.lastActivity)}</span>
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
          {messages.length === 0 && (
            <div className="wchat-empty">
              <p className="muted">Start the conversation in {chatLanguage}.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`wchat-bubble ${msg.role}`}>
              <div className="wchat-bubble-content">
                {msg.content}
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
            </div>
          ))}
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
        </main>

        <footer className="wchat-footer">
          <input
            ref={inputRef}
            type="text"
            className="wchat-input"
            placeholder={`Type in ${chatLanguage}...`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            className="wchat-send"
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
          >
            <SendIcon />
          </button>
        </footer>
        </div>
      </div>
    </div>
  )
}

export default WritingChat
