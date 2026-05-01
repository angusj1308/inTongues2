import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../../context/AuthContext'
import {
  subscribeFollowedShows,
  subscribePins,
  subscribeEpisodeStates,
  subscribePlaylists,
  pinItem,
  unpinByRef,
} from '../../services/podcast'
import CoverArt from './CoverArt'
import ShowTile from './ShowTile'
import PinButton from './PinButton'
import ContinueListening from './ContinueListening'
import PinnedSection from './PinnedSection'
import NewEpisodes from './NewEpisodes'
import RecentShelf from './RecentShelf'

const MAX_PINS = 4

const PodcastLibrary = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [followedShows, setFollowedShows] = useState([])
  const [pins, setPins] = useState([])
  const [episodeStates, setEpisodeStates] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [pinError, setPinError] = useState('')

  useEffect(() => {
    if (!user?.uid) return undefined
    const unsubFollows = subscribeFollowedShows(user.uid, setFollowedShows)
    const unsubPins = subscribePins(user.uid, setPins)
    const unsubStates = subscribeEpisodeStates(user.uid, setEpisodeStates)
    const unsubPlaylists = subscribePlaylists(user.uid, setPlaylists)
    return () => {
      unsubFollows()
      unsubPins()
      unsubStates()
      unsubPlaylists()
    }
  }, [user?.uid])

  const pinnedRefIds = useMemo(() => new Set(pins.map((p) => p.refId)), [pins])
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
      <div className="podcast-library">
        <section className="podcast-section">
          <h2 className="podcast-section-header">Following</h2>
          <div className="podcast-empty-card">
            <p className="podcast-empty-card-title">No shows yet.</p>
            <p className="podcast-empty-card-body">
              Find podcasts in your target language to study transcripts as you listen.
            </p>
            <button
              type="button"
              className="podcast-primary-button ui-text"
              onClick={() => navigate('/podcasts/discover')}
            >
              Discover Podcasts
            </button>
          </div>
        </section>

        <section className="podcast-section">
          <h2 className="podcast-section-header">In Progress</h2>
          <p className="podcast-empty-line">Your in-progress episodes will live here.</p>
        </section>

        <section className="podcast-section">
          <h2 className="podcast-section-header">Recently Played</h2>
          <p className="podcast-empty-line">Recently played episodes will appear here.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="podcast-library">
      {continueEpisode && <ContinueListening episode={continueEpisode} />}

      {pins.length > 0 && (
        <PinnedSection
          uid={user?.uid}
          pins={pins}
          followedShows={followedShows}
          playlists={playlists}
        />
      )}

      {pinError && <p className="podcast-pin-error ui-text">{pinError}</p>}

      <NewEpisodes episodes={newEpisodes} />

      <RecentShelf episodes={recentEpisodes} />

      {followedShows.length > 0 && (
        <section className="podcast-section">
          <h2 className="podcast-section-header">My Shows</h2>
          <div className="podcast-show-grid">
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

      <section className="podcast-section">
        <div className="podcast-section-row">
          <h2 className="podcast-section-header">Playlists</h2>
          <button type="button" className="podcast-text-button ui-text" disabled>
            + New Playlist
          </button>
        </div>
        {playlists.length === 0 ? (
          <p className="podcast-empty-line">No playlists yet.</p>
        ) : (
          <div className="podcast-show-grid">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="podcast-show-tile">
                <button
                  type="button"
                  className="podcast-show-tile-cover"
                  onClick={() => {}}
                  aria-label={`Open ${playlist.name}`}
                >
                  <CoverArt src={playlist.coverUrl} title={playlist.name} size={180} />
                </button>
                <div className="podcast-show-tile-meta">
                  <p className="podcast-show-tile-title">{playlist.name}</p>
                  {playlist.episodeIds?.length != null && (
                    <p className="podcast-show-tile-host">
                      {playlist.episodeIds.length} episode{playlist.episodeIds.length === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
                <div className="podcast-show-tile-pin">
                  <PinButton
                    isPinned={pinnedRefIds.has(playlist.id)}
                    disabled={!pinnedRefIds.has(playlist.id) && pins.length >= MAX_PINS}
                    onClick={() => handleTogglePinPlaylist(playlist)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default PodcastLibrary
