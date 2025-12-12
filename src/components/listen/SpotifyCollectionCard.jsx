const SpotifyCollectionCard = ({ title, subtitle, meta, imageUrl, onOpen, ctaLabel = 'Open playlist →' }) => {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      className="preview-card spotify-collection-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="spotify-collection-cover">
        {imageUrl ? (
          <img src={imageUrl} alt="Playlist artwork" />
        ) : (
          <div className="spotify-collection-cover-placeholder">No cover art</div>
        )}
      </div>

      <div className="spotify-collection-body">
        <div className="spotify-collection-title">{title}</div>
        {subtitle && <div className="spotify-collection-subtitle">{subtitle}</div>}
        {meta && <div className="spotify-collection-meta">{meta}</div>}
        <button className="button primary" type="button" style={{ marginTop: 'auto' }}>
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}

export default SpotifyCollectionCard
