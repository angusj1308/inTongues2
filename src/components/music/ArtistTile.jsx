import { useNavigate } from 'react-router-dom'
import CoverArt from '../podcast/CoverArt'
import PinButton from '../podcast/PinButton'

// 5-column grid tile with a circular cover used in My Artists.
const ArtistTile = ({ artist, isPinned, onTogglePin, pinDisabled }) => {
  const navigate = useNavigate()
  if (!artist) return null
  const { id, name, coverUrl } = artist

  return (
    <div className="media-artist-tile">
      <button
        type="button"
        className="media-artist-tile-cover"
        onClick={() => navigate(`/music/artist/${id}`)}
        aria-label={`Open ${name}`}
      >
        <CoverArt src={coverUrl} title={name} size={180} className="media-cover-circular" />
      </button>
      <p className="media-artist-tile-name">{name}</p>
      {onTogglePin && (
        <div className="media-artist-tile-pin">
          <PinButton
            isPinned={isPinned}
            disabled={pinDisabled}
            onClick={() => onTogglePin(artist)}
          />
        </div>
      )}
    </div>
  )
}

export default ArtistTile
