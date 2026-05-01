import CoverArt from '../podcast/CoverArt'

const formatDate = (input) => {
  if (!input) return ''
  const at = input?.toMillis ? input.toMillis() : new Date(input).getTime()
  if (Number.isNaN(at)) return ''
  const diffMs = Date.now() - at
  const day = 24 * 60 * 60 * 1000
  if (diffMs < day) return 'today'
  if (diffMs < 2 * day) return 'yesterday'
  const days = Math.round(diffMs / day)
  if (days < 30) return `${days} days ago`
  const d = new Date(at)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const ContinueStudying = ({ track, onResume }) => {
  if (!track) return null
  const {
    title,
    artistName,
    albumName,
    coverUrl,
    wordsStudied = 0,
    totalWords = 0,
    lastOpenedAt,
  } = track

  const eyebrow = [artistName, albumName].filter(Boolean).join(' · ')
  const percent = totalWords > 0 ? Math.min(100, Math.round((wordsStudied / totalWords) * 100)) : 0
  const lastOpened = formatDate(lastOpenedAt)

  return (
    <section className="media-section media-continue">
      <h2 className="media-section-header">Continue Studying</h2>
      <div className="media-continue-card">
        <CoverArt src={coverUrl} title={eyebrow || title} size={120} />
        <div className="media-continue-body">
          {eyebrow && <p className="media-eyebrow">{eyebrow}</p>}
          <h3 className="media-continue-title">{title}</h3>
          <div className="media-progress-bar" aria-hidden="true">
            <div className="media-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="media-continue-meta">
            {wordsStudied} of {totalWords} words studied
            {lastOpened && ` · Last opened ${lastOpened}`}
          </p>
        </div>
        <button
          type="button"
          className="media-primary-button ui-text"
          onClick={() => onResume?.(track)}
        >
          Resume
        </button>
      </div>
    </section>
  )
}

export default ContinueStudying
