import { useNavigate } from 'react-router-dom'
import CoverArt from './CoverArt'
import FollowButton from './FollowButton'

const ShowResultsList = ({
  shows = [],
  followedShowIds,
  pinnedRefIds,
  onFollow,
  onUnfollow,
}) => {
  const navigate = useNavigate()
  if (!shows.length) {
    return <p className="podcast-empty-line">No shows found.</p>
  }

  return (
    <div className="podcast-results-list">
      {shows.map((show) => {
        const isFollowed = followedShowIds?.has(show.id)
        const isPinned = pinnedRefIds?.has(show.id)
        return (
          <div key={show.id} className="podcast-result-row">
            <button
              type="button"
              className="podcast-result-cover-button"
              onClick={() => navigate(`/podcasts/show/${show.id}`)}
              aria-label={`Open ${show.title}`}
            >
              <CoverArt src={show.coverUrl} title={show.title} size={96} />
            </button>
            <div className="podcast-result-body">
              <button
                type="button"
                className="podcast-result-title-button"
                onClick={() => navigate(`/podcasts/show/${show.id}`)}
              >
                <h3 className="podcast-result-title">{show.title}</h3>
              </button>
              {show.host && <p className="podcast-result-host">{show.host}</p>}
              {show.description && (
                <p className="podcast-result-description">{show.description}</p>
              )}
            </div>
            <div className="podcast-result-actions">
              <FollowButton
                isFollowed={isFollowed}
                isPinned={isPinned}
                onFollow={() => onFollow?.(show)}
                onUnfollow={() => onUnfollow?.(show)}
                size="small"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ShowResultsList
