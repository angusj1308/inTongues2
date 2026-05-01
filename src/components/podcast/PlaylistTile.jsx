import CoverArt from './CoverArt'
import PinButton from './PinButton'

const PlaylistTile = ({ playlist, isPinned, onTogglePin, pinDisabled, onOpen }) => {
  if (!playlist) return null
  const count = playlist.episodeIds?.length

  return (
    <div className="media-show-tile">
      <button
        type="button"
        className="media-show-tile-cover"
        onClick={() => onOpen?.(playlist)}
        aria-label={`Open ${playlist.name}`}
      >
        <CoverArt src={playlist.coverUrl} title={playlist.name} size={180} />
      </button>
      <div className="media-show-tile-meta">
        <p className="media-show-tile-title">{playlist.name}</p>
        {count != null && (
          <p className="media-show-tile-host">
            {count} episode{count === 1 ? '' : 's'}
          </p>
        )}
      </div>
      {onTogglePin && (
        <div className="media-show-tile-pin">
          <PinButton
            isPinned={isPinned}
            disabled={pinDisabled}
            onClick={() => onTogglePin(playlist)}
          />
        </div>
      )}
    </div>
  )
}

export default PlaylistTile
