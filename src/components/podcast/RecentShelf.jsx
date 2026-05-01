import EpisodeRow from './EpisodeRow'

const formatRelativeDay = (input) => {
  if (!input) return ''
  const at = input?.toMillis ? input.toMillis() : new Date(input).getTime()
  if (Number.isNaN(at)) return ''
  const diffMs = Date.now() - at
  const day = 24 * 60 * 60 * 1000
  if (diffMs < day) return 'Today'
  if (diffMs < 2 * day) return 'Yesterday'
  return `${Math.round(diffMs / day)} days ago`
}

const statusFor = (state) => {
  if (!state) return ''
  const { progressMs, durationMs, lastPlayedAt } = state
  if (durationMs && progressMs >= durationMs - 5000) return 'Played'
  if (durationMs && progressMs > 0) {
    const pct = Math.round((progressMs / durationMs) * 100)
    return `${pct}% played`
  }
  return formatRelativeDay(lastPlayedAt)
}

const RecentShelf = ({ episodes = [] }) => {
  if (!episodes.length) return null

  return (
    <section className="podcast-section">
      <h2 className="podcast-section-header">Recent</h2>
      <div className="podcast-recent-strip">
        {episodes.map((ep) => (
          <EpisodeRow
            key={ep.id}
            episode={ep}
            variant="tile"
            status={statusFor(ep)}
          />
        ))}
      </div>
    </section>
  )
}

export default RecentShelf
