const SpotifyCollectionCard = ({ title, subtitle, meta, imageUrl, onOpen }) => {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      className="spotify-tile"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="spotify-tile-cover">
        {imageUrl ? (
          <img className="spotify-tile-cover-img" src={imageUrl} alt={title || 'Album artwork'} />
        ) : (
          <div className="spotify-tile-no-cover">
            <span className="ui-text">No cover art</span>
          </div>
        )}

        <div className="spotify-tile-hover-overlay">
          <div className="spotify-tile-hover-title">{title}</div>
          {(subtitle || meta) && (
            <div className="spotify-tile-hover-meta">
              {subtitle}
              {subtitle && meta ? ' · ' : ''}
              {meta}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SpotifyCollectionCard
