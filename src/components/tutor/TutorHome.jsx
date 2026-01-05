import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getTutorProfile,
  createTutorChat,
  subscribeToTutorChat,
  addTutorMessage,
  getConversationContext,
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
  const [profile, setProfile] = useState(null)
  const [chat, setChat] = useState(null)
  const [chatId, setChatId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [startingChat, setStartingChat] = useState(false)
  const [error, setError] = useState(null)
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
        setError(null)
        const tutorProfile = await getTutorProfile(user.uid, activeLanguage, nativeLanguage || 'English')
        setProfile(tutorProfile)
      } catch (err) {
        console.error('Failed to load tutor profile:', err)
        setError('Failed to load tutor profile')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [user, activeLanguage, nativeLanguage])

  // Subscribe to active chat when chatId changes
  useEffect(() => {
    if (!user || !chatId) {
      return
    }

    console.log('Subscribing to chat:', chatId)
    const unsubscribe = subscribeToTutorChat(
      user.uid,
      chatId,
      (chatData) => {
        console.log('Chat updated:', chatData?.messages?.length, 'messages')
        setChat(chatData)
      },
      (err) => {
        console.error('Chat subscription error:', err)
        setError('Failed to load chat')
      }
    )

    return unsubscribe
  }, [user, chatId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages])

  const handleStartNewChat = useCallback(async () => {
    if (!user || !activeLanguage || startingChat) return

    console.log('Starting new chat...')
    setStartingChat(true)
    setError(null)

    try {
      // Create new chat in Firestore
      const newChat = await createTutorChat(user.uid)
      console.log('Chat created:', newChat.id)

      // Set chatId to trigger subscription
      setChatId(newChat.id)

      // Get tutor greeting from API
      console.log('Fetching greeting...')
      const response = await fetch('/api/tutor/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage || 'English',
          memory: profile?.memory,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      console.log('Greeting received:', data.greeting?.slice(0, 50))

      // Add greeting as first message
      await addTutorMessage(user.uid, newChat.id, {
        role: 'tutor',
        content: data.greeting,
      })
      console.log('Greeting message added')

    } catch (err) {
      console.error('Failed to start chat:', err)
      setError(`Failed to start chat: ${err.message}`)
    } finally {
      setStartingChat(false)
    }
  }, [user, activeLanguage, nativeLanguage, profile?.memory, startingChat])

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || !chat || !user || sending) return

    const messageText = inputValue.trim()
    setInputValue('')
    setSending(true)
    setError(null)

    try {
      // Add user message to Firestore
      await addTutorMessage(user.uid, chat.id, {
        role: 'user',
        content: messageText,
      })

      // Get conversation context for AI
      const history = getConversationContext(chat)
      history.push({ role: 'user', content: messageText })

      // Get tutor response from API
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

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      // Add tutor response to Firestore
      await addTutorMessage(user.uid, chat.id, {
        role: 'tutor',
        content: data.response,
      })

    } catch (err) {
      console.error('Failed to send message:', err)
      setError(`Failed to send message: ${err.message}`)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [inputValue, chat, user, sending, activeLanguage, nativeLanguage, profile?.memory])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

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

  const messages = chat?.messages || []
  const hasMessages = messages.length > 0

  return (
    <div className="tutor-home">
      {/* Error display */}
      {error && (
        <div className="tutor-error" style={{
          padding: '0.75rem 1rem',
          background: '#fef2f2',
          color: '#dc2626',
          borderRadius: '8px',
          marginBottom: '1rem',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

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

      {/* New Chat button */}
      {hasMessages && (
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
