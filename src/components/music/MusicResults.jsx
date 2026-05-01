import { useNavigate } from 'react-router-dom'
import CoverArt from '../podcast/CoverArt'
import EpisodeRow from '../podcast/EpisodeRow'
import FollowButton from '../podcast/FollowButton'

// Render artists / albums / tracks side-by-side as a vertical list, mirroring
// the podcast ShowResultsList rhythm.
const MusicResults = ({
  artists = [],
  albums = [],
  tracks = [],
  followedArtistIds,
  savedAlbumIds,
  savedTrackIds,
  pinnedRefIds,
  onFollow,
  onUnfollow,
  onToggleAlbum,
  onToggleTrack,
}) => {
  const navigate = useNavigate()
  const empty = !artists.length && !albums.length && !tracks.length
  if (empty) return <p className="media-empty-line">No results.</p>

  return (
    <div className="media-music-results">
      {artists.length > 0 && (
        <section className="media-results-block">
          <h2 className="media-section-header">Artists</h2>
          <div className="media-results-list">
            {artists.map((artist) => {
              const followed = followedArtistIds?.has(artist.id)
              const isPinned = pinnedRefIds?.has(artist.id)
              return (
                <div key={artist.id} className="media-result-row">
                  <button
                    type="button"
                    className="media-result-cover-button"
                    onClick={() => navigate(`/music/artist/${artist.id}`)}
                    aria-label={`Open ${artist.name}`}
                  >
                    <CoverArt
                      src={artist.coverUrl}
                      title={artist.name}
                      size={96}
                      className="media-cover-circular"
                    />
                  </button>
                  <div className="media-result-body">
                    <button
                      type="button"
                      className="media-result-title-button"
                      onClick={() => navigate(`/music/artist/${artist.id}`)}
                    >
                      <h3 className="media-result-title">{artist.name}</h3>
                    </button>
                    {artist.genres?.length > 0 && (
                      <p className="media-result-host">{artist.genres.slice(0, 3).join(' · ')}</p>
                    )}
                  </div>
                  <div className="media-result-actions">
                    <FollowButton
                      isFollowed={followed}
                      isPinned={isPinned}
                      onFollow={() => onFollow?.(artist)}
                      onUnfollow={() => onUnfollow?.(artist)}
                      size="small"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className="media-results-block">
          <h2 className="media-section-header">Albums</h2>
          <div className="media-results-list">
            {albums.map((album) => {
              const isSaved = savedAlbumIds?.has(album.id)
              return (
                <div key={album.id} className="media-result-row">
                  <button
                    type="button"
                    className="media-result-cover-button"
                    onClick={() => navigate(`/music/album/${album.id}`)}
                    aria-label={`Open ${album.title}`}
                  >
                    <CoverArt src={album.coverUrl} title={album.title} size={96} />
                  </button>
                  <div className="media-result-body">
                    <button
                      type="button"
                      className="media-result-title-button"
                      onClick={() => navigate(`/music/album/${album.id}`)}
                    >
                      <h3 className="media-result-title">{album.title}</h3>
                    </button>
                    <p className="media-result-host">
                      {[album.artistName, album.year].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="media-result-actions">
                    <button
                      type="button"
                      className={`media-follow-button small ${isSaved ? 'is-followed' : ''}`}
                      onClick={() => onToggleAlbum?.(album, !isSaved)}
                      aria-pressed={!!isSaved}
                    >
                      {isSaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <section className="media-results-block">
          <h2 className="media-section-header">Tracks</h2>
          <div className="media-episode-list">
            {tracks.map((track) => {
              const isSaved = savedTrackIds?.has(track.id)
              return (
                <div key={track.id} className="media-track-row-wrapper">
                  <EpisodeRow
                    episode={{
                      id: track.id,
                      title: track.title,
                      coverUrl: track.coverUrl,
                      durationMs: track.durationMs,
                      showName: [track.artistName, track.albumName].filter(Boolean).join(' · '),
                    }}
                    variant="list"
                    onPlay={() => navigate(`/music/track/${track.id}`)}
                  />
                  <button
                    type="button"
                    className={`media-follow-button small ${isSaved ? 'is-followed' : ''}`}
                    onClick={() => onToggleTrack?.(track, !isSaved)}
                    aria-pressed={!!isSaved}
                  >
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

export default MusicResults
