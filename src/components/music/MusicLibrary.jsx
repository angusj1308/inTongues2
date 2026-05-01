import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pinItem, unpinByRef, createPlaylist } from '../../services/music'
import EpisodeRow from '../podcast/EpisodeRow'
import NewPlaylistModal from '../media/NewPlaylistModal'
import ContinueStudying from './ContinueStudying'
import MusicPinnedSection from './MusicPinnedSection'
import AlbumTile from './AlbumTile'
import ArtistTile from './ArtistTile'
import MusicPlaylistTile from './MusicPlaylistTile'
import useMusicSubscriptions from './useMusicSubscriptions'

const MAX_PINS = 4

const MusicLibrary = () => {
  const navigate = useNavigate()
  const {
    user,
    followedArtists,
    savedAlbums,
    savedTracks,
    pins,
    trackStates,
    playlists,
    pinnedRefs: pinnedRefIds,
  } = useMusicSubscriptions()
  const [pinError, setPinError] = useState('')
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false)

  const maxPinOrder = useMemo(
    () => pins.reduce((acc, p) => Math.max(acc, p.order || 0), 0),
    [pins],
  )

  const continueTrack = useMemo(() => {
    const inProgress = trackStates.filter(
      (s) => s.totalWords > 0 && s.wordsStudied > 0 && s.wordsStudied < s.totalWords,
    )
    inProgress.sort((a, b) => {
      const at = a.lastOpenedAt?.toMillis?.() || 0
      const bt = b.lastOpenedAt?.toMillis?.() || 0
      return bt - at
    })
    return inProgress[0] || null
  }, [trackStates])

  const recentTracks = useMemo(() => {
    const sorted = [...trackStates].sort((a, b) => {
      const at = a.lastOpenedAt?.toMillis?.() || 0
      const bt = b.lastOpenedAt?.toMillis?.() || 0
      return bt - at
    })
    return sorted.slice(0, 5)
  }, [trackStates])

  const hasAnyData =
    followedArtists.length > 0 ||
    savedAlbums.length > 0 ||
    savedTracks.length > 0 ||
    pins.length > 0 ||
    trackStates.length > 0 ||
    playlists.length > 0

  const handleTogglePinArtist = async (artist) => {
    if (!user?.uid || !artist) return
    setPinError('')
    if (pinnedRefIds.has(artist.id)) {
      await unpinByRef(user.uid, artist.id)
      return
    }
    if (pins.length >= MAX_PINS) {
      setPinError('You can pin up to 4 items. Unpin one to add another.')
      return
    }
    await pinItem(
      user.uid,
      { kind: 'artist', refId: artist.id, title: artist.name, coverUrl: artist.coverUrl },
      maxPinOrder,
    )
  }

  const handleTogglePinPlaylist = async (playlist) => {
    if (!user?.uid || !playlist) return
    setPinError('')
    if (pinnedRefIds.has(playlist.id)) {
      await unpinByRef(user.uid, playlist.id)
      return
    }
    if (pins.length >= MAX_PINS) {
      setPinError('You can pin up to 4 items. Unpin one to add another.')
      return
    }
    await pinItem(
      user.uid,
      { kind: 'playlist', refId: playlist.id, title: playlist.name, coverUrl: playlist.coverUrl },
      maxPinOrder,
    )
  }

  if (!hasAnyData) {
    return (
      <div className="media-library">
        <section className="media-section">
          <h2 className="media-section-header">My Artists</h2>
          <div className="media-empty-card">
            <p className="media-empty-card-title">No artists yet.</p>
            <p className="media-empty-card-body">
              Find artists in your target language and start studying their lyrics.
            </p>
            <button
              type="button"
              className="media-primary-button ui-text"
              onClick={() => navigate('/music/discover')}
            >
              Discover Music
            </button>
          </div>
        </section>

        <section className="media-section">
          <h2 className="media-section-header">Saved Albums</h2>
          <p className="media-empty-line">Albums you save will appear here.</p>
        </section>

        <section className="media-section">
          <h2 className="media-section-header">Saved Tracks</h2>
          <p className="media-empty-line">Tracks you save will appear here.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="media-library">
      {continueTrack && <ContinueStudying track={continueTrack} />}

      {pins.length > 0 && (
        <MusicPinnedSection
          uid={user?.uid}
          pins={pins}
          followedArtists={followedArtists}
          playlists={playlists}
        />
      )}

      {pinError && <p className="media-pin-error ui-text">{pinError}</p>}

      {savedAlbums.length > 0 && (
        <section className="media-section">
          <h2 className="media-section-header">Saved Albums</h2>
          <div className="media-recent-strip">
            {savedAlbums.map((album) => (
              <AlbumTile key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      {savedTracks.length > 0 && (
        <section className="media-section">
          <h2 className="media-section-header">Saved Tracks</h2>
          <div className="media-episode-list">
            {savedTracks.map((track) => (
              <EpisodeRow
                key={track.id}
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
            ))}
          </div>
        </section>
      )}

      {recentTracks.length > 0 && (
        <section className="media-section">
          <h2 className="media-section-header">Recent</h2>
          <div className="media-recent-strip">
            {recentTracks.map((track) => {
              const studied = track.wordsStudied || 0
              const total = track.totalWords || 0
              const status = total > 0 ? `${Math.round((studied / total) * 100)}% studied` : ''
              return (
                <EpisodeRow
                  key={track.id}
                  episode={{
                    id: track.id,
                    title: track.title,
                    coverUrl: track.coverUrl,
                    showName: [track.artistName, track.albumName].filter(Boolean).join(' · '),
                  }}
                  variant="tile"
                  status={status}
                  onPlay={() => navigate(`/music/track/${track.id}`)}
                />
              )
            })}
          </div>
        </section>
      )}

      {followedArtists.length > 0 && (
        <section className="media-section">
          <h2 className="media-section-header">My Artists</h2>
          <div className="media-artist-grid">
            {followedArtists.map((artist) => (
              <ArtistTile
                key={artist.id}
                artist={artist}
                isPinned={pinnedRefIds.has(artist.id)}
                onTogglePin={handleTogglePinArtist}
                pinDisabled={!pinnedRefIds.has(artist.id) && pins.length >= MAX_PINS}
              />
            ))}
          </div>
        </section>
      )}

      <section className="media-section">
        <div className="media-section-row">
          <h2 className="media-section-header">Playlists</h2>
          <button
            type="button"
            className="media-text-button ui-text"
            onClick={() => setNewPlaylistOpen(true)}
          >
            + New Playlist
          </button>
        </div>
        {playlists.length === 0 ? (
          <p className="media-empty-line">No playlists yet.</p>
        ) : (
          <div className="media-playlist-grid">
            {playlists.map((playlist) => (
              <MusicPlaylistTile
                key={playlist.id}
                playlist={playlist}
                isPinned={pinnedRefIds.has(playlist.id)}
                onTogglePin={handleTogglePinPlaylist}
                pinDisabled={!pinnedRefIds.has(playlist.id) && pins.length >= MAX_PINS}
              />
            ))}
          </div>
        )}
      </section>

      <NewPlaylistModal
        uid={user?.uid}
        open={newPlaylistOpen}
        onClose={() => setNewPlaylistOpen(false)}
        onCreate={createPlaylist}
        placeholder="My listening list"
      />
    </div>
  )
}

export default MusicLibrary
