import { useNavigate } from 'react-router-dom'

const PodcastLibrary = () => {
  const navigate = useNavigate()

  return (
    <div className="podcast-library">
      <section className="podcast-section">
        <h2 className="podcast-section-header">Following</h2>
        <div className="podcast-empty-card">
          <p className="podcast-empty-card-title">No shows yet.</p>
          <p className="podcast-empty-card-body">
            Find podcasts in your target language to study transcripts as you listen.
          </p>
          <button
            type="button"
            className="podcast-primary-button ui-text"
            onClick={() => navigate('/podcasts/discover')}
          >
            Discover Podcasts
          </button>
        </div>
      </section>

      <section className="podcast-section">
        <h2 className="podcast-section-header">In Progress</h2>
        <p className="podcast-empty-line">Your in-progress episodes will live here.</p>
      </section>

      <section className="podcast-section">
        <h2 className="podcast-section-header">Recently Played</h2>
        <p className="podcast-empty-line">Recently played episodes will appear here.</p>
      </section>
    </div>
  )
}

export default PodcastLibrary
