import { Link, useParams } from 'react-router-dom'
import PodcastShell from '../components/podcast/PodcastShell'

// Stub — the full episode detail page (transcript, study UI) lands separately.
const PodcastEpisodePage = () => {
  const { episodeId } = useParams()
  return (
    <PodcastShell>
      <Link to="/podcasts" className="media-back-link ui-text">
        ← Library
      </Link>
      <p className="media-placeholder">
        Episode page coming soon. <br />
        <span className="ui-text" style={{ opacity: 0.7 }}>id: {episodeId}</span>
      </p>
    </PodcastShell>
  )
}

export default PodcastEpisodePage
