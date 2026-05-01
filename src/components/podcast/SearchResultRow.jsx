import { useNavigate } from 'react-router-dom'
import CoverArt from './CoverArt'
import FollowButton from './FollowButton'

const formatRelative = (input) => {
  if (!input) return ''
  const at = new Date(input).getTime()
  if (Number.isNaN(at)) return ''
  const diffMs = Date.now() - at
  const day = 24 * 60 * 60 * 1000
  if (diffMs < day) return 'Today'
  if (diffMs < 2 * day) return 'Yesterday'
  if (diffMs < 30 * day) return `${Math.round(diffMs / day)} days ago`
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDurationShort = (ms) => {
  if (!ms) return ''
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

const ShowSubtitle = ({ result }) => {
  const parts = []
  if (result.author) parts.push(result.author)
  const category = Array.isArray(result.categories) ? result.categories[0] : result.category
  if (category) parts.push(category)
  if (result.episodeCount > 0) {
    parts.push(`${result.episodeCount} episodes`)
  }
  return parts.length ? <p className="media-search-row-subtitle">{parts.join(' · ')}</p> : null
}

const EpisodeSubtitle = ({ result }) => {
  const parts = []
  if (result.showTitle) parts.push(result.showTitle)
  const relative = formatRelative(result.publishDate ? result.publishDate * 1000 : null)
  if (relative) parts.push(relative)
  const duration = formatDurationShort(
    typeof result.duration === 'number' ? result.duration * 1000 : 0,
  )
  if (duration) parts.push(duration)
  return parts.length ? <p className="media-search-row-subtitle">{parts.join(' · ')}</p> : null
}

// Single component, two variants: 'show' and 'episode'.
const SearchResultRow = ({
  result,
  isFollowed,
  isPinned,
  onFollow,
  onUnfollow,
  onPlay,
}) => {
  const navigate = useNavigate()
  if (!result) return null
  const isShow = result.type === 'show'
  const id = isShow
    ? String(result.spotifyShowId ?? result.feedId ?? '')
    : String(result.spotifyEpisodeId ?? result.episodeId ?? '')

  const openTarget = () => {
    if (isShow) navigate(`/podcasts/show/${id}`)
    else navigate(`/podcasts/episode/${id}`)
  }

  return (
    <div className="media-search-row">
      <button
        type="button"
        className="media-result-cover-button"
        onClick={openTarget}
        aria-label={`Open ${result.title}`}
      >
        <CoverArt src={result.coverArtUrl} title={result.title || ''} size={56} />
      </button>

      <span className="media-search-row-type ui-text">
        {isShow ? 'Show' : 'Episode'}
      </span>

      <button
        type="button"
        className="media-search-row-body"
        onClick={openTarget}
      >
        <h3 className="media-search-row-title">{result.title}</h3>
        {isShow ? <ShowSubtitle result={result} /> : <EpisodeSubtitle result={result} />}
      </button>

      <div className="media-search-row-actions">
        {isShow ? (
          <FollowButton
            isFollowed={!!isFollowed}
            isPinned={!!isPinned}
            onFollow={() => onFollow?.(result)}
            onUnfollow={() => onUnfollow?.(result)}
            size="small"
          />
        ) : (
          <button
            type="button"
            className="media-secondary-button ui-text"
            onClick={(e) => {
              e.stopPropagation()
              onPlay?.(result)
            }}
          >
            Play
          </button>
        )}
      </div>
    </div>
  )
}

export const SearchResultRowSkeleton = () => (
  <div className="media-search-row media-search-row-skeleton" aria-hidden="true">
    <div className="media-search-row-skeleton-cover" />
    <span className="media-search-row-type media-search-row-skeleton-type" />
    <div className="media-search-row-body media-search-row-skeleton-body">
      <div className="media-search-row-skeleton-line media-search-row-skeleton-title" />
      <div className="media-search-row-skeleton-line media-search-row-skeleton-subtitle" />
    </div>
    <div className="media-search-row-actions media-search-row-skeleton-action" />
  </div>
)

export default SearchResultRow
