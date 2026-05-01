import { useNavigate } from 'react-router-dom'
import CoverArt from './CoverArt'
import PinButton from './PinButton'

const ShowTile = ({ show, isPinned, onTogglePin, pinDisabled }) => {
  const navigate = useNavigate()
  if (!show) return null
  const { id, title, host, coverUrl } = show

  return (
    <div className="podcast-show-tile">
      <button
        type="button"
        className="podcast-show-tile-cover"
        onClick={() => navigate(`/podcasts/show/${id}`)}
        aria-label={`Open ${title}`}
      >
        <CoverArt src={coverUrl} title={title} size={180} />
      </button>
      <div className="podcast-show-tile-meta">
        <p className="podcast-show-tile-title">{title}</p>
        {host && <p className="podcast-show-tile-host">{host}</p>}
      </div>
      {onTogglePin && (
        <div className="podcast-show-tile-pin">
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
