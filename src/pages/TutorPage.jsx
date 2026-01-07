import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import {
  getTutorProfile,
  createTutorChat,
  subscribeToTutorChat,
  subscribeToTutorChats,
  addTutorMessage,
  getConversationContext,
  deleteTutorChat,
  renameTutorChat,
} from '../services/tutor'
import TutorSidebar from '../components/tutor/TutorSidebar'

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
)

const TutorPage = () => {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [tutorProfile, setTutorProfile] = useState(null)
  const [chats, setChats] = useState([])
  const [currentChat, setCurrentChat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const textareaRef = useRef(null)

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

  // Subscribe to all chats for sidebar
  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const unsubscribe = subscribeToTutorChats(
      user.uid,
      (chatsList) => {
        setChats(chatsList)
        setLoading(false)
      },
      (err) => {
        console.error('Failed to load chats:', err)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [user])

  // Subscribe to current chat when chatId changes
  useEffect(() => {
    if (!user || !chatId) {
      setCurrentChat(null)
      return
    }

    const unsubscribe = subscribeToTutorChat(
      user.uid,
      chatId,
      (chatData) => {
        setCurrentChat(chatData)
      },
      (err) => {
        console.error('Chat load error:', err)
        setCurrentChat(null)
      }
    )

    return unsubscribe
  }, [user, chatId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentChat?.messages])

  // Focus input when chat loads
  useEffect(() => {
    if (currentChat && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [currentChat])

  // Auto-resize textarea
  const handleTextareaChange = (e) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const handleNewChat = useCallback(async () => {
    if (!user) return

    try {
      const newChat = await createTutorChat(user.uid)
      navigate(`/tutor/${newChat.id}`)
    } catch (err) {
      console.error('Failed to create chat:', err)
    }
  }, [user, navigate])

  const handleSelectChat = useCallback((selectedChatId) => {
    navigate(`/tutor/${selectedChatId}`)
  }, [navigate])

  const handleDeleteChat = useCallback(async (chatIdToDelete) => {
    if (!user) return

    try {
      await deleteTutorChat(user.uid, chatIdToDelete)
      // If deleting current chat, navigate to tutor home
      if (chatIdToDelete === chatId) {
        navigate('/tutor')
      }
    } catch (err) {
      console.error('Failed to delete chat:', err)
    }
  }, [user, chatId, navigate])

  const handleRenameChat = useCallback(async (chatIdToRename, newTitle) => {
    if (!user) return

    try {
      await renameTutorChat(user.uid, chatIdToRename, newTitle)
    } catch (err) {
      console.error('Failed to rename chat:', err)
    }
  }, [user])

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || !user || sending) return

    const messageText = inputValue.trim()
    setInputValue('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    setSending(true)

    try {
      let activeChatId = chatId

      // If no current chat, create one first
      if (!activeChatId) {
        const newChat = await createTutorChat(user.uid)
        activeChatId = newChat.id
        navigate(`/tutor/${newChat.id}`, { replace: true })
      }

      // Add user message
      await addTutorMessage(user.uid, activeChatId, {
        role: 'user',
        content: messageText,
      })

      // Get conversation context
      const history = currentChat ? getConversationContext(currentChat) : []
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
        await addTutorMessage(user.uid, activeChatId, {
          role: 'tutor',
          content: data.response,
        })
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [inputValue, user, sending, chatId, currentChat, activeLanguage, nativeLanguage, tutorProfile?.memory, navigate])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const messages = currentChat?.messages || []

  return (
    <div className="tutor-page">
      {/* Sidebar */}
      <TutorSidebar
        chats={chats}
        currentChatId={chatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Chat Area */}
      <main className={`tutor-main ${sidebarOpen ? '' : 'sidebar-closed'}`}>
        {/* Header */}
        <header className="tutor-header">
          <button
            className="tutor-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <h1 className="tutor-header-title">
            {activeLanguage ? `${activeLanguage} Tutor` : 'Tutor'}
          </h1>
          <div className="tutor-header-spacer" />
        </header>

        {/* Messages Container */}
        <div className="tutor-messages-container">
          {messages.length === 0 ? (
            <div className="tutor-welcome">
              <div className="tutor-welcome-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" strokeLinecap="round" />
                  <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <h2>How can I help you today?</h2>
              <p className="tutor-welcome-subtitle">
                {activeLanguage
                  ? `Start a conversation in ${activeLanguage}. I'll help you practice and improve.`
                  : 'Select a language to start learning.'}
              </p>
            </div>
          ) : (
            <div className="tutor-messages-list">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`tutor-msg ${msg.role === 'user' ? 'tutor-msg-user' : 'tutor-msg-assistant'}`}
                >
                  <div className="tutor-msg-avatar">
                    {msg.role === 'user' ? (
                      <div className="tutor-avatar-user">
                        {profile?.displayName?.[0]?.toUpperCase() || 'U'}
                      </div>
                    ) : (
                      <div className="tutor-avatar-assistant">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="tutor-msg-content">
                    <div className="tutor-msg-role">
                      {msg.role === 'user' ? 'You' : 'Tutor'}
                    </div>
                    <div className="tutor-msg-text">{msg.content}</div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="tutor-msg tutor-msg-assistant">
                  <div className="tutor-msg-avatar">
                    <div className="tutor-avatar-assistant">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="tutor-msg-content">
                    <div className="tutor-msg-role">Tutor</div>
                    <div className="tutor-msg-typing">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="tutor-input-wrapper">
          <div className="tutor-input-box">
            <textarea
              ref={textareaRef}
              className="tutor-textarea"
              placeholder={activeLanguage ? `Message your ${activeLanguage} tutor...` : 'Select a language first...'}
              value={inputValue}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={sending || !activeLanguage}
              rows={1}
            />
            <button
              className="tutor-send-btn"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || sending || !activeLanguage}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
          <p className="tutor-input-hint">
            Press Enter to send, Shift + Enter for new line
          </p>
        </div>
      </main>
    </div>
  )
}

export default TutorPage
