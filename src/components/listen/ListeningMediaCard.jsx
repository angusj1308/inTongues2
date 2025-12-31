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
  status,
  preparationStatus,
  preparationProgress = 0,
}) => {
  const isYouTube = type === 'youtube'
  const progressPercent = normaliseProgress(progress)
  const prepProgress = normaliseProgress(preparationProgress)

  // Video is importing (transcript being generated)
  const isImporting = status === 'importing'
  const importFailed = status === 'failed'

  // Content is preparing when status is 'pending' or 'preparing' (pronunciation caching)
  const isPreparing = preparationStatus === 'pending' || preparationStatus === 'preparing'
  const prepFailed = preparationStatus === 'error'

  // Overall: blocked if importing OR preparing
  const isBlocked = isImporting || isPreparing

  // Determine action label and disabled state
  let cardActionLabel = actionLabel || (isYouTube ? 'Watch →' : 'Play →')
  if (isImporting) {
    cardActionLabel = 'Importing...'
  } else if (importFailed) {
    cardActionLabel = 'Import failed'
  } else if (isPreparing) {
    cardActionLabel = prepProgress > 0 ? `Preparing ${Math.round(prepProgress)}%` : 'Preparing...'
  } else if (prepFailed) {
    cardActionLabel = 'Retry'
  }
  const handleKeyDown = (event) => {
    if (!onPlay || isBlocked) return

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlay()
    }
  }

  const handleCardClick = () => {
    if (isBlocked || !onPlay) return
    onPlay()
  }

  return (
    <div
      className={`preview-card listen-card media-card media-card-${type} listening-media-card listening-media-card-${type}${isBlocked ? ' is-preparing' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={isBlocked ? -1 : 0}
      aria-disabled={isBlocked}
    >
      <div className="media-card-main">
        {isYouTube ? (
          <div className="media-card-youtube-inner">
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
                      className={`button media-card-primary${isBlocked ? ' is-loading' : ''}`}
                      disabled={isBlocked}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!isBlocked) onPlay()
                      }}
                    >
                      {cardActionLabel}
                    </button>
                  )}
                  {onDelete && !isBlocked && (
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
        ) : (
          <>
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
                      className={`button media-card-primary${isBlocked ? ' is-loading' : ''}`}
                      disabled={isBlocked}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!isBlocked) onPlay()
                      }}
                    >
                      {cardActionLabel}
                    </button>
                  )}
                  {onDelete && !isBlocked && (
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
          </>
        )}
      </div>

      {/* Show preparation progress when preparing, otherwise show playback progress */}
      {isPreparing && prepProgress > 0 ? (
        <div className="media-card-progress media-card-progress-preparing">
          <div className="media-card-progress-bar" style={{ width: `${prepProgress}%` }} />
        </div>
      ) : progressPercent > 0 ? (
        <div className="media-card-progress">
          <div className="media-card-progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}
    </div>
  )
}
export default ListeningMediaCard
