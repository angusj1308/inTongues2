import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pinItem, unpinByRef } from '../../services/podcast'
import ShowTile from './ShowTile'
import PlaylistTile from './PlaylistTile'
import ContinueListening from './ContinueListening'
import PinnedSection from './PinnedSection'
import NewEpisodes from './NewEpisodes'
import RecentShelf from './RecentShelf'
import NewPlaylistModal from './NewPlaylistModal'
import usePodcastSubscriptions from './usePodcastSubscriptions'

const MAX_PINS = 4

const PodcastLibrary = () => {
  const navigate = useNavigate()
  const {
    user,
    followedShows,
    pins,
    episodeStates,
    playlists,
    pinnedRefs: pinnedRefIds,
  } = usePodcastSubscriptions()
  const [pinError, setPinError] = useState('')
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false)

  const maxPinOrder = useMemo(
    () => pins.reduce((acc, p) => Math.max(acc, p.order || 0), 0),
    [pins],
  )

  const continueEpisode = useMemo(() => {
    const inProgress = episodeStates.filter(
      (s) => s.progressMs > 0 && s.durationMs && s.progressMs < s.durationMs - 5000,
    )
    inProgress.sort((a, b) => {
      const at = a.lastPlayedAt?.toMillis?.() || 0
      const bt = b.lastPlayedAt?.toMillis?.() || 0
      return bt - at
    })
    return inProgress[0] || null
  }, [episodeStates])

  const recentEpisodes = useMemo(() => {
    const sorted = [...episodeStates].sort((a, b) => {
      const at = a.lastPlayedAt?.toMillis?.() || 0
      const bt = b.lastPlayedAt?.toMillis?.() || 0
      return bt - at
    })
    return sorted.slice(0, 5)
  }, [episodeStates])

  const newEpisodes = useMemo(() => {
    // Backend not yet wired; return empty list. When followed shows expose
    // recent episodes locally, they'll show here.
    const collected = []
    followedShows.forEach((show) => {
      if (Array.isArray(show.recentEpisodes)) {
        show.recentEpisodes.forEach((ep) => {
          if (!episodeStates.find((s) => s.id === ep.id && s.progressMs > 0)) {
            collected.push({ ...ep, showName: show.title, coverUrl: ep.coverUrl || show.coverUrl })
          }
        })
      }
    })
    collected.sort((a, b) => {
      const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return bt - at
    })
    return collected.slice(0, 10)
  }, [followedShows, episodeStates])

  const hasAnyData =
    followedShows.length > 0 ||
    pins.length > 0 ||
    episodeStates.length > 0 ||
    playlists.length > 0

  const handleTogglePinShow = async (show) => {
    if (!user?.uid || !show) return
    setPinError('')
    if (pinnedRefIds.has(show.id)) {
      await unpinByRef(user.uid, show.id)
      return
    }
    if (pins.length >= MAX_PINS) {
      setPinError('You can pin up to 4 items. Unpin one to add another.')
      return
    }
    await pinItem(
      user.uid,
      { kind: 'show', refId: show.id, title: show.title, coverUrl: show.coverUrl },
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
          <h2 className="media-section-header">Following</h2>
          <div className="media-empty-card">
            <p className="media-empty-card-title">No shows yet.</p>
            <p className="media-empty-card-body">
              Find podcasts in your target language to study transcripts as you listen.
            </p>
            <button
              type="button"
              className="media-primary-button ui-text"
              onClick={() => navigate('/podcasts/discover')}
            >
              Discover Podcasts
            </button>
          </div>
        </section>

        <section className="media-section">
          <h2 className="media-section-header">In Progress</h2>
          <p className="media-empty-line">Your in-progress episodes will live here.</p>
        </section>

        <section className="media-section">
          <h2 className="media-section-header">Recently Played</h2>
          <p className="media-empty-line">Recently played episodes will appear here.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="media-library">
      {continueEpisode && <ContinueListening episode={continueEpisode} />}

      {pins.length > 0 && (
        <PinnedSection
          uid={user?.uid}
          pins={pins}
          followedShows={followedShows}
          playlists={playlists}
        />
      )}

      {pinError && <p className="media-pin-error ui-text">{pinError}</p>}

      <NewEpisodes episodes={newEpisodes} />

      <RecentShelf episodes={recentEpisodes} />

      {followedShows.length > 0 && (
        <section className="media-section">
          <h2 className="media-section-header">My Shows</h2>
          <div className="media-show-grid">
            {followedShows.map((show) => (
              <ShowTile
                key={show.id}
                show={show}
                isPinned={pinnedRefIds.has(show.id)}
                onTogglePin={handleTogglePinShow}
                pinDisabled={!pinnedRefIds.has(show.id) && pins.length >= MAX_PINS}
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
          <div className="media-show-grid">
            {playlists.map((playlist) => (
              <PlaylistTile
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
      />
    </div>
  )
}

export default PodcastLibrary
