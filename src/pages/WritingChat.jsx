import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94l18-8a.75.75 0 0 0 0-1.38l-18-8Z" />
  </svg>
)

const WritingChat = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { persona, level, language } = location.state || {}
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

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
  const chatLevel = activeChat?.level || level
  const chatPersona = activeChat?.persona || persona || 'Chat'

  return (
    <div className="wchat-page">
      <aside className={`wchat-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="wchat-sidebar-header">
          <button className="wchat-sidebar-new" onClick={handleNewChat}>
            <PlusIcon />
            New Chat
          </button>
        </div>
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
        <div className="wchat-sidebar-footer">
          <button className="wchat-sidebar-back" onClick={handleBack}>
            ← Back to Write
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="wchat-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="wchat-main">
        <header className="wchat-header">
          <button className="wchat-toggle" onClick={() => setSidebarOpen((v) => !v)}>
            <MenuIcon />
          </button>
        </header>

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
  )
}

export default WritingChat
