import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import useAuth from '../context/AuthContext'
import db from '../firebase'

const ListeningLibrary = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [spotifyConnected, setSpotifyConnected] = useState(false)
  const [spotifyLoading, setSpotifyLoading] = useState(false)
  const [spotifyError, setSpotifyError] = useState('')
  const [spotifyTracks, setSpotifyTracks] = useState([])
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([])
  const [spotifyShows, setSpotifyShows] = useState([])
  const [spotifyLibrary, setSpotifyLibrary] = useState([])
  const [spotifyLibraryLoading, setSpotifyLibraryLoading] = useState(true)
  const [audioLoading, setAudioLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(true)
  const [error, setError] = useState('')

  const handleDeleteStory = async (storyId) => {
    if (!user || !storyId) return

    const confirmed = window.confirm('Delete this story and its audio permanently?')
    if (!confirmed) return

    try {
      const response = await fetch('http://localhost:4000/api/delete-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, storyId }),
      })

      if (!response.ok) {
        console.error('Delete story failed:', await response.text())
        window.alert('Unable to delete this story right now.')
      }

      // No manual state update needed: onSnapshot will refresh list.
    } catch (err) {
      console.error('Error deleting story:', err)
      window.alert('Unable to delete this story right now.')
    }
  }

  const handleDeleteVideo = async (videoId) => {
    if (!user || !videoId) return

    const confirmed = window.confirm('Delete this YouTube import and its transcripts permanently?')
    if (!confirmed) return

    try {
      const videoRef = doc(db, 'users', user.uid, 'youtubeVideos', videoId)
      const transcriptsRef = collection(videoRef, 'transcripts')
      const transcriptSnap = await getDocs(transcriptsRef)

      if (!transcriptSnap.empty) {
        const batch = writeBatch(db)
        transcriptSnap.forEach((docSnap) => batch.delete(docSnap.ref))
        await batch.commit()
      }

      await deleteDoc(videoRef)
    } catch (err) {
      console.error('Error deleting YouTube video:', err)
      window.alert('Unable to delete this YouTube video right now.')
    }
  }

  const handleConnectSpotify = async () => {
    if (!user) return
    try {
      const response = await fetch(
        `http://localhost:4000/api/spotify/login?uid=${encodeURIComponent(user.uid)}`,
      )
      if (!response.ok) throw new Error('Unable to start Spotify login')
      const data = await response.json()
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Spotify login error', err)
      setSpotifyError('Unable to connect to Spotify right now.')
    }
  }

  const handleAddSpotifyItem = async (item) => {
    if (!user || !item?.spotifyId) return
    try {
      const response = await fetch('http://localhost:4000/api/spotify/library/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, ...item }),
      })

      if (!response.ok) throw new Error(await response.text())
      window.alert('Added to your Spotify library in inTongues.')
    } catch (err) {
      console.error('Add Spotify item error', err)
      window.alert('Unable to save this Spotify item right now.')
    }
  }

  const loadSpotifyLists = async (uid) => {
    setSpotifyLoading(true)
    setSpotifyError('')

    const fetchList = async (path) => {
      const response = await fetch(`http://localhost:4000${path}?uid=${encodeURIComponent(uid)}`)
      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()
      return data.items || []
    }

    try {
      const [tracks, playlists, shows] = await Promise.all([
        fetchList('/api/spotify/me/tracks'),
        fetchList('/api/spotify/me/playlists'),
        fetchList('/api/spotify/me/shows'),
      ])

      setSpotifyTracks(tracks)
      setSpotifyPlaylists(playlists)
      setSpotifyShows(shows)
    } catch (err) {
      console.error('Spotify fetch error', err)
      setSpotifyError('Unable to load Spotify data right now.')
    } finally {
      setSpotifyLoading(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setItems([])
      setAudioLoading(false)
      return undefined
    }

    setError('')
    setAudioLoading(true)

    const storiesRef = collection(db, 'users', user.uid, 'stories')
    const listeningQuery = query(
      storiesRef,
      where('hasFullAudio', '==', true),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      listeningQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setItems(nextItems)
        setAudioLoading(false)
      },
      (err) => {
        console.error('Listening library load error:', err)
        setError('Unable to load your audiobooks right now.')
        setAudioLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  useEffect(() => {
    if (!user) {
      setYoutubeVideos([])
      setVideoLoading(false)
      return undefined
    }

    setVideoLoading(true)

    const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')
    const videosQuery = query(videosRef, orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      videosQuery,
      (snapshot) => {
        const nextVideos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setYoutubeVideos(nextVideos)
        setVideoLoading(false)
      },
      (err) => {
        console.error('Listening library YouTube load error:', err)
        setError('Unable to load your YouTube videos right now.')
        setVideoLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  useEffect(() => {
    if (!user) {
      setSpotifyConnected(false)
      setSpotifyTracks([])
      setSpotifyPlaylists([])
      setSpotifyShows([])
      return undefined
    }

    let cancelled = false

    const loadStatus = async () => {
      try {
        const response = await fetch(
          `http://localhost:4000/api/spotify/status?uid=${encodeURIComponent(user.uid)}`,
        )
        if (!response.ok) throw new Error(await response.text())
        const data = await response.json()
        if (cancelled) return
        setSpotifyConnected(Boolean(data.connected))
        if (data.connected) {
          loadSpotifyLists(user.uid)
        }
      } catch (err) {
        console.error('Spotify status load error', err)
        if (!cancelled) setSpotifyError('Unable to check Spotify connection right now.')
      }
    }

    loadStatus()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setSpotifyLibrary([])
      setSpotifyLibraryLoading(false)
      return undefined
    }

    setSpotifyLibraryLoading(true)
    const libraryRef = collection(db, 'users', user.uid, 'spotifyItems')
    const libraryQuery = query(libraryRef, orderBy('addedAt', 'desc'))

    const unsubscribe = onSnapshot(
      libraryQuery,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        setSpotifyLibrary(items)
        setSpotifyLibraryLoading(false)
      },
      (err) => {
        console.error('Spotify library load error', err)
        setSpotifyLibraryLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Listening Library</h1>
            <p className="muted small">Audiobooks and YouTube videos ready for listening.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="button" onClick={() => navigate('/importaudio/video')}>
              Import audio or video
            </button>
            <button className="button ghost" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="section">
          <div className="section-header">
            <h3>Audiobooks</h3>
            <p className="muted small">Stories with generated audio ready to play.</p>
          </div>

          {audioLoading ? (
            <p className="muted">Loading audiobooks…</p>
          ) : items.length === 0 ? (
            <p className="muted">No audiobooks available</p>
          ) : (
            <div className="library-list">
              {items.map((item) => (
                <div
                  className="preview-card"
                  key={item.id}
                  onClick={() => navigate(`/audio/${item.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="section-header">
                    <h3>{item.title || 'Untitled story'}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="pill" style={{ background: '#dcfce7', color: '#166534' }}>
                        Audio Ready
                      </span>
                      <button
                        className="button ghost"
                        style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDeleteStory(item.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="pill-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {item.language && <span className="pill primary">in{item.language}</span>}
                      {item.level && <span className="pill">Level {item.level}</span>}
                    </div>
                    <span className="button ghost" style={{ padding: '0.25rem 0.75rem' }}>
                      Open audio player →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <h3>YouTube videos</h3>
            <p className="muted small">Imported videos that open inside inTongues Cinema.</p>
          </div>

          {videoLoading ? (
            <p className="muted">Loading videos…</p>
          ) : youtubeVideos.length === 0 ? (
            <p className="muted">No YouTube videos imported yet.</p>
          ) : (
            <div className="library-list">
              {youtubeVideos.map((video) => (
                <div
                  className="preview-card"
                  key={video.id}
                  onClick={() => navigate(`/cinema/${video.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="section-header">
                    <h3>{video.title || 'Untitled video'}</h3>
                    <span className="pill" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                      YouTube
                    </span>
                    <button
                      className="button ghost"
                      style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteVideo(video.id)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="pill-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="pill">Opens in inTongues Cinema</span>
                    </div>
                    <span className="button ghost" style={{ padding: '0.25rem 0.75rem' }}>
                      Watch video →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <h3>Spotify</h3>
            <p className="muted small">Connect your Spotify account to pull in music and podcasts.</p>
          </div>

          {spotifyError && <p className="error">{spotifyError}</p>}

          {!spotifyConnected ? (
            <div>
              <p className="muted">Connect Spotify to see your liked songs, playlists, and shows.</p>
              <button className="button primary" onClick={handleConnectSpotify} disabled={!user}>
                Connect Spotify
              </button>
            </div>
          ) : spotifyLoading ? (
            <p className="muted">Loading your Spotify content…</p>
          ) : (
            <div className="library-list">
              <div className="preview-card">
                <div className="section-header">
                  <h3>Liked Songs</h3>
                  <span className="pill" style={{ background: '#dcfce7', color: '#166534' }}>
                    {spotifyTracks.length} tracks
                  </span>
                </div>
                {spotifyTracks.length === 0 ? (
                  <p className="muted">No liked songs found.</p>
                ) : (
                  <div className="pill-column">
                    {spotifyTracks.slice(0, 6).map((track) => (
                      <div
                        key={track.spotifyId}
                        className="pill-row"
                        style={{ justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {track.imageUrl && (
                            <img
                              src={track.imageUrl}
                              alt="Album art"
                              style={{ width: 48, height: 48, borderRadius: '0.25rem' }}
                            />
                          )}
                          <div>
                            <div className="small" style={{ fontWeight: 600 }}>
                              {track.title}
                            </div>
                            <div className="muted small">{track.subtitle}</div>
                          </div>
                        </div>
                        <button
                          className="button ghost"
                          onClick={() => handleAddSpotifyItem(track)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Add to Library
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="preview-card">
                <div className="section-header">
                  <h3>Playlists</h3>
                  <span className="pill" style={{ background: '#e0f2fe', color: '#1d4ed8' }}>
                    {spotifyPlaylists.length} playlists
                  </span>
                </div>
                {spotifyPlaylists.length === 0 ? (
                  <p className="muted">No playlists found.</p>
                ) : (
                  <div className="pill-column">
                    {spotifyPlaylists.slice(0, 6).map((playlist) => (
                      <div
                        key={playlist.spotifyId}
                        className="pill-row"
                        style={{ justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {playlist.imageUrl && (
                            <img
                              src={playlist.imageUrl}
                              alt="Playlist art"
                              style={{ width: 48, height: 48, borderRadius: '0.25rem' }}
                            />
                          )}
                          <div>
                            <div className="small" style={{ fontWeight: 600 }}>
                              {playlist.title}
                            </div>
                            <div className="muted small">{playlist.subtitle}</div>
                          </div>
                        </div>
                        <button
                          className="button ghost"
                          onClick={() => handleAddSpotifyItem(playlist)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Add to Library
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="preview-card">
                <div className="section-header">
                  <h3>Podcasts & Shows</h3>
                  <span className="pill" style={{ background: '#fef9c3', color: '#92400e' }}>
                    {spotifyShows.length} saved shows
                  </span>
                </div>
                {spotifyShows.length === 0 ? (
                  <p className="muted">No saved shows found.</p>
                ) : (
                  <div className="pill-column">
                    {spotifyShows.slice(0, 6).map((show) => (
                      <div
                        key={show.spotifyId}
                        className="pill-row"
                        style={{ justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {show.imageUrl && (
                            <img
                              src={show.imageUrl}
                              alt="Show art"
                              style={{ width: 48, height: 48, borderRadius: '0.25rem' }}
                            />
                          )}
                          <div>
                            <div className="small" style={{ fontWeight: 600 }}>
                              {show.title}
                            </div>
                            <div className="muted small">{show.subtitle}</div>
                          </div>
                        </div>
                        <button
                          className="button ghost"
                          onClick={() => handleAddSpotifyItem(show)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Add to Library
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <h3>My Spotify Library</h3>
            <p className="muted small">Items you saved from Spotify into inTongues.</p>
          </div>

          {spotifyLibraryLoading ? (
            <p className="muted">Loading Spotify library…</p>
          ) : spotifyLibrary.length === 0 ? (
            <p className="muted">No Spotify items saved yet.</p>
          ) : (
            <div className="library-list">
              {spotifyLibrary.map((item) => (
                <div className="preview-card" key={item.id}>
                  <div className="section-header">
                    <h3>{item.title || 'Untitled Spotify item'}</h3>
                    <span className="pill">{item.type || 'spotify'}</span>
                    <span className="pill" style={{ background: '#e5e7eb', color: '#111827' }}>
                      {item.transcriptStatus || 'pending'}
                    </span>
                  </div>
                  <div className="pill-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt="Cover art"
                          style={{ width: 48, height: 48, borderRadius: '0.25rem' }}
                        />
                      )}
                      <div>
                        <div className="muted small">{item.subtitle}</div>
                        <div className="muted small">{item.spotifyUri}</div>
                      </div>
                    </div>
                    <button
                      className="button ghost"
                      onClick={() =>
                        window.alert(
                          'Spotify playback UI coming soon. Item stored with transcript placeholder.',
                        )
                      }
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Open player →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ListeningLibrary
