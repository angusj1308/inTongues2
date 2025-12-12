const normaliseProgress = (value) => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value <= 1) return value * 100
  return Math.min(value, 100)
}

const ListeningMediaCard = ({
  type = 'audio',
  title,
  channel,
  thumbnailUrl,
  onPlay,
  onDelete,
  progress = 0,
  actionLabel,
  tags = [],
  placeholder,
}) => {
  const cardActionLabel = actionLabel || (type === 'youtube' ? 'Watch →' : 'Play →')
  const progressPercent = normaliseProgress(progress)
  const handleKeyDown = (event) => {
    if (!onPlay) return

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlay()
    }
  }

  return (
    <div
      className={`preview-card listen-card media-card media-card-${type} listening-media-card listening-media-card-${type}`}
      onClick={onPlay}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="media-card-main">
        <div className="media-card-thumbnail">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={title || 'Listening item'} />
          ) : (
            <div className="media-card-thumb-placeholder">
              {placeholder || <span className="ui-text">No image available</span>}
            </div>
          )}
        </div>

        <div className="media-card-body">
          <div className="listening-card-content">
            <div className="media-card-title">{title || 'Untitled item'}</div>
            {channel && <div className="media-card-subtitle ui-text">{channel}</div>}

            {tags?.length > 0 && (
              <div className="media-card-tags ui-text">
                {tags.filter(Boolean).map((tag) => (
                  <span key={tag} className="media-card-tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="listening-card-footer">
            <div className="media-card-actions">
              {onPlay && (
                <button
                  type="button"
                  className="button media-card-primary"
                  onClick={(event) => {
                    event.stopPropagation()
                    onPlay()
                  }}
                >
                  {cardActionLabel}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="media-card-delete ui-text"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete()
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {progressPercent > 0 && (
        <div className="media-card-progress">
          <div className="media-card-progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
    </div>
  )
}
export default ListeningMediaCard
