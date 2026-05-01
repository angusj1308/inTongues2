import CoverArt from './CoverArt'

const formatMinutesLeft = (durationMs, progressMs) => {
  if (!durationMs) return ''
  const remaining = Math.max(0, durationMs - (progressMs || 0))
  const mins = Math.round(remaining / 60000)
  return `${mins} min left`
}

const formatPercent = (durationMs, progressMs) => {
  if (!durationMs) return 0
  return Math.min(100, Math.round((progressMs / durationMs) * 100))
}

const ContinueListening = ({ episode, onResume }) => {
  if (!episode) return null
  const { title, showName, coverUrl, durationMs, progressMs = 0 } = episode
  const percent = formatPercent(durationMs, progressMs)
  const left = formatMinutesLeft(durationMs, progressMs)

  return (
    <section className="media-section media-continue">
      <h2 className="media-section-header">Continue Listening</h2>
      <div className="media-continue-card">
        <CoverArt src={coverUrl} title={showName || title} size={120} />
        <div className="media-continue-body">
          {showName && <p className="media-eyebrow">{showName}</p>}
          <h3 className="media-continue-title">{title}</h3>
          <div className="media-progress-bar" aria-hidden="true">
            <div className="media-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="media-continue-meta">
            {left} · {percent}% played
          </p>
        </div>
        <button
          type="button"
          className="media-primary-button ui-text"
          onClick={() => onResume?.(episode)}
        >
          Resume
        </button>
      </div>
    </section>
  )
}

export default ContinueListening
