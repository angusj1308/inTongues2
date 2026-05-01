import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchArtist } from '../services/music'
import MusicShell from '../components/music/MusicShell'
import CoverArt from '../components/podcast/CoverArt'
import EpisodeRow from '../components/podcast/EpisodeRow'
import FollowButton from '../components/podcast/FollowButton'
import AlbumTile from '../components/music/AlbumTile'
import useMusicSubscriptions from '../components/music/useMusicSubscriptions'

const MusicArtistPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isFollowedArtist, isPinned, follow, unfollow } = useMusicSubscriptions()
  const [artist, setArtist] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchArtist(id).then((data) => {
      if (cancelled) return
      setArtist(data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const followed = isFollowedArtist(id)
  const pinned = isPinned(id)

  const handleFollow = async () => {
    if (!artist) return
    await follow({
      id,
      name: artist.name,
      coverUrl: artist.coverUrl,
      genres: artist.genres,
    })
  }

  const handleUnfollow = async () => {
    await unfollow(id)
  }

  const renderAlbumGrid = (albums = [], emptyLabel) => {
    if (!albums.length) {
      return <p className="media-empty-line">{emptyLabel}</p>
    }
    return (
      <div className="media-recent-strip">
        {albums.map((album) => (
          <AlbumTile
            key={album.id}
            album={{ ...album, artistName: album.artistName || artist?.name }}
          />
        ))}
      </div>
    )
  }

  return (
    <MusicShell>
      <div className="media-show-page">
        <Link to="/music" className="media-back-link ui-text">
          ← Library
        </Link>

        {loading && !artist ? (
          <p className="media-placeholder">Loading…</p>
        ) : !artist ? (
          <p className="media-placeholder">Artist not found.</p>
        ) : (
          <>
            <header className="media-show-header">
              <CoverArt
                src={artist.coverUrl}
                title={artist.name}
                size={220}
                className="media-cover-circular"
              />
              <div className="media-show-header-meta">
                <p className="media-eyebrow">Artist</p>
                <h1 className="media-show-title">{artist.name}</h1>
                {artist.bio && <p className="media-show-description">{artist.bio}</p>}
                <div className="media-show-actions">
                  <FollowButton
                    isFollowed={followed}
                    isPinned={pinned}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                  />
                  <button type="button" className="media-primary-button ui-text">
                    Play Top Tracks
                  </button>
                </div>
                <dl className="media-show-stats">
                  {artist.genres?.length > 0 && (
                    <div>
                      <dt>Genres</dt>
                      <dd>{artist.genres.slice(0, 3).join(' · ')}</dd>
                    </div>
                  )}
                  {artist.monthlyListeners != null && (
                    <div>
                      <dt>Monthly listeners</dt>
                      <dd>{artist.monthlyListeners.toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </header>

            {artist.topTracks?.length > 0 && (
              <section className="media-section">
                <h2 className="media-section-header">Top Tracks</h2>
                <div className="media-episode-list">
                  {artist.topTracks.slice(0, 10).map((track) => (
                    <EpisodeRow
                      key={track.id}
                      episode={{
                        id: track.id,
                        title: track.title,
                        coverUrl: track.coverUrl || artist.coverUrl,
                        durationMs: track.durationMs,
                        showName: track.albumName || artist.name,
                      }}
                      variant="list"
                      onPlay={() => navigate(`/music/track/${track.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="media-section">
              <h2 className="media-section-header">Albums</h2>
              {renderAlbumGrid(artist.albums, 'No albums yet.')}
            </section>

            {artist.singles?.length > 0 && (
              <section className="media-section">
                <h2 className="media-section-header">Singles & EPs</h2>
                {renderAlbumGrid(artist.singles, 'No singles yet.')}
              </section>
            )}

            {artist.appearsOn?.length > 0 && (
              <section className="media-section">
                <h2 className="media-section-header">Appears On</h2>
                {renderAlbumGrid(artist.appearsOn, 'No appearances.')}
              </section>
            )}
          </>
        )}
      </div>
    </MusicShell>
  )
}

export default MusicArtistPage
