import CoverArt from './CoverArt'

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

// Variants: 'list' (New Episodes / search results), 'detail' (show page row), 'tile' (Recent strip), 'pinned-tile' (140px square in Pinned strip)
const formatDate = (input) => {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatDuration = (ms) => {
  if (!ms || Number.isNaN(ms)) return ''
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

const minutesLeft = (durationMs, progressMs) => {
  if (!durationMs) return null
  const remaining = Math.max(0, durationMs - (progressMs || 0))
  const mins = Math.round(remaining / 60000)
  return mins
}

const EpisodeRow = ({
  episode,
  variant = 'list',
  onPlay,
  onAddToPlaylist,
  showTitle,
  status,
}) => {
  if (!episode) return null

  const {
    title = '',
    description = '',
    publishedAt,
    durationMs,
    progressMs = 0,
    coverUrl,
    showName,
    episodeNumber,
  } = episode

  const eyebrow = showTitle || showName || ''

  if (variant === 'tile') {
    return (
      <button type="button" className="media-episode-tile" onClick={() => onPlay?.(episode)}>
        <CoverArt src={coverUrl} title={eyebrow || title} size={180} />
        {eyebrow && <p className="media-eyebrow">{eyebrow}</p>}
        <p className="media-episode-tile-title">{title}</p>
        {status && <p className="media-episode-tile-status">{status}</p>}
      </button>
    )
  }

  if (variant === 'pinned-tile') {
    return (
      <button type="button" className="media-pinned-tile" onClick={() => onPlay?.(episode)}>
        <CoverArt src={coverUrl} title={eyebrow || title} size={140} />
        <p className="media-pinned-tile-title">{title}</p>
      </button>
    )
  }

  if (variant === 'detail') {
    const left = minutesLeft(durationMs, progressMs)
    const inProgress = progressMs > 0 && (durationMs ? progressMs < durationMs - 5000 : false)
    const played = durationMs && progressMs >= durationMs - 5000
    const buttonLabel = played ? 'Replay' : inProgress ? 'Resume' : 'Play'
    return (
      <div className="media-episode-detail-row">
        <div className="media-episode-detail-meta">
          <div className="media-episode-detail-line">
            {episodeNumber != null && (
              <span className="media-episode-detail-number">#{episodeNumber}</span>
            )}
            {publishedAt && <span>{formatDate(publishedAt)}</span>}
            {durationMs && <span>{formatDuration(durationMs)}</span>}
            {inProgress && left != null && (
              <span className="media-status-inprogress">{left}m left</span>
            )}
            {played && <span className="media-status-played">Played</span>}
          </div>
          <h3 className="media-episode-detail-title">{title}</h3>
          {description && (
            <p className="media-episode-detail-description">{description}</p>
          )}
        </div>
        <div className="media-episode-detail-actions">
          <button
            type="button"
            className="media-secondary-button ui-text"
            onClick={() => onPlay?.(episode)}
          >
            {buttonLabel}
          </button>
          {onAddToPlaylist && (
            <button
              type="button"
              className="media-icon-button"
              aria-label="Add to playlist"
              onClick={() => onAddToPlaylist(episode)}
            >
              <PlusIcon />
            </button>
          )}
        </div>
      </div>
    )
  }

  // 'list' default
  return (
    <div className="media-episode-list-row">
      <CoverArt src={coverUrl} title={eyebrow || title} size={56} />
      <div className="media-episode-list-body">
        {eyebrow && <p className="media-eyebrow">{eyebrow}</p>}
        <h3 className="media-episode-list-title">{title}</h3>
      </div>
      <div className="media-episode-list-meta">
        {publishedAt && <span>{formatDate(publishedAt)}</span>}
        {durationMs && <span>{formatDuration(durationMs)}</span>}
      </div>
      <div className="media-episode-list-actions">
        <button
          type="button"
          className="media-icon-button"
          aria-label="Play episode"
          onClick={() => onPlay?.(episode)}
        >
          <PlayIcon />
        </button>
        {onAddToPlaylist && (
          <button
            type="button"
            className="media-icon-button"
            aria-label="Add to playlist"
            onClick={() => onAddToPlaylist(episode)}
          >
            <PlusIcon />
          </button>
        )}
      </div>
    </div>
  )
}

export default EpisodeRow
