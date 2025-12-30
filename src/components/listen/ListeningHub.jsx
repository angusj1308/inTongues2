import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import useAuth from '../../context/AuthContext'
import db from '../../firebase'
import { signOutFromSpotify } from '../../services/spotifyAuth'
import ImportYouTubePanel from './ImportYouTubePanel'
import ListeningMediaCard from './ListeningMediaCard'
import SpotifyCollectionCard from './SpotifyCollectionCard'
import { getYouTubeThumbnailUrl } from '../../utils/youtube'

const ListeningHub = ({ embedded = false, showBackButton = true }) => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [spotifyConnected, setSpotifyConnected] = useState(false)
  const [spotifyLoading, setSpotifyLoading] = useState(false)
  const [spotifyError, setSpotifyError] = useState('')
  const [spotifyLibrary, setSpotifyLibrary] = useState([])
  const [spotifyLibraryLoading, setSpotifyLibraryLoading] = useState(true)
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([])
  const [spotifyPlaylistsLoading, setSpotifyPlaylistsLoading] = useState(true)
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
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('')
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState([])
  const [playlistError, setPlaylistError] = useState('')
  const [audioLoading, setAudioLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(true)
  const [error, setError] = useState('')

  const activeLanguage = resolveSupportedLanguageLabel(
    profile?.lastUsedLanguage || profile?.myLanguages?.[0] || '',
    '',
  )
  const juanDescription = activeLanguage
    ? `Practice understanding conversational ${activeLanguage} while replying in your native language. Juan speaks only your target language so you can focus 100% on comprehension, not output.`
    : 'Practice understanding conversational language while replying in your native language. Juan speaks only your target language so you can focus 100% on comprehension, not output.'

  const spotifyTracks = spotifyLibrary.filter((item) => item.type === 'track')

  const resetSpotifyState = () => {
    setSpotifyConnected(false)
    setSpotifyError('')
    setSpotifyLibrary([])
    setSpotifyLibraryLoading(false)
    setSpotifyPlaylists([])
    setSpotifyPlaylistsLoading(false)
    setSpotifySearchLoading(false)
    setSpotifySearchError('')
    setSearchResults({ tracks: [], playlists: [], shows: [], artists: [], albums: [] })
    setEpisodePanel({ show: null, episodes: [], loading: false, error: '' })
    setSearchQuery('')
    setShowCreatePlaylist(false)
    setNewPlaylistName('')
    setNewPlaylistDescription('')
    setSelectedPlaylistTracks([])
    setPlaylistError('')
  }

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

  const handleSignOutSpotify = async () => {
    if (!user) return

    resetSpotifyState()

    try {
      await signOutFromSpotify(handleConnectSpotify)
    } catch (err) {
      console.error('Spotify sign out error', err)
      handleConnectSpotify()
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
        `http://localhost:4000/api/spotify/show/${encodeURIComponent(show.spotifyId)}/episodes?uid=${encodeURIComponent(
          user.uid,
        )}`,
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

  const getTracksMeta = (tracks) => {
    const totalDuration = tracks.reduce((sum, track) => sum + (track.durationMs || 0), 0)
    const parts = [`${tracks.length} tracks`]
    if (totalDuration) parts.push(formatDuration(totalDuration))
    return parts.join(' · ')
  }

  const togglePlaylistTrackSelection = (trackId) => {
    setSelectedPlaylistTracks((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId],
    )
  }

  const handleCreatePlaylist = async (event) => {
    event?.preventDefault()
    if (!user) return

    const trimmedName = newPlaylistName.trim()
    if (!trimmedName) {
      setPlaylistError('Enter a playlist name to continue.')
      return
    }

    setPlaylistError('')
    try {
      const playlistRef = await addDoc(collection(db, 'users', user.uid, 'spotifyPlaylists'), {
        name: trimmedName,
        description: newPlaylistDescription.trim(),
        trackIds: selectedPlaylistTracks,
        createdAt: serverTimestamp(),
      })

      setShowCreatePlaylist(false)
      setNewPlaylistName('')
      setNewPlaylistDescription('')
      setSelectedPlaylistTracks([])

      navigate(`/listening/spotify/playlist-${encodeURIComponent(playlistRef.id)}`)
    } catch (err) {
      console.error('Create Spotify playlist error', err)
      setPlaylistError('Unable to create this playlist right now.')
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
        const nextItems = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
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
        const nextVideos = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
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
        const nextItems = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        setSpotifyLibrary(nextItems)
        setSpotifyLibraryLoading(false)
      },
      (err) => {
        console.error('Spotify library load error', err)
        setSpotifyLibraryLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  useEffect(() => {
    if (!user) {
      setSpotifyPlaylists([])
      setSpotifyPlaylistsLoading(false)
      return undefined
    }

    setSpotifyPlaylistsLoading(true)
    const playlistsRef = collection(db, 'users', user.uid, 'spotifyPlaylists')
    const playlistsQuery = query(playlistsRef, orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      playlistsQuery,
      (snapshot) => {
        const nextPlaylists = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        setSpotifyPlaylists(nextPlaylists)
        setSpotifyPlaylistsLoading(false)
      },
      (err) => {
        console.error('Spotify playlists load error', err)
        setSpotifyPlaylistsLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  const spotifyTrackLookup = spotifyTracks.reduce((map, track) => {
    map.set(track.id, track)
    return map
  }, new Map())

  const albumCollections = Object.values(
    spotifyTracks.reduce((acc, track) => {
      const albumKey = track.albumId || track.albumName
      if (!albumKey) return acc

      if (!acc[albumKey]) {
        acc[albumKey] = {
          id: `album-${encodeURIComponent(albumKey)}`,
          title: track.albumName || 'Album',
          subtitle: track.artist || track.subtitle || 'Album',
          imageUrl: track.imageUrl,
          tracks: [],
        }
      }

      acc[albumKey].tracks.push(track)
      if (!acc[albumKey].imageUrl && track.imageUrl) acc[albumKey].imageUrl = track.imageUrl
      return acc
    }, {}),
  ).map((album) => ({
    ...album,
    meta: getTracksMeta(album.tracks),
    ctaLabel: 'Open album →',
  }))

  const playlistCollections = spotifyPlaylists.map((playlist) => {
    const tracks = (playlist.trackIds || [])
      .map((trackId) => spotifyTrackLookup.get(trackId))
      .filter(Boolean)
    const imageUrl = tracks.find((track) => track.imageUrl)?.imageUrl

    return {
      id: `playlist-${encodeURIComponent(playlist.id)}`,
      title: playlist.name || 'Playlist',
      subtitle: playlist.description || `${tracks.length} tracks`,
      meta: getTracksMeta(tracks),
      imageUrl,
      tracks,
    }
  })

  const allTracksCollection = {
    id: 'all-tracks',
    title: 'All Tracks',
    subtitle: 'Everything you have imported from Spotify',
    meta: getTracksMeta(spotifyTracks),
    imageUrl: spotifyTracks.find((track) => track.imageUrl)?.imageUrl,
  }

  return (
    <div className={`listening-hub ${embedded ? '' : 'page'}`}>
      <div className={`${embedded ? '' : 'card dashboard-card'} listening-surface`}>
        {showBackButton && !embedded && (
          <div className="page-header" style={{ justifyContent: 'flex-end' }}>
            <button className="button ghost" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        )}

        <div className="section listening-audiobooks">
          <div className="section-header">
            <h3>Audiobooks</h3>
          </div>

          {audioLoading ? (
            <p className="muted">Loading audiobooks…</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : items.length === 0 ? (
            <p className="muted">No audiobooks yet. Import a video or story to get started.</p>
          ) : (
            <div className="listen-shelf">
              {items.map((item) => {
                const isGeneratedStory = Boolean(
                  item.source === 'generated' ||
                    item.source === 'generator' ||
                    item.origin === 'generator' ||
                    item.generated === true ||
                    item.generatorMetadata ||
                    (!item.source && typeof item.genre === 'string' && item.genre),
                )

                return (
                  <ListeningMediaCard
                    key={item.id}
                    type="audio"
                    title={item.title || 'Untitled story'}
                    channel={
                      isGeneratedStory ? 'inTongues Generator' : item.author || item.language || 'Audio story'
                    }
                    thumbnailUrl={item.coverImageUrl || item.imageUrl || item.coverImage}
                    tags={[item.level && `Level ${item.level}`]}
                    onPlay={() => navigate(`/listen/${item.id}`)}
                    onDelete={() => handleDeleteStory(item.id)}
                    progress={item.progress ?? 0}
                    actionLabel="Play →"
                    preparationStatus={item.preparationStatus}
                    preparationProgress={item.preparationProgress}
                  />
                )
              })}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <h3>YouTube videos</h3>
          </div>

          {videoLoading ? (
            <p className="muted">Loading videos…</p>
          ) : youtubeVideos.length === 0 ? (
            <p className="muted">No YouTube videos imported yet.</p>
          ) : (
            <div className="listen-shelf">
              {youtubeVideos.map((video) => (
                <ListeningMediaCard
                  key={video.id}
                  type="youtube"
                  title={video.title || 'Untitled video'}
                  channel={video.channelTitle || video.channel || 'Unknown channel'}
                  thumbnailUrl={getYouTubeThumbnailUrl(video.youtubeUrl)}
                  onPlay={() => navigate(`/cinema/${video.id}`)}
                  onDelete={() => handleDeleteVideo(video.id)}
                  progress={video.progress ?? 0}
                  status={video.status}
                  preparationStatus={video.preparationStatus}
                  preparationProgress={video.preparationProgress}
                />
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <h3>Spotify playlists</h3>
          </div>

          {spotifyLibraryLoading ? (
            <p className="muted">Loading Spotify library…</p>
          ) : spotifyLibrary.length === 0 && spotifyPlaylists.length === 0 ? (
            <p className="muted">No Spotify items saved yet.</p>
          ) : (
            <div>
              <div className="listen-shelf">
                {spotifyTracks.length > 0 && (
                  <SpotifyCollectionCard
                    key={allTracksCollection.id}
                    title={allTracksCollection.title}
                    meta={allTracksCollection.meta}
                    imageUrl={allTracksCollection.imageUrl}
                    onOpen={() => navigate(`/listening/spotify/${allTracksCollection.id}`)}
                    ctaLabel="View all tracks →"
                  />
                )}

                {albumCollections.map((album) => (
                  <SpotifyCollectionCard
                    key={album.id}
                    title={album.title}
                    meta={album.meta}
                    imageUrl={album.imageUrl}
                    onOpen={() => navigate(`/listening/spotify/${album.id}`)}
                    ctaLabel={album.ctaLabel}
                  />
                ))}

                {spotifyPlaylistsLoading ? (
                  <p className="muted" style={{ padding: '0.5rem 0' }}>Loading playlists…</p>
                ) : (
                  playlistCollections.map((playlist) => (
                    <SpotifyCollectionCard
                      key={playlist.id}
                      title={playlist.title}
                      meta={playlist.meta}
                      imageUrl={playlist.imageUrl}
                      onOpen={() => navigate(`/listening/spotify/${playlist.id}`)}
                      ctaLabel="Open playlist →"
                    />
                  ))
                )}

                <div
                  className="preview-card spotify-collection-card create"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowCreatePlaylist(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setShowCreatePlaylist(true)
                    }
                  }}
                >
                  <div className="spotify-collection-cover create">
                    <div className="spotify-collection-cover-plus">+</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="section">
          <div className="preview-card">
            <div className="section-header" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3>Comprehension practice with Juan</h3>
                <p className="muted small">{juanDescription}</p>
              </div>
            </div>

            <button className="button primary" onClick={() => navigate('/juan-comprehension')}>
              Start practice
            </button>
          </div>
        </div>

        <div className="section">
          <div className="importers-row">
            <div className="importer-left">
              <div className="preview-card">
                <div className="section-header" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h3>Spotify Search</h3>
                    <p className="muted small">
                      Search tracks, playlists, artists, albums, and podcast shows to add them to your inTongues
                      library.
                    </p>
                  </div>
                  {spotifyConnected && !spotifyLoading && (
                    <button className="button ghost" onClick={handleSignOutSpotify}>
                      Sign out of Spotify
                    </button>
                  )}
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
                  <div>
                    <form
                      className="pill-row"
                      style={{ gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
                      onSubmit={handleSpotifySearch}
                    >
                      <input
                        type="text"
                        placeholder="Search Spotify"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ flex: 1, minWidth: '16rem' }}
                      />
                      <select
                        value={searchType}
                        onChange={(e) => setSearchType(e.target.value)}
                        style={{ minWidth: '10rem' }}
                      >
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
            </div>

            <div className="importer-right">
              <ImportYouTubePanel headingLevel="h3" layout="card" />
            </div>
          </div>
        </div>

        {showCreatePlaylist && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <div className="section-header" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3>Create playlist</h3>
                  <p className="muted small">Select tracks to include and name your playlist.</p>
                </div>
                <button className="button ghost" type="button" onClick={() => setShowCreatePlaylist(false)}>
                  Close
                </button>
              </div>

              <form className="pill-column" style={{ gap: '0.75rem' }} onSubmit={handleCreatePlaylist}>
                <div className="pill-column">
                  <label className="pill-column">
                    <span className="muted small">Playlist name</span>
                    <input
                      type="text"
                      value={newPlaylistName}
                      onChange={(event) => setNewPlaylistName(event.target.value)}
                      placeholder="My playlist"
                      required
                    />
                  </label>
                  <label className="pill-column">
                    <span className="muted small">Description (optional)</span>
                    <textarea
                      value={newPlaylistDescription}
                      onChange={(event) => setNewPlaylistDescription(event.target.value)}
                      placeholder="What is this playlist about?"
                    />
                  </label>
                </div>

                <div className="pill-column" style={{ gap: '0.5rem' }}>
                  <div className="section-header" style={{ marginTop: '0.25rem' }}>
                    <h4>Select tracks</h4>
                    <span className="pill">{selectedPlaylistTracks.length}</span>
                  </div>
                  <div className="playlist-track-list">
                    {spotifyTracks.length === 0 ? (
                      <p className="muted">Import tracks from Spotify to start building playlists.</p>
                    ) : (
                      spotifyTracks.map((track) => (
                        <label key={track.id} className="playlist-track-option">
                          <input
                            type="checkbox"
                            checked={selectedPlaylistTracks.includes(track.id)}
                            onChange={() => togglePlaylistTrackSelection(track.id)}
                          />
                          {track.imageUrl && <img src={track.imageUrl} alt="Track cover" />}
                          <div>
                            <div className="spotify-track-title">{track.title || track.name || 'Untitled track'}</div>
                            <div className="muted small">
                              {track.artist || track.subtitle || 'Unknown artist'} · {formatDuration(track.durationMs) || '—'}
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {playlistError && <p className="error">{playlistError}</p>}

                <div className="pill-row" style={{ justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button className="button ghost" type="button" onClick={() => setShowCreatePlaylist(false)}>
                    Cancel
                  </button>
                  <button className="button primary" type="submit" disabled={spotifyTracks.length === 0}>
                    Create playlist
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ListeningHub
