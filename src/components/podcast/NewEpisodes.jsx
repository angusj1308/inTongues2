import { useState } from 'react'
import EpisodeRow from './EpisodeRow'

const NewEpisodes = ({ episodes = [] }) => {
  const [showAll, setShowAll] = useState(false)
  if (!episodes.length) return null

  const visible = showAll ? episodes : episodes.slice(0, 10)

  return (
    <section className="media-section">
      <h2 className="media-section-header">New Episodes</h2>
      <div className="media-episode-list">
        {visible.map((ep) => (
          <EpisodeRow key={ep.id} episode={ep} variant="list" />
        ))}
      </div>
      {episodes.length > 10 && !showAll && (
        <button
          type="button"
          className="media-text-button ui-text"
          onClick={() => setShowAll(true)}
        >
          See all
        </button>
      )}
    </section>
  )
}

export default NewEpisodes
