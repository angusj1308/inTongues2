const formatDate = (timestamp) => {
  if (!timestamp) return ''

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const getStatusLabel = (lesson) => {
  if (lesson.status === 'complete') return 'Complete'
  if (lesson.lineCount === 0) return 'Not started'
  return `${lesson.wordCount || 0} words`
}

const getStatusClass = (status) => {
  switch (status) {
    case 'complete':
      return 'status-complete'
    case 'in_progress':
      return 'status-in-progress'
    default:
      return 'status-draft'
  }
}

const capitalizeFirst = (str) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ')
}

const FreeWritingCard = ({ lesson, onClick, onDelete }) => {
  const textType = capitalizeFirst(lesson.textType || 'writing')

  const handleClick = () => {
    onClick()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClick()
    }
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm(`Delete "${lesson.title || 'Untitled'}"?`)) {
      onDelete(lesson.id)
    }
  }

  return (
    <div
      className="writing-piece-card free-writing-card"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="writing-piece-header">
        <span className="writing-piece-type">{textType}</span>
        <span className={`writing-piece-status ${getStatusClass(lesson.status)}`}>
          {getStatusLabel(lesson)}
        </span>
        {onDelete && (
          <button
            className="delete-btn"
            onClick={handleDelete}
            aria-label="Delete writing"
            title="Delete"
          >
            &times;
          </button>
        )}
      </div>
      <h4 className="writing-piece-title">{lesson.title || 'Untitled'}</h4>
      <div className="practice-lesson-meta">
        <span className="practice-lesson-sentences">
          {lesson.lineCount || 0} lines
        </span>
      </div>
      <div className="writing-piece-meta">
        {formatDate(lesson.updatedAt || lesson.createdAt)}
      </div>
    </div>
  )
}

export default FreeWritingCard
