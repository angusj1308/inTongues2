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
    return <p className="media-empty-line">No shows found.</p>
  }

  return (
    <div className="media-results-list">
      {shows.map((show) => {
        const isFollowed = followedShowIds?.has(show.id)
        const isPinned = pinnedRefIds?.has(show.id)
        return (
          <div key={show.id} className="media-result-row">
            <button
              type="button"
              className="media-result-cover-button"
              onClick={() => navigate(`/podcasts/show/${show.id}`)}
              aria-label={`Open ${show.title}`}
            >
              <CoverArt src={show.coverUrl} title={show.title} size={96} />
            </button>
            <div className="media-result-body">
              <button
                type="button"
                className="media-result-title-button"
                onClick={() => navigate(`/podcasts/show/${show.id}`)}
              >
                <h3 className="media-result-title">{show.title}</h3>
              </button>
              {show.host && <p className="media-result-host">{show.host}</p>}
              {show.description && (
                <p className="media-result-description">{show.description}</p>
              )}
            </div>
            <div className="media-result-actions">
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
