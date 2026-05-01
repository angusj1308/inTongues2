// Centred message shown when an episode/show isn't reachable via RSS — typically
// because it's a Spotify exclusive. Reused on the show page and inside the
// episode-play dialog from search results.

const youtubeSearchUrl = (title) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent((title || '').trim() || 'podcast')}`

const UnavailableShowMessage = ({ title, onBack, layout = 'block' }) => {
  return (
    <div className={`media-unavailable media-unavailable-${layout}`} role="alert">
      <p className="media-unavailable-text">
        This show is exclusive to Spotify and we can't bring it into the inTongues
        study experience. If it's available on YouTube, you can import it from there.
      </p>
      <div className="media-unavailable-actions">
        <a
          className="media-primary-button ui-text"
          href={youtubeSearchUrl(title)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search YouTube
        </a>
        <button
          type="button"
          className="media-secondary-button ui-text"
          onClick={onBack}
        >
          Back to Search
        </button>
      </div>
    </div>
  )
}

export default UnavailableShowMessage
