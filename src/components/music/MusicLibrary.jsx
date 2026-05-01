import { useNavigate } from 'react-router-dom'

const MusicLibrary = () => {
  const navigate = useNavigate()

  // Empty-state placeholder. Populated state lands in the next commit.
  return (
    <div className="media-library">
      <section className="media-section">
        <h2 className="media-section-header">My Artists</h2>
        <div className="media-empty-card">
          <p className="media-empty-card-title">No artists yet.</p>
          <p className="media-empty-card-body">
            Find artists in your target language and start studying their lyrics.
          </p>
          <button
            type="button"
            className="media-primary-button ui-text"
            onClick={() => navigate('/music/discover')}
          >
            Discover Music
          </button>
        </div>
      </section>

      <section className="media-section">
        <h2 className="media-section-header">Saved Albums</h2>
        <p className="media-empty-line">Albums you save will appear here.</p>
      </section>

      <section className="media-section">
        <h2 className="media-section-header">Saved Tracks</h2>
        <p className="media-empty-line">Tracks you save will appear here.</p>
      </section>
    </div>
  )
}

export default MusicLibrary
