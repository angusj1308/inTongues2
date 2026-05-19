import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchArtist } from '../services/music'
import { prewarmMusicPlayback } from '../services/musicKit'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import DashboardLayout from '../components/layout/DashboardLayout'
import CoverArt from '../components/podcast/CoverArt'
import EpisodeRow from '../components/podcast/EpisodeRow'
import FollowButton from '../components/podcast/FollowButton'
import AlbumTile from '../components/music/AlbumTile'
import LoadingScreen from '../components/LoadingScreen'
import useMusicSubscriptions from '../components/music/useMusicSubscriptions'

const MusicArtistPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')
  const { isFollowedArtist, isPinned, follow, unfollow } = useMusicSubscriptions()
  const [artist, setArtist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState(() => new Set())

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchArtist(id, { language }).then((data) => {
      if (cancelled) return
      setArtist(data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, language])

  const handleTabChange = (tab) => {
    if (tab === 'listen') navigate('/listen/library')
    else if (tab === 'read') navigate('/read/library')
    else navigate('/dashboard', { state: { initialTab: tab } })
  }

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

  const renderAlbumGrid = (albums = [], emptyLabel, sectionKey) => {
    if (!albums.length) {
      return <p className="media-empty-line">{emptyLabel}</p>
    }
    const expanded = expandedSections.has(sectionKey)
    return (
      <div className={`media-recent-strip${expanded ? ' is-expanded' : ''}`}>
        {albums.map((album) => (
          <AlbumTile
            key={album.id}
            album={{ ...album, artistName: album.artistName || artist?.name }}
          />
        ))}
      </div>
    )
  }

  const renderSectionHeader = (label, sectionKey, count) => {
    const expanded = expandedSections.has(sectionKey)
    const showToggle = count > 6
    return (
      <div className="media-section-row">
        <h2 className="media-section-header">{label}</h2>
        {showToggle && (
          <button
            type="button"
            className="media-text-button ui-text"
            onClick={() => toggleSection(sectionKey)}
          >
            {expanded ? 'Show less' : `See all (${count})`}
          </button>
        )}
      </div>
    )
  }

  if (loading && !artist) {
    return (
      <DashboardLayout activeTab="listen" onTabChange={handleTabChange}>
        <LoadingScreen />
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout activeTab="listen" onTabChange={handleTabChange}>
      <div className="media-page media-page--bare">
        <main className="media-main">
          <div className="media-show-page">
            <Link to="/listen/library/music" className="media-back-link ui-text">
              ← My Music
            </Link>

            {!artist ? (
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

                {artist.topTracks?.length > 0 && (() => {
                  const topTracks = artist.topTracks.slice(0, 10)
                  const topTrackQueue = topTracks.map((t) => t.id).filter(Boolean)
                  return (
                  <section className="media-section">
                    <h2 className="media-section-header">Top Tracks</h2>
                    <div className="media-episode-list">
                      {topTracks.map((track, index) => (
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
                          onPlay={() => {
                            prewarmMusicPlayback(track.id, { queue: topTrackQueue })
                            navigate(`/listen/${track.id}?source=music`, {
                              state: {
                                queue: topTrackQueue,
                                startIndex: index,
                                contextLabel: `${artist.name} · Top Tracks`,
                              },
                            })
                          }}
                        />
                      ))}
                    </div>
                  </section>
                  )
                })()}

                <section className="media-section">
                  {renderSectionHeader('Albums', 'albums', artist.albums?.length || 0)}
                  {renderAlbumGrid(artist.albums, 'No albums yet.', 'albums')}
                </section>

                {artist.singles?.length > 0 && (
                  <section className="media-section">
                    {renderSectionHeader('Singles & EPs', 'singles', artist.singles.length)}
                    {renderAlbumGrid(artist.singles, 'No singles yet.', 'singles')}
                  </section>
                )}

                {artist.appearsOn?.length > 0 && (
                  <section className="media-section">
                    {renderSectionHeader('Appears On', 'appearsOn', artist.appearsOn.length)}
                    {renderAlbumGrid(artist.appearsOn, 'No appearances.', 'appearsOn')}
                  </section>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  )
}

export default MusicArtistPage
