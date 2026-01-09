import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
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
  updateTutorSettings,
} from '../services/tutor'
import { loadUserVocab, normaliseExpression } from '../services/vocab'
import { HIGHLIGHT_COLOR, STATUS_OPACITY } from '../constants/highlightColors'
import TutorSidebar from '../components/tutor/TutorSidebar'
import TutorControlPanel from '../components/tutor/TutorControlPanel'
import TutorVoiceInput from '../components/tutor/TutorVoiceInput'
import TutorVoiceCall from '../components/tutor/TutorVoiceCall'
import TutorVocabPanel from '../components/tutor/TutorVocabPanel'

// Get highlight style for a word based on status
const getHighlightStyle = (status, enableHighlight) => {
  if (!enableHighlight) return {}

  const opacity = STATUS_OPACITY[status]
  if (!opacity || opacity === 0) return {}

  return {
    '--hlt-color': HIGHLIGHT_COLOR,
    '--hlt-opacity': opacity,
    backgroundColor: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${opacity * 100}%, transparent)`,
    borderRadius: '2px',
    padding: '0 2px',
    margin: '0 -2px',
  }
}

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
)

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const ChevronUpIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

// WhatsApp-style voice message player with collapsible transcript
const VoiceMessagePlayer = ({ audioUrl, transcript, isUserMessage, showTranscriptByDefault = false }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showTranscript, setShowTranscript] = useState(showTranscriptByDefault)
  const audioRef = useRef(null)

  // Generate stable random bar heights (won't change on re-render)
  const barHeights = useMemo(() =>
    [...Array(20)].map(() => 20 + Math.random() * 60),
    [] // Empty deps = generate once per component mount
  )

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handlePause = () => setIsPlaying(false)
    const handlePlay = () => setIsPlaying(true)

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('play', handlePlay)

    // Try to get duration if already loaded
    if (audio.readyState >= 1 && audio.duration && isFinite(audio.duration)) {
      setDuration(audio.duration)
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('play', handlePlay)
    }
  }, [audioUrl])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }

  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!audioUrl) return null

  return (
    <div className={`voice-message ${isUserMessage ? 'user' : 'assistant'}`}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="voice-message-main">
        <button className="voice-message-play" onClick={togglePlay}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="voice-message-waveform">
          <div className="voice-message-progress" style={{ width: `${progress}%` }} />
          <div className="voice-message-bars">
            {barHeights.map((height, i) => (
              <div key={i} className="voice-message-bar" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>

        <span className="voice-message-time">
          {isPlaying ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>

      {transcript && (
        <button
          className="voice-message-transcript-toggle"
          onClick={() => setShowTranscript(!showTranscript)}
        >
          {showTranscript ? <ChevronUpIcon /> : <ChevronDownIcon />}
          <span>{showTranscript ? 'Hide transcript' : 'Show transcript'}</span>
        </button>
      )}

      {showTranscript && transcript && (
        <div className="voice-message-transcript">
          {transcript}
        </div>
      )}
    </div>
  )
}

const DEFAULT_SETTINGS = {
  showWordStatus: false,
  correctionsEnabled: true,
  grammarExplanations: true,
  showAudioTranscript: false,
  languageLevel: 'intermediate',
  responseStyle: 'neutral',
  responseLength: 'medium',
  autoPlayResponses: false,
  speechSpeed: 'normal',
  focusAreas: [],
}

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

  // Voice features state
  const [isRecording, setIsRecording] = useState(false)
  const [isInCall, setIsInCall] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  // Word status vocabulary
  const [userVocab, setUserVocab] = useState({})

  // Header state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  })

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const textareaRef = useRef(null)
  const titleInputRef = useRef(null)

  const activeLanguage = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')

  // Get chat title for header
  const getChatTitle = () => {
    if (!currentChat) return 'New Chat'
    if (currentChat.title) return currentChat.title

    // Default title is date and time
    const timestamp = currentChat.createdAt || currentChat.updatedAt
    if (timestamp) {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    }

    return 'New Chat'
  }

  // Handle title click to edit
  const handleTitleClick = () => {
    if (!currentChat) return
    setEditTitleValue(getChatTitle())
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  // Save edited title
  const handleTitleSave = async () => {
    if (editTitleValue.trim() && currentChat && user) {
      await renameTutorChat(user.uid, currentChat.id, editTitleValue.trim())
    }
    setIsEditingTitle(false)
  }

  // Handle title input keydown
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false)
    }
  }

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !darkMode
    setDarkMode(newMode)
    document.documentElement.setAttribute('data-theme', newMode ? 'dark' : 'light')
  }

  // Load tutor profile
  useEffect(() => {
    if (!user || !activeLanguage) return

    const loadProfile = async () => {
      try {
        const tp = await getTutorProfile(user.uid, activeLanguage, nativeLanguage)
        setTutorProfile(tp)
        // Load settings from profile
        if (tp.settings) {
          setSettings((prev) => ({ ...prev, ...tp.settings }))
        }
      } catch (err) {
        console.error('Failed to load tutor profile:', err)
      }
    }

    loadProfile()
  }, [user, activeLanguage, nativeLanguage])

  // Load user vocabulary for word status highlighting
  useEffect(() => {
    if (!user || !activeLanguage) return

    const loadVocab = async () => {
      try {
        const vocab = await loadUserVocab(user.uid, activeLanguage)
        setUserVocab(vocab)
      } catch (err) {
        console.warn('Could not load vocab:', err)
      }
    }

    loadVocab()
  }, [user, activeLanguage])

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
    if (currentChat && textareaRef.current && !isRecording && !isInCall) {
      textareaRef.current.focus()
    }
  }, [currentChat, isRecording, isInCall])

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

  const handleSettingsChange = useCallback(async (newSettings) => {
    setSettings(newSettings)
    // Persist settings
    if (user) {
      try {
        await updateTutorSettings(user.uid, newSettings)
      } catch (err) {
        console.error('Failed to save settings:', err)
      }
    }
  }, [user])

  const handleSendMessage = useCallback(async (messageText, audioBlob, audioUrl) => {
    const text = messageText || inputValue.trim()
    if (!text || !user || sending) return

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
        content: text,
        type: audioBlob ? 'voice' : 'text',
        audioUrl: audioUrl || null,
      })

      // Get conversation context
      const history = currentChat ? getConversationContext(currentChat) : []
      history.push({ role: 'user', content: text })

      // Get tutor response with settings
      const response = await fetch('/api/tutor/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage,
          conversationHistory: history,
          memory: tutorProfile?.memory,
          settings: {
            correctionsEnabled: settings.correctionsEnabled,
            languageLevel: settings.languageLevel,
            responseStyle: settings.responseStyle,
            responseLength: settings.responseLength,
            focusAreas: settings.focusAreas,
          },
        }),
      })

      if (response.ok) {
        const data = await response.json()
        await addTutorMessage(user.uid, activeChatId, {
          role: 'tutor',
          content: data.response,
        })

        // Always speak tutor response using ElevenLabs
        speakText(data.response)

        // Auto-generate title after first exchange (when chat has no custom title yet)
        const updatedMessages = [...history, { role: 'user', content: text }, { role: 'tutor', content: data.response }]
        if (updatedMessages.length === 2 && !currentChat?.title) {
          try {
            const titleResponse = await fetch('/api/tutor/generate-title', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: updatedMessages,
                language: activeLanguage,
              }),
            })
            const titleData = await titleResponse.json()
            if (titleData.title) {
              await renameTutorChat(user.uid, activeChatId, titleData.title)
            }
          } catch (titleErr) {
            console.error('Failed to generate title:', titleErr)
          }
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
      setIsRecording(false)
      textareaRef.current?.focus()
    }
  }, [inputValue, user, sending, chatId, currentChat, activeLanguage, nativeLanguage, tutorProfile?.memory, settings, navigate])

  // Play tutor response using ElevenLabs TTS
  const speakText = async (text) => {
    try {
      // Call the tutor TTS endpoint with male voice
      const response = await fetch('/api/tutor/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: activeLanguage || 'Spanish',
          voiceGender: 'male'
        }),
      })

      if (!response.ok) {
        throw new Error('TTS request failed')
      }

      const data = await response.json()

      // Convert base64 to audio and play
      const audioData = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)

      const audio = new Audio(audioUrl)
      audio.playbackRate = settings.speechSpeed === 'slow' ? 0.9 : settings.speechSpeed === 'fast' ? 1.1 : 1.0
      await audio.play()

      // Clean up URL after playback
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
      }
    } catch (err) {
      console.error('TTS error:', err)
      // Fallback to browser TTS
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = activeLanguage === 'Spanish' ? 'es' : activeLanguage === 'French' ? 'fr' : activeLanguage === 'Italian' ? 'it' : 'en'
      utterance.rate = settings.speechSpeed === 'slow' ? 0.8 : settings.speechSpeed === 'fast' ? 1.2 : 1.0
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleRecordAudio = () => {
    if (isInCall) return
    setIsRecording(!isRecording)
  }

  const handleVoiceCall = () => {
    if (isRecording) return
    setIsInCall(!isInCall)
  }

  const handleVoiceMessage = (text, audioBlob, audioUrl) => {
    handleSendMessage(text, audioBlob, audioUrl)
  }

  const handleVoiceCallMessage = ({ role, content }) => {
    // Messages are added directly in voice call, but we track them here
    console.log('Voice call message:', role, content)
  }

  const handleVoiceCallEnd = () => {
    setIsInCall(false)
  }

  // Handle vocab updates from the vocab panel
  const handleVocabUpdate = useCallback((normalised, vocabEntry) => {
    setUserVocab(prev => ({
      ...prev,
      [normalised]: vocabEntry
    }))
  }, [])

  const messages = currentChat?.messages || []

  // Render text with word status highlighting
  const renderMessageText = useCallback((text, role) => {
    if (!settings.showWordStatus || role !== 'tutor' || !text) {
      return text
    }

    // Tokenize: split into words and non-word characters
    const tokens = text.split(/(\s+|[.,!?;:""''«»„"‚'¿¡—–\-()[\]{}])/g).filter(Boolean)

    return tokens.map((token, idx) => {
      // Skip whitespace and punctuation
      if (/^\s+$/.test(token) || /^[.,!?;:""''«»„"‚'¿¡—–\-()[\]{}]+$/.test(token)) {
        return <span key={idx}>{token}</span>
      }

      // Check word status in vocab
      const normalised = normaliseExpression(token)
      const vocabEntry = userVocab[normalised]
      const status = vocabEntry?.status || 'new'

      // Get highlight style
      const style = getHighlightStyle(status, true)

      return (
        <span key={idx} style={style}>
          {token}
        </span>
      )
    })
  }, [settings.showWordStatus, userVocab, activeLanguage])

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
          <div className="tutor-header-left">
            <button
              className="tutor-sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <a href="/dashboard" className="tutor-back-link">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Dashboard</span>
            </a>
          </div>

          <div className="tutor-header-center">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="tutor-header-title-input"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
              />
            ) : (
              <h1
                className="tutor-header-title"
                onClick={handleTitleClick}
                title="Click to rename"
              >
                {getChatTitle()}
              </h1>
            )}
          </div>

          <div className="tutor-header-right">
            <button
              className={`tutor-header-btn ${settings.showWordStatus ? 'active' : ''}`}
              onClick={() => handleSettingsChange({ ...settings, showWordStatus: !settings.showWordStatus })}
              title="Word Status"
            >
              <span className="tutor-header-aa">Aa</span>
            </button>
            <button
              className="tutor-header-btn"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
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
              )}
            </button>
          </div>
        </header>

        {/* Voice Call Overlay */}
        {isInCall && (
          <TutorVoiceCall
            onEnd={handleVoiceCallEnd}
            onMessage={handleVoiceCallMessage}
            activeLanguage={activeLanguage}
            nativeLanguage={nativeLanguage}
            tutorProfile={tutorProfile}
            settings={settings}
            conversationHistory={currentChat ? getConversationContext(currentChat) : []}
            userName={profile?.displayName}
          />
        )}

        {/* Messages Container */}
        {!isInCall && (
          <div className="tutor-messages-container">
            {messages.length === 0 ? (
              <div className="tutor-welcome">
                <p className="tutor-welcome-text">
                  {activeLanguage
                    ? `Start a conversation in ${activeLanguage}`
                    : 'Select a language to begin'}
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
                      {/* Voice message - WhatsApp style */}
                      {msg.type === 'voice' && msg.audioUrl ? (
                        <VoiceMessagePlayer
                          audioUrl={msg.audioUrl}
                          transcript={msg.content}
                          isUserMessage={msg.role === 'user'}
                          showTranscriptByDefault={settings.showAudioTranscript}
                        />
                      ) : (
                        /* Text message */
                        <div className="tutor-msg-text">
                          {renderMessageText(msg.content, msg.role)}
                        </div>
                      )}

                      {/* Vocab panel for tutor messages */}
                      {msg.role !== 'user' && (
                        <TutorVocabPanel
                          messageText={msg.content}
                          userVocab={userVocab}
                          language={activeLanguage}
                          nativeLanguage={nativeLanguage}
                          userId={user?.uid}
                          onVocabUpdate={handleVocabUpdate}
                        />
                      )}
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
        )}

        {/* Input Area */}
        {!isInCall && (
          <div className="tutor-input-wrapper">
            {/* Control Panel - Settings only */}
            <TutorControlPanel
              settings={settings}
              onSettingsChange={handleSettingsChange}
              activeLanguage={activeLanguage}
            />

            {/* Voice Recording Input */}
            {isRecording ? (
              <TutorVoiceInput
                onSend={handleVoiceMessage}
                onCancel={() => setIsRecording(false)}
                disabled={sending}
                activeLanguage={activeLanguage}
              />
            ) : (
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
                <div className="tutor-input-actions">
                  <button
                    className="tutor-action-btn"
                    onClick={handleRecordAudio}
                    disabled={!activeLanguage}
                    aria-label="Record voice message"
                    title="Record"
                  >
                    <MicIcon />
                  </button>
                  <button
                    className="tutor-action-btn"
                    onClick={handleVoiceCall}
                    disabled={!activeLanguage}
                    aria-label="Start voice call"
                    title="Call"
                  >
                    <PhoneIcon />
                  </button>
                  <button
                    className="tutor-action-btn send"
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || sending || !activeLanguage}
                    aria-label="Send message"
                    title="Send"
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default TutorPage
