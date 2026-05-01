import { useNavigate } from 'react-router-dom'
import CoverArt from './CoverArt'
import PinButton from './PinButton'

const ShowTile = ({ show, isPinned, onTogglePin, pinDisabled }) => {
  const navigate = useNavigate()
  if (!show) return null
  const { id, title, host, coverUrl } = show

  return (
    <div className="media-show-tile">
      <button
        type="button"
        className="media-show-tile-cover"
        onClick={() => navigate(`/podcasts/show/${id}`)}
        aria-label={`Open ${title}`}
      >
        <CoverArt src={coverUrl} title={title} size={180} />
      </button>
      <div className="media-show-tile-meta">
        <p className="media-show-tile-title">{title}</p>
        {host && <p className="media-show-tile-host">{host}</p>}
      </div>
      {onTogglePin && (
        <div className="media-show-tile-pin">
          <PinButton
            isPinned={isPinned}
            disabled={pinDisabled}
            onClick={() => onTogglePin(show)}
          />
        </div>
      )}
    </div>
  )
}

export default ShowTile
