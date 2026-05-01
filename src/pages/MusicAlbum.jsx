import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchAlbum } from '../services/music'
import MusicShell from '../components/music/MusicShell'
import CoverArt from '../components/podcast/CoverArt'
import AlbumTile from '../components/music/AlbumTile'
import useMusicSubscriptions from '../components/music/useMusicSubscriptions'

const formatDuration = (ms) => {
  if (!ms) return ''
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

const formatTrackDuration = (ms) => {
  if (!ms) return ''
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const MusicAlbumPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isSavedAlbum, toggleAlbum } = useMusicSubscriptions()
  const [album, setAlbum] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAlbum(id).then((data) => {
      if (cancelled) return
      setAlbum(data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const saved = isSavedAlbum(id)
  const totalDurationMs = (album?.tracks || []).reduce((acc, t) => acc + (t.durationMs || 0), 0)

  const handleToggleSave = () => {
    if (!album) return
    toggleAlbum(
      {
        id,
        title: album.title,
        artistName: album.artistName,
        artistId: album.artistId,
        year: album.year,
        coverUrl: album.coverUrl,
      },
      !saved,
    )
  }

  return (
    <MusicShell>
      <div className="media-show-page">
        <Link to="/music" className="media-back-link ui-text">
          ← Library
        </Link>

        {loading && !album ? (
          <p className="media-placeholder">Loading…</p>
        ) : !album ? (
          <p className="media-placeholder">Album not found.</p>
        ) : (
          <>
            <header className="media-show-header">
              <CoverArt src={album.coverUrl} title={album.title} size={220} />
              <div className="media-show-header-meta">
                <p className="media-eyebrow">Album</p>
                <h1 className="media-show-title">{album.title}</h1>
                <p className="media-show-host">
                  {album.artistId ? (
                    <Link to={`/music/artist/${album.artistId}`} className="media-show-artist-link">
                      {album.artistName}
                    </Link>
                  ) : (
                    album.artistName
                  )}
                </p>
                <div className="media-show-actions">
                  <button
                    type="button"
                    className={`media-follow-button ${saved ? 'is-followed' : ''}`}
                    onClick={handleToggleSave}
                    aria-pressed={saved}
                  >
                    {saved ? 'Saved' : 'Save Album'}
                  </button>
                  <button type="button" className="media-primary-button ui-text">
                    Play
                  </button>
                </div>
                <dl className="media-show-stats">
                  {album.year && (
                    <div>
                      <dt>Released</dt>
                      <dd>{album.year}</dd>
                    </div>
                  )}
                  {album.tracks?.length != null && (
                    <div>
                      <dt>Tracks</dt>
                      <dd>{album.tracks.length}</dd>
                    </div>
                  )}
                  {totalDurationMs > 0 && (
                    <div>
                      <dt>Duration</dt>
                      <dd>{formatDuration(totalDurationMs)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </header>

            <section className="media-section">
              <h2 className="media-section-header">Tracklist</h2>
              {album.tracks?.length === 0 ? (
                <p className="media-empty-line">No tracks listed.</p>
              ) : (
                <div className="media-tracklist">
                  {album.tracks?.map((track, index) => (
                    <button
                      key={track.id}
                      type="button"
                      className="media-tracklist-row"
                      onClick={() => navigate(`/music/track/${track.id}`)}
                    >
                      <span className="media-tracklist-number">
                        {track.trackNumber ?? index + 1}
                      </span>
                      <h3 className="media-tracklist-title">{track.title}</h3>
                      <span className="media-tracklist-duration">
                        {formatTrackDuration(track.durationMs)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {album.moreByArtist?.length > 0 && (
              <section className="media-section">
                <h2 className="media-section-header">More by {album.artistName}</h2>
                <div className="media-recent-strip">
                  {album.moreByArtist.map((other) => (
                    <AlbumTile
                      key={other.id}
                      album={{ ...other, artistName: other.artistName || album.artistName }}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </MusicShell>
  )
}

export default MusicAlbumPage
