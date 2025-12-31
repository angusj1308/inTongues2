import { TEXT_TYPES } from '../../services/writing'

const formatDate = (timestamp) => {
  if (!timestamp) return ''

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const getSnippet = (content, maxLength = 80) => {
  if (!content) return 'No content yet...'
  const trimmed = content.trim()
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength).trim() + '...'
}

const getStatusLabel = (status) => {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'submitted':
      return 'Awaiting Feedback'
    case 'complete':
      return 'Complete'
    default:
      return status
  }
}

const getStatusClass = (status) => {
  switch (status) {
    case 'draft':
      return 'status-draft'
    case 'submitted':
      return 'status-submitted'
    case 'complete':
      return 'status-complete'
    default:
      return ''
  }
}

const WritingPieceCard = ({ piece, onClick }) => {
  const typeInfo = TEXT_TYPES.find((t) => t.id === piece.textType)
  const typeLabel = typeInfo?.label || piece.textType

  return (
    <div
      className="writing-piece-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick()
        }
      }}
    >
      <div className="writing-piece-header">
        <span className="writing-piece-type">{typeLabel}</span>
        <span className={`writing-piece-status ${getStatusClass(piece.status)}`}>
          {getStatusLabel(piece.status)}
        </span>
      </div>
      <h4 className="writing-piece-title">{piece.title || 'Untitled'}</h4>
      <p className="writing-piece-snippet">{getSnippet(piece.content)}</p>
      <div className="writing-piece-meta">
        {formatDate(piece.updatedAt || piece.createdAt)}
      </div>
    </div>
  )
}

export default WritingPieceCard
