import { useState, useRef, useEffect } from 'react'

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
)

const formatChatDate = (timestamp) => {
  if (!timestamp) return ''

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Today: show time
  if (diffDays === 0) {
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  // Yesterday
  if (diffDays === 1) return 'Yesterday'

  // This week: show day name
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }

  // Older: show date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const getChatTitle = (chat) => {
  if (chat.title) return chat.title

  // Default title is the date and time it was started
  const timestamp = chat.createdAt || chat.updatedAt
  if (timestamp) {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return 'New conversation'
}

const groupChatsByDate = (chats) => {
  const groups = {
    today: [],
    yesterday: [],
    previousWeek: [],
    previousMonth: [],
    older: [],
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const monthAgo = new Date(today)
  monthAgo.setDate(monthAgo.getDate() - 30)

  chats.forEach((chat) => {
    const chatDate = chat.updatedAt?.toDate ? chat.updatedAt.toDate() : new Date(chat.updatedAt || 0)

    if (chatDate >= today) {
      groups.today.push(chat)
    } else if (chatDate >= yesterday) {
      groups.yesterday.push(chat)
    } else if (chatDate >= weekAgo) {
      groups.previousWeek.push(chat)
    } else if (chatDate >= monthAgo) {
      groups.previousMonth.push(chat)
    } else {
      groups.older.push(chat)
    }
  })

  return groups
}

const ChatItem = ({ chat, isActive, onSelect, onDelete, onRename }) => {
  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    setEditTitle(getChatTitle(chat))
    setIsEditing(true)
    setShowMenu(false)
  }

  const handleSaveEdit = () => {
    if (editTitle.trim()) {
      onRename(chat.id, editTitle.trim())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  const handleDelete = () => {
    setShowMenu(false)
    if (window.confirm('Delete this conversation?')) {
      onDelete(chat.id)
    }
  }

  return (
    <div
      className={`tutor-sidebar-chat ${isActive ? 'active' : ''}`}
      onClick={() => !isEditing && onSelect(chat.id)}
    >
      <div className="tutor-sidebar-chat-content">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="tutor-sidebar-chat-edit"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="tutor-sidebar-chat-title">{getChatTitle(chat)}</span>
            <span className="tutor-sidebar-chat-date">{formatChatDate(chat.updatedAt)}</span>
          </>
        )}
      </div>
      <div className="tutor-sidebar-chat-actions" ref={menuRef}>
        <button
          className="tutor-sidebar-chat-menu-btn"
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
        >
          <MoreIcon />
        </button>
        {showMenu && (
          <div className="tutor-sidebar-chat-menu">
            <button onClick={handleStartEdit}>
              <EditIcon />
              <span>Rename</span>
            </button>
            <button onClick={handleDelete} className="danger">
              <TrashIcon />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const TutorSidebar = ({
  chats,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  isOpen,
  onToggle,
}) => {
  const groupedChats = groupChatsByDate(chats)

  const renderGroup = (title, chatList) => {
    if (chatList.length === 0) return null

    return (
      <div className="tutor-sidebar-group" key={title}>
        <div className="tutor-sidebar-group-title">{title}</div>
        {chatList.map((chat) => (
          <ChatItem
            key={chat.id}
            chat={chat}
            isActive={chat.id === currentChatId}
            onSelect={onSelectChat}
            onDelete={onDeleteChat}
            onRename={onRenameChat}
          />
        ))}
      </div>
    )
  }

  return (
    <aside className={`tutor-sidebar ${isOpen ? 'open' : 'closed'}`}>
      {/* Pull handle on the edge */}
      <button
        className="tutor-sidebar-handle"
        onClick={onToggle}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
          {isOpen ? (
            <polyline points="15 18 9 12 15 6" />
          ) : (
            <polyline points="9 18 15 12 9 6" />
          )}
        </svg>
      </button>

      <div className="tutor-sidebar-header">
        <span className="tutor-sidebar-title">Chat History</span>
        <button className="tutor-sidebar-new-btn" onClick={onNewChat} title="New chat">
          <PlusIcon />
        </button>
      </div>

      <nav className="tutor-sidebar-chats">
        {chats.length === 0 ? (
          <div className="tutor-sidebar-empty">
            <p>No conversations yet</p>
            <p className="muted small">Start a new chat to begin</p>
          </div>
        ) : (
          <>
            {renderGroup('Today', groupedChats.today)}
            {renderGroup('Yesterday', groupedChats.yesterday)}
            {renderGroup('Previous 7 days', groupedChats.previousWeek)}
            {renderGroup('Previous 30 days', groupedChats.previousMonth)}
            {renderGroup('Older', groupedChats.older)}
          </>
        )}
      </nav>
    </aside>
  )
}

export default TutorSidebar
