import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import {
  getTutorProfile,
  getTutorChat,
  createTutorChat,
  addTutorMessage,
  subscribeToTutorChat,
  getConversationContext,
  updateTutorMemory,
} from '../services/tutor'

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

const TutorChat = () => {
  const { chatId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [tutorProfile, setTutorProfile] = useState(null)
  const [chat, setChat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const activeLanguage = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')

  // Load tutor profile
  useEffect(() => {
    if (!user || !activeLanguage) return

    const loadProfile = async () => {
      try {
        const tp = await getTutorProfile(user.uid, activeLanguage, nativeLanguage)
        setTutorProfile(tp)
      } catch (err) {
        console.error('Failed to load tutor profile:', err)
      }
    }

    loadProfile()
  }, [user, activeLanguage, nativeLanguage])

  // Subscribe to chat
  useEffect(() => {
    if (!user || !chatId) {
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeToTutorChat(
      user.uid,
      chatId,
      (chatData) => {
        setChat(chatData)
        setLoading(false)
      },
      (err) => {
        console.error('Chat load error:', err)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [user, chatId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages])

  // Focus input on load
  useEffect(() => {
    if (!loading && chat) {
      inputRef.current?.focus()
    }
  }, [loading, chat])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !chat || !user || sending) return

    const messageText = inputValue.trim()
    setInputValue('')
    setSending(true)

    try {
      // Add user message
      await addTutorMessage(user.uid, chat.id, {
        role: 'user',
        content: messageText,
      })

      // Get conversation context
      const history = getConversationContext(chat)
      history.push({ role: 'user', content: messageText })

      // Get tutor response
      const response = await fetch('/api/tutor/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage,
          conversationHistory: history,
          memory: tutorProfile?.memory,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        await addTutorMessage(user.uid, chat.id, {
          role: 'tutor',
          content: data.response,
        })
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleBack = () => {
    navigate('/dashboard', { state: { initialTab: 'tutor' } })
  }

  if (loading) {
    return (
      <div className="page tutor-chat-page">
        <div className="tutor-chat-loading">
          <p className="muted">Loading conversation...</p>
        </div>
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="page tutor-chat-page">
        <div className="tutor-chat-error">
          <p>Chat not found</p>
          <button className="button ghost" onClick={handleBack}>
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const messages = chat.messages || []

  return (
    <div className="page tutor-chat-page">
      <header className="tutor-chat-header">
        <button className="tutor-back-button" onClick={handleBack}>
          <BackIcon />
        </button>
        <div className="tutor-chat-title">
          <h1>Tutor</h1>
          <span className="tutor-chat-language">{activeLanguage}</span>
        </div>
      </header>

      <main className="tutor-chat-main">
        <div className="tutor-messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`tutor-message ${msg.role === 'user' ? 'user' : 'tutor'}`}
            >
              <div className="tutor-message-bubble">
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="tutor-message tutor">
              <div className="tutor-message-bubble typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="tutor-chat-footer">
        <div className="tutor-input-container">
          <input
            ref={inputRef}
            type="text"
            className="tutor-input"
            placeholder={`Type in ${activeLanguage}...`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            className="tutor-send-button"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || sending}
          >
            <SendIcon />
          </button>
        </div>
      </footer>
    </div>
  )
}

export default TutorChat
