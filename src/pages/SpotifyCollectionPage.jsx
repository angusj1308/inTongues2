import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import db from '../firebase'

const formatDuration = (ms) => {
  if (!ms || Number.isNaN(ms)) return ''
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours > 0) return `${hours} hr ${remainingMinutes} min`
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const SpotifyCollectionPage = () => {
  const { collectionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [spotifyLibrary, setSpotifyLibrary] = useState([])
  const [spotifyLibraryLoading, setSpotifyLibraryLoading] = useState(true)
  const [playlists, setPlaylists] = useState([])
  const [playlistsLoading, setPlaylistsLoading] = useState(true)

  useEffect(() => {
    if (!user) return undefined

    setSpotifyLibraryLoading(true)
    const libraryRef = collection(db, 'users', user.uid, 'spotifyItems')
    const libraryQuery = query(libraryRef, orderBy('addedAt', 'desc'))

    const unsubscribe = onSnapshot(
      libraryQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        setSpotifyLibrary(nextItems)
        setSpotifyLibraryLoading(false)
      },
      () => setSpotifyLibraryLoading(false),
    )

    return unsubscribe
  }, [user])

  useEffect(() => {
    if (!user) return undefined

    setPlaylistsLoading(true)
    const playlistsRef = collection(db, 'users', user.uid, 'spotifyPlaylists')
    const playlistsQuery = query(playlistsRef, orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      playlistsQuery,
      (snapshot) => {
        const nextPlaylists = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        setPlaylists(nextPlaylists)
        setPlaylistsLoading(false)
      },
      () => setPlaylistsLoading(false),
    )

    return unsubscribe
  }, [user])

  const spotifyTracks = useMemo(
    () => spotifyLibrary.filter((item) => item.type === 'track' || item.type === 'episode'),
    [spotifyLibrary],
  )

  const trackLookup = useMemo(() => {
    const map = new Map()
    spotifyTracks.forEach((track) => {
      map.set(track.id, track)
    })
    return map
  }, [spotifyTracks])

  const collectionData = useMemo(() => {
    let tracks = spotifyTracks
    let title = 'All Tracks'
    let subtitle = 'All imported Spotify tracks'
    let imageUrl = spotifyTracks[0]?.imageUrl

    if (collectionId?.startsWith('album-')) {
      const albumKey = decodeURIComponent(collectionId.replace('album-', ''))
      const filteredTracks = spotifyTracks.filter((track) => {
        const key = track.albumId || track.albumName || ''
        return key === albumKey
      })

      tracks = filteredTracks
      title = filteredTracks[0]?.albumName || 'Album'
      subtitle = filteredTracks[0]?.artist || filteredTracks[0]?.subtitle || 'Album tracks'
      imageUrl = filteredTracks[0]?.imageUrl
    } else if (collectionId?.startsWith('playlist-')) {
      const playlistId = decodeURIComponent(collectionId.replace('playlist-', ''))
      const playlist = playlists.find((entry) => entry.id === playlistId)
      const filteredTracks = (playlist?.trackIds || [])
        .map((id) => trackLookup.get(id))
        .filter(Boolean)

      tracks = filteredTracks
      title = playlist?.name || 'Playlist'
      subtitle = playlist?.description || `${filteredTracks.length} tracks`
      if (!imageUrl) imageUrl = filteredTracks[0]?.imageUrl
    }

    const totalDuration = tracks.reduce((sum, track) => sum + (track.durationMs || 0), 0)
    const metaParts = []
    metaParts.push(`${tracks.length} tracks`)
    if (totalDuration) metaParts.push(formatDuration(totalDuration))

    return {
      tracks,
      title,
      subtitle,
      meta: metaParts.join(' · '),
      imageUrl,
    }
  }, [collectionId, playlists, spotifyTracks, trackLookup])

  const handleOpenTrack = (track) => {
    navigate(`/listen/${track.id}?source=spotify`)
  }

  const renderTracks = () => {
    if (spotifyLibraryLoading || playlistsLoading) return <p className="muted">Loading collection…</p>
    if (collectionData.tracks.length === 0) return <p className="muted">No tracks available in this collection yet.</p>

    return (
      <div className="spotify-track-table">
        <div className="spotify-track-row header">
          <span>#</span>
          <span>Title</span>
          <span>Artist</span>
          <span className="duration">Duration</span>
          <span className="action">Listen</span>
        </div>
        {collectionData.tracks.map((track, index) => (
          <div key={track.id} className="spotify-track-row">
            <span className="muted small">{index + 1}</span>
            <span>
              <div className="spotify-track-title">{track.title || track.name || 'Untitled track'}</div>
              <div className="muted small">{track.subtitle || track.artist || 'Unknown artist'}</div>
            </span>
            <span className="muted">{track.artist || track.subtitle || '—'}</span>
            <span className="muted duration">{formatDuration(track.durationMs) || '—'}</span>
            <span className="action">
              <button className="button ghost" type="button" onClick={() => handleOpenTrack(track)}>
                Open listening view →
              </button>
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="page listening-surface">
      <div className="container">
        <div className="section" style={{ marginBottom: '1rem' }}>
          <button className="button ghost" type="button" onClick={() => navigate('/listening')}>
            ← Back to Listening
          </button>
        </div>

        <div className="section">
          <div className="section-header" style={{ alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {collectionData.imageUrl && (
                <img
                  src={collectionData.imageUrl}
                  alt="Cover art"
                  style={{ width: 96, height: 96, borderRadius: '0.5rem', objectFit: 'cover' }}
                />
              )}
              <div>
                <p className="muted small">Spotify collection</p>
                <h2 className="page-title" style={{ marginBottom: '0.35rem' }}>
                  {collectionData.title}
                </h2>
                <p className="muted" style={{ marginBottom: '0.25rem' }}>
                  {collectionData.subtitle}
                </p>
                <p className="muted small">{collectionData.meta}</p>
              </div>
            </div>
          </div>

          <div className="preview-card" style={{ padding: '1rem' }}>
            <div className="section-header" style={{ marginBottom: '0.5rem' }}>
              <h3>Tracks</h3>
              <span className="pill">{collectionData.tracks.length}</span>
            </div>
            {renderTracks()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpotifyCollectionPage
