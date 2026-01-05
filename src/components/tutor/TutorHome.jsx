import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getTutorProfile,
  createTutorChat,
  subscribeToTutorChats,
  addTutorMessage,
  getConversationContext,
  updateTutorMemory,
} from '../../services/tutor'

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const TutorHome = ({ activeLanguage, nativeLanguage }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [chats, setChats] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [startingChat, setStartingChat] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Load tutor profile
  useEffect(() => {
    if (!user || !activeLanguage) {
      setProfile(null)
      setLoading(false)
      return
    }

    const loadProfile = async () => {
      try {
        const tutorProfile = await getTutorProfile(user.uid, activeLanguage, nativeLanguage || 'English')
        setProfile(tutorProfile)
      } catch (err) {
        console.error('Failed to load tutor profile:', err)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [user, activeLanguage, nativeLanguage])

  // Subscribe to chats
  useEffect(() => {
    if (!user) {
      setChats([])
      return
    }

    const unsubscribe = subscribeToTutorChats(
      user.uid,
      (nextChats) => {
        setChats(nextChats)
        // Auto-select most recent chat if none selected
        if (nextChats.length > 0 && !activeChat) {
          setActiveChat(nextChats[0])
        }
      },
      (err) => console.error('Chat subscription error:', err)
    )

    return unsubscribe
  }, [user])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages])

  const handleStartNewChat = async () => {
    if (!user || !activeLanguage || startingChat) return

    setStartingChat(true)
    try {
      // Create new chat
      const newChat = await createTutorChat(user.uid)
      setActiveChat(newChat)

      // Get tutor greeting
      const response = await fetch('/api/tutor/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage || 'English',
          memory: profile?.memory,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Add greeting as first message
        await addTutorMessage(user.uid, newChat.id, {
          role: 'tutor',
          content: data.greeting,
        })
      }
    } catch (err) {
      console.error('Failed to start chat:', err)
    } finally {
      setStartingChat(false)
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !activeChat || !user || sending) return

    const messageText = inputValue.trim()
    setInputValue('')
    setSending(true)

    try {
      // Add user message
      await addTutorMessage(user.uid, activeChat.id, {
        role: 'user',
        content: messageText,
      })

      // Get conversation context
      const history = getConversationContext(activeChat)
      history.push({ role: 'user', content: messageText })

      // Get tutor response
      const response = await fetch('/api/tutor/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage || 'English',
          conversationHistory: history,
          memory: profile?.memory,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Add tutor response
        await addTutorMessage(user.uid, activeChat.id, {
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

  // Re-sync activeChat when chats update
  useEffect(() => {
    if (activeChat && chats.length > 0) {
      const updated = chats.find((c) => c.id === activeChat.id)
      if (updated) {
        setActiveChat(updated)
      }
    }
  }, [chats])

  if (!activeLanguage) {
    return (
      <div className="tutor-home">
        <p className="muted small" style={{ marginTop: '0.75rem' }}>
          Add a language to start chatting with your tutor.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="tutor-home">
        <p className="muted small">Loading your tutor...</p>
      </div>
    )
  }

  const messages = activeChat?.messages || []
  const hasMessages = messages.length > 0

  return (
    <div className="tutor-home">
      {/* Chat Interface */}
      <div className="tutor-chat-container">
        {/* Messages Area */}
        <div className="tutor-messages-area">
          {!hasMessages ? (
            <div className="tutor-empty-state">
              <div className="tutor-empty-icon">
                <ChatIcon />
              </div>
              <h3>Chat with your Tutor</h3>
              <p className="muted">
                Start a conversation in {activeLanguage}. Your tutor will chat naturally and help you improve.
              </p>
              <button
                className="button primary"
                onClick={handleStartNewChat}
                disabled={startingChat}
              >
                {startingChat ? 'Starting...' : 'Start Chatting'}
              </button>
            </div>
          ) : (
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
          )}
        </div>

        {/* Input Area */}
        {hasMessages && (
          <div className="tutor-input-area">
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
          </div>
        )}
      </div>

      {/* Chat History Sidebar (collapsed for now) */}
      {chats.length > 1 && (
        <div className="tutor-history-hint">
          <button
            className="button ghost small"
            onClick={handleStartNewChat}
            disabled={startingChat}
          >
            + New Chat
          </button>
        </div>
      )}
    </div>
  )
}

export default TutorHome
