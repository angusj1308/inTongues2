import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const WritingChat = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { persona, level, language } = location.state || {}
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return

    const text = inputValue.trim()
    setInputValue('')
    const userMsg = { id: Date.now(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setSending(true)

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/writing-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: history,
          persona,
          level,
          language,
          corrections: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: 'assistant', content: data.response },
        ])
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

  const handleBack = () => {
    navigate('/dashboard', { state: { initialTab: 'write' } })
  }

  return (
    <div className="wchat-page">
      <header className="wchat-header">
        <button className="wchat-back" onClick={handleBack}>
          <BackIcon />
        </button>
        <div className="wchat-header-info">
          <h1 className="wchat-header-title">{persona || 'Chat'}</h1>
          {level && language && (
            <span className="wchat-header-meta">{language} · {level}</span>
          )}
        </div>
      </header>

      <main className="wchat-messages">
        {messages.length === 0 && (
          <div className="wchat-empty">
            <p className="muted">Start the conversation in {language || 'your target language'}.</p>
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
        <div className="wchat-input-row">
          <input
            ref={inputRef}
            type="text"
            className="wchat-input"
            placeholder={`Type in ${language || 'your target language'}...`}
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
        </div>
      </footer>
    </div>
  )
}

export default WritingChat
