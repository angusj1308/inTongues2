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
  const [spotifyLibrary, setSpotifyLibrary] = useState([])
  const [spotifyLibraryLoading, setSpotifyLibraryLoading] = useState(true)
  const [spotifySearchLoading, setSpotifySearchLoading] = useState(false)
  const [spotifySearchError, setSpotifySearchError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState('track')
  const [searchResults, setSearchResults] = useState({
    tracks: [],
    playlists: [],
    shows: [],
    artists: [],
    albums: [],
  })
  const [episodePanel, setEpisodePanel] = useState({ show: null, episodes: [], loading: false, error: '' })
  const [audioLoading, setAudioLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(true)
  const [error, setError] = useState('')

  const navigateToSpotifyItem = (item) => {
    if (!item) return
    navigate(`/listen/${item.id}?source=spotify`)
  }

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

  const handleSpotifySearch = async (event) => {
    event?.preventDefault()
    if (!user) return

    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) {
      setSpotifySearchError('Enter a search query to continue.')
      return
    }

    setSpotifySearchLoading(true)
    setSpotifySearchError('')

    try {
      const params = new URLSearchParams({
        q: trimmedQuery,
        type: searchType,
        uid: user.uid,
      })

      const response = await fetch(`http://localhost:4000/api/spotify/search?${params.toString()}`)
      if (!response.ok) throw new Error(await response.text())

      const data = await response.json()
      setSearchResults({
        tracks: data?.results?.tracks || [],
        playlists: data?.results?.playlists || [],
        shows: data?.results?.shows || [],
        artists: data?.results?.artists || [],
        albums: data?.results?.albums || [],
      })
    } catch (err) {
      console.error('Spotify search error', err)
      setSpotifySearchError('Unable to search Spotify right now.')
    } finally {
      setSpotifySearchLoading(false)
    }
  }

  const handleViewEpisodes = async (show) => {
    if (!user || !show?.spotifyId) return

    setEpisodePanel({ show, episodes: [], loading: true, error: '' })

    try {
      const response = await fetch(
        `http://localhost:4000/api/spotify/show/${encodeURIComponent(show.spotifyId)}/episodes?uid=${encodeURIComponent(user.uid)}`,
      )

      if (!response.ok) throw new Error(await response.text())

      const data = await response.json()
      setEpisodePanel({ show, episodes: data?.episodes || [], loading: false, error: '' })
    } catch (err) {
      console.error('Spotify episodes error', err)
      setEpisodePanel({ show, episodes: [], loading: false, error: 'Unable to load episodes right now.' })
    }
  }

  const handleCloseEpisodes = () => {
    setEpisodePanel({ show: null, episodes: [], loading: false, error: '' })
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
      setSearchResults({ tracks: [], playlists: [], shows: [], artists: [], albums: [] })
      setSpotifyLoading(false)
      return undefined
    }

    let cancelled = false

    setSpotifyLoading(true)
    setSpotifyError('')

    const loadStatus = async () => {
      try {
        const response = await fetch(
          `http://localhost:4000/api/spotify/status?uid=${encodeURIComponent(user.uid)}`,
        )
        if (!response.ok) throw new Error(await response.text())
        const data = await response.json()
        if (cancelled) return
        setSpotifyConnected(Boolean(data.connected))
      } catch (err) {
        console.error('Spotify status load error', err)
        if (!cancelled) setSpotifyError('Unable to check Spotify connection right now.')
      } finally {
        if (!cancelled) setSpotifyLoading(false)
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
                  onClick={() => navigate(`/listen/${item.id}`)}
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
            <h3>Spotify Search</h3>
            <p className="muted small">
              Search tracks, playlists, artists, albums, and podcast shows to add them to your inTongues library.
            </p>
          </div>

          {spotifyError && <p className="error">{spotifyError}</p>}

          {!spotifyConnected ? (
            <div>
              <p className="muted">Connect Spotify to search the full catalogue.</p>
              <button className="button primary" onClick={handleConnectSpotify} disabled={!user}>
                Connect Spotify
              </button>
            </div>
          ) : spotifyLoading ? (
            <p className="muted">Checking your Spotify connection…</p>
          ) : (
            <div className="preview-card">
              <form className="pill-row" style={{ gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={handleSpotifySearch}>
                <input
                  type="text"
                  placeholder="Search Spotify"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1, minWidth: '16rem' }}
                />
                <select value={searchType} onChange={(e) => setSearchType(e.target.value)} style={{ minWidth: '10rem' }}>
                  <option value="track">Tracks</option>
                  <option value="playlist">Playlists</option>
                  <option value="artist">Artists</option>
                  <option value="album">Albums</option>
                  <option value="show">Podcast Shows</option>
                </select>
                <button className="button primary" type="submit" disabled={spotifySearchLoading}>
                  {spotifySearchLoading ? 'Searching…' : 'Search Spotify'}
                </button>
              </form>

              {spotifySearchError && <p className="error">{spotifySearchError}</p>}

              <div className="pill-column" style={{ marginTop: '1rem', gap: '1rem' }}>
                {['tracks', 'playlists', 'artists', 'albums', 'shows'].map((key) => {
                  const itemsForType = searchResults[key] || []
                  if (!itemsForType.length) return null

                  const labels = {
                    tracks: 'Tracks',
                    playlists: 'Playlists',
                    artists: 'Artists',
                    albums: 'Albums',
                    shows: 'Podcast Shows',
                  }

                  return (
                    <div key={key} className="preview-card">
                      <div className="section-header">
                        <h3>{labels[key]}</h3>
                        <span className="pill">{itemsForType.length} results</span>
                      </div>
                      <div className="pill-column">
                        {itemsForType.map((item) => (
                          <div
                            key={item.spotifyId}
                            className="pill-row"
                            style={{ justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {item.imageUrl && (
                                <img
                                  src={item.imageUrl}
                                  alt="Cover art"
                                  style={{ width: 48, height: 48, borderRadius: '0.25rem', flexShrink: 0 }}
                                />
                              )}
                              <div>
                                <div className="small" style={{ fontWeight: 600 }}>
                                  {item.title}
                                </div>
                                <div className="muted small">{item.subtitle}</div>
                                <div className="muted small" style={{ textTransform: 'capitalize' }}>
                                  {item.type}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              {item.type === 'show' && (
                                <button className="button ghost" onClick={() => handleViewEpisodes(item)}>
                                  View Episodes →
                                </button>
                              )}
                              <button className="button ghost" onClick={() => handleAddSpotifyItem(item)}>
                                Add to Library
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {!spotifySearchLoading &&
                  Object.values(searchResults).every((list) => (list || []).length === 0) && (
                    <p className="muted" style={{ marginTop: '0.5rem' }}>
                      Start a search to see results from Spotify.
                    </p>
                  )}
              </div>

              {episodePanel.show && (
                <div className="preview-card" style={{ marginTop: '1rem' }}>
                  <div className="section-header">
                    <div>
                      <h3>Episodes — {episodePanel.show.title}</h3>
                      <p className="muted small">Browse episodes and add them individually to your library.</p>
                    </div>
                    <button className="button ghost" onClick={handleCloseEpisodes}>
                      Close
                    </button>
                  </div>

                  {episodePanel.loading ? (
                    <p className="muted">Loading episodes…</p>
                  ) : episodePanel.error ? (
                    <p className="error">{episodePanel.error}</p>
                  ) : episodePanel.episodes.length === 0 ? (
                    <p className="muted">No episodes found for this show.</p>
                  ) : (
                    <div className="pill-column">
                      {episodePanel.episodes.map((episode) => (
                        <div
                          key={episode.spotifyId}
                          className="pill-row"
                          style={{ justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}
                        >
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            {episode.imageUrl && (
                              <img
                                src={episode.imageUrl}
                                alt="Episode art"
                                style={{ width: 48, height: 48, borderRadius: '0.25rem', flexShrink: 0 }}
                              />
                            )}
                            <div>
                              <div className="small" style={{ fontWeight: 600 }}>
                                {episode.title}
                              </div>
                              <div className="muted small">{episode.subtitle}</div>
                            </div>
                          </div>
                          <button className="button ghost" onClick={() => handleAddSpotifyItem(episode)}>
                            Add to Library
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                <div
                  className="preview-card"
                  key={item.id}
                  onClick={() => navigateToSpotifyItem(item)}
                  style={{ cursor: 'pointer' }}
                >
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
                      onClick={(event) => {
                        event.stopPropagation()
                        navigateToSpotifyItem(item)
                      }}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Open listening view →
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
