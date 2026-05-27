import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  READER_PALETTES,
  READER_PALETTE_ORDER,
  DEFAULT_READER_PALETTE,
  resolveReaderPalette,
} from '../constants/highlightColors'

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

const WritingChat = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, updateProfile } = useAuth()
  const { persona, level, language } = location.state || {}
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  )
  const [showWordStatus, setShowWordStatus] = useState(() =>
    localStorage.getItem('extensiveShowWordStatus') !== 'false'
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteRef = useRef(null)

  const currentPaletteName = profile?.readerHighlightPalette || DEFAULT_READER_PALETTE
  const currentPalette = resolveReaderPalette(currentPaletteName)
  const currentShade = darkMode ? currentPalette.dark : currentPalette.light

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    try { localStorage.setItem('darkMode', JSON.stringify(darkMode)) } catch {}
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem('extensiveShowWordStatus', showWordStatus ? 'true' : 'false')
  }, [showWordStatus])

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

  const toggleWordStatus = useCallback(() => {
    setShowWordStatus((prev) => !prev)
  }, [])

  const selectPalette = (name) => {
    setPaletteOpen(false)
    if (name === currentPaletteName) return
    updateProfile({ readerHighlightPalette: name }).catch((err) => {
      console.error('Failed to update palette:', err)
    })
  }

  useEffect(() => {
    if (!activeChatId && persona) {
      const newChat = {
        id: Date.now(),
        persona,
        level,
        language,
        title: persona.length > 30 ? persona.slice(0, 30) + '…' : persona,
        messages: [],
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

  const handleSend = async () => {
    if (!inputValue.trim() || sending || !activeChat) return

    const text = inputValue.trim()
    setInputValue('')
    const userMsg = { id: Date.now(), role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setSending(true)

    setChats((prev) =>
      prev.map((c) => (c.id === activeChatId ? { ...c, messages: updatedMessages } : c))
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
          corrections: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const assistantMsg = { id: Date.now() + 1, role: 'assistant', content: data.response }
        const withResponse = [...updatedMessages, assistantMsg]
        setMessages(withResponse)
        setChats((prev) =>
          prev.map((c) => (c.id === activeChatId ? { ...c, messages: withResponse } : c))
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
      <header className="wchat-bar">
        <div className="wchat-bar-left">
          <button
            className="reader-header-button icon-button"
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
        <div className="wchat-bar-right">
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
              toggleWordStatus()
              e.currentTarget.blur()
            }}
            style={showWordStatus ? { color: currentShade.new } : undefined}
          >
            Aa
          </button>

          <div className="reader-palette-popover-wrap" ref={paletteRef}>
            <button
              className={`reader-header-button icon-button reader-palette-trigger ${paletteOpen ? 'is-open' : ''}`}
              type="button"
              aria-label={`Highlight palette: ${currentPalette.label}`}
              aria-expanded={paletteOpen}
              onClick={(e) => {
                setPaletteOpen((prev) => !prev)
                e.currentTarget.blur()
              }}
            >
              <span
                className="palette-circle"
                style={{ background: currentShade.new }}
              />
            </button>
            {paletteOpen && (
              <div className="reader-palette-popover" role="listbox" aria-label="Highlighter colour">
                {READER_PALETTE_ORDER.map((name) => {
                  const pal = resolveReaderPalette(name)
                  const shade = darkMode ? pal.dark : pal.light
                  const isActive = name === currentPaletteName
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
                      <span
                        className="reader-palette-swatch-circle"
                        style={{ background: shade.new }}
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </header>

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
                <span className="wchat-sidebar-item-meta">{c.language} · {c.level}</span>
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
              <div className="wchat-bubble-content">{msg.content}</div>
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
