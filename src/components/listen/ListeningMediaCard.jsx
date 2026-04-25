const normaliseProgress = (value) => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value <= 1) return value * 100
  return Math.min(value, 100)
}

// Audiobook cards mirror the reader library's portrait book-tile look exactly
// (`.reading-shelf-*`). YouTube/Spotify cards keep the landscape 16:9
// `.media-card-yt-*` layout, which fits video thumbnails better.
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
  const isAudiobook = type === 'audio'
  const progressPercent = normaliseProgress(progress)
  const prepProgress = normaliseProgress(preparationProgress)

  const isDubbing = status === 'dubbing'
  const isImporting = status === 'importing' || isDubbing
  const importFailed = status === 'failed'
  const isPreparing = preparationStatus === 'pending' || preparationStatus === 'preparing'
  const prepFailed = preparationStatus === 'error'
  const isBlocked = isImporting || isPreparing

  let cardActionLabel = actionLabel || (isYouTube ? 'Watch →' : 'Play →')
  if (isDubbing) cardActionLabel = 'Dubbing...'
  else if (isImporting) cardActionLabel = 'Importing...'
  else if (importFailed) cardActionLabel = 'Import failed'
  else if (isPreparing) cardActionLabel = prepProgress > 0 ? `Preparing ${Math.round(prepProgress)}%` : 'Preparing...'
  else if (prepFailed) cardActionLabel = 'Retry'

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

  const fallbackLabel = isYouTube ? 'No thumbnail' : 'No cover'

  if (isAudiobook) {
    const metaLines = [channel, ...(tags || []).filter(Boolean)].filter(Boolean)
    return (
      <div className={`reading-shelf-item${isBlocked ? ' reading-shelf-item--generating' : ''}`}>
        {onDelete && !isBlocked && (
          <button
            type="button"
            className="book-delete-btn"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            aria-label="Delete audiobook"
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="reading-shelf-item-content"
          onClick={handleCardClick}
          onKeyDown={handleKeyDown}
          disabled={isBlocked}
        >
          <div className="reading-shelf-cover">
            {thumbnailUrl ? (
              <img className="reading-shelf-cover-img" src={thumbnailUrl} alt={title || 'Audiobook'} />
            ) : (
              <div className="reading-shelf-no-cover">
                <span>{title || fallbackLabel}</span>
              </div>
            )}

            {isBlocked ? (
              <div className="reading-shelf-generating-overlay">
                <div className="reading-shelf-spinner" />
                <span className="reading-shelf-generating-text">{cardActionLabel}</span>
                {isPreparing && prepProgress > 0 && (
                  <div className="reading-shelf-hover-progress" style={{ width: '60%' }}>
                    <div className="reading-shelf-hover-progress-bar" style={{ width: `${prepProgress}%` }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="reading-shelf-hover-overlay">
                <div className="reading-shelf-hover-title">{title || 'Untitled audiobook'}</div>
                {metaLines.map((line, i) => (
                  <div key={i} className="reading-shelf-hover-meta">{line}</div>
                ))}
                {progressPercent > 0 && (
                  <div className="reading-shelf-hover-progress">
                    <div className="reading-shelf-hover-progress-bar" style={{ width: `${progressPercent}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`media-card-yt-item${isBlocked ? ' media-card-yt-item--blocked' : ''}`}
      role="button"
      tabIndex={isBlocked ? -1 : 0}
      aria-disabled={isBlocked}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      {onDelete && !isBlocked && (
        <button
          type="button"
          className="media-card-yt-delete-btn"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          aria-label={isYouTube ? 'Delete video' : 'Delete item'}
        >
          ×
        </button>
      )}

      <div className="media-card-yt-cover">
        {thumbnailUrl ? (
          <img className="media-card-yt-cover-img" src={thumbnailUrl} alt={title || 'Listening item'} />
        ) : (
          <div className="media-card-yt-no-cover">
            {placeholder || <span className="ui-text">{fallbackLabel}</span>}
          </div>
        )}

        {isBlocked && (
          <div className="media-card-yt-blocked-overlay">
            <div className="media-card-yt-spinner" />
            <span className="media-card-yt-blocked-text">{cardActionLabel}</span>
            {isPreparing && prepProgress > 0 && (
              <div className="media-card-yt-prep-progress">
                <div className="media-card-yt-prep-progress-bar" style={{ width: `${prepProgress}%` }} />
              </div>
            )}
          </div>
        )}

        {!isBlocked && (
          <div className="media-card-yt-hover-overlay">
            <div className="media-card-yt-hover-title">{title || (isYouTube ? 'Untitled video' : 'Untitled item')}</div>
            {channel && <div className="media-card-yt-hover-channel">{channel}</div>}
            {tags?.length > 0 && (
              <div className="media-card-yt-hover-tags">
                {tags.filter(Boolean).map((tag) => (
                  <span key={tag} className="media-card-yt-hover-tag">{tag}</span>
                ))}
              </div>
            )}
            {onPlay && <span className="media-card-yt-hover-action">{cardActionLabel}</span>}
            {progressPercent > 0 && (
              <div className="media-card-yt-hover-progress">
                <div className="media-card-yt-hover-progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
export default ListeningMediaCard
