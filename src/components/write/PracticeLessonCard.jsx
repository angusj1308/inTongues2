import { ADAPTATION_LEVELS } from '../../services/practice'

const formatDate = (timestamp) => {
  if (!timestamp) return ''

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const getStatusLabel = (status, completedCount, totalCount) => {
  if (status === 'complete') return 'Complete'
  if (completedCount === 0) return 'Not started'
  return `${completedCount}/${totalCount} sentences`
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

const getProgressPercent = (completedCount, totalCount) => {
  if (!totalCount) return 0
  return Math.round((completedCount / totalCount) * 100)
}

const PracticeLessonCard = ({ lesson, onClick }) => {
  const levelInfo = ADAPTATION_LEVELS.find((l) => l.id === lesson.adaptationLevel)
  const levelLabel = levelInfo?.label || lesson.adaptationLevel
  const totalSentences = lesson.sentences?.length || 0
  const completedCount = lesson.completedCount || 0
  const progress = getProgressPercent(completedCount, totalSentences)

  return (
    <div
      className="writing-piece-card practice-lesson-card"
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
        <span className="writing-piece-type">Practice</span>
        <span className={`writing-piece-status ${getStatusClass(lesson.status)}`}>
          {getStatusLabel(lesson.status, completedCount, totalSentences)}
        </span>
      </div>
      <h4 className="writing-piece-title">{lesson.title || 'Untitled Lesson'}</h4>
      <div className="practice-lesson-meta">
        <span className="practice-lesson-level">{levelLabel}</span>
        <span className="practice-lesson-sentences">{totalSentences} sentences</span>
      </div>
      {totalSentences > 0 && (
        <div className="practice-lesson-progress">
          <div className="practice-lesson-progress-bar">
            <div
              className="practice-lesson-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="practice-lesson-progress-text">{progress}%</span>
        </div>
      )}
      <div className="writing-piece-meta">
        {formatDate(lesson.updatedAt || lesson.createdAt)}
      </div>
    </div>
  )
}

export default PracticeLessonCard
