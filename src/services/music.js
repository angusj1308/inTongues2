import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  updateDoc,
  addDoc,
  writeBatch,
} from 'firebase/firestore'
import db from '../firebase'

// Firestore layout (front-end stubs — backend may evolve):
//   users/{uid}/musicArtistFollows/{artistId}
//   users/{uid}/musicSavedAlbums/{albumId}
//   users/{uid}/musicSavedTracks/{trackId}
//   users/{uid}/musicPins/{pinId}        (pinned artists + playlists, with `order`)
//   users/{uid}/musicTrackStates/{trackId}  (wordsStudied, totalWords, lastOpenedAt)
//   users/{uid}/musicPlaylists/{playlistId} (name, description, trackIds)

const followsCol = (uid) => collection(db, 'users', uid, 'musicArtistFollows')
const savedAlbumsCol = (uid) => collection(db, 'users', uid, 'musicSavedAlbums')
const savedTracksCol = (uid) => collection(db, 'users', uid, 'musicSavedTracks')
const pinsCol = (uid) => collection(db, 'users', uid, 'musicPins')
const trackStatesCol = (uid) => collection(db, 'users', uid, 'musicTrackStates')
const playlistsCol = (uid) => collection(db, 'users', uid, 'musicPlaylists')

// Subscriptions

export const subscribeFollowedArtists = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(followsCol(uid), orderBy('followedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeFollowedArtists error', err)
      callback([])
    },
  )
}

export const subscribeSavedAlbums = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(savedAlbumsCol(uid), orderBy('savedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeSavedAlbums error', err)
      callback([])
    },
  )
}

export const subscribeSavedTracks = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(savedTracksCol(uid), orderBy('savedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeSavedTracks error', err)
      callback([])
    },
  )
}

export const subscribePins = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(pinsCol(uid), orderBy('order', 'asc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('music subscribePins error', err)
      callback([])
    },
  )
}

export const subscribeTrackStates = (uid, callback) => {
  if (!uid) return () => {}
  return onSnapshot(
    trackStatesCol(uid),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeTrackStates error', err)
      callback([])
    },
  )
}

export const subscribePlaylists = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(playlistsCol(uid), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('music subscribePlaylists error', err)
      callback([])
    },
  )
}

// Mutations

export const followArtist = async (uid, artist) => {
  if (!uid || !artist?.id) return
  await setDoc(doc(followsCol(uid), artist.id), {
    artistId: artist.id,
    name: artist.name || '',
    coverUrl: artist.coverUrl || '',
    genres: artist.genres || [],
    followedAt: serverTimestamp(),
  })
}

export const unfollowArtist = async (uid, artistId) => {
  if (!uid || !artistId) return
  await deleteDoc(doc(followsCol(uid), artistId))
}

export const saveAlbum = async (uid, album) => {
  if (!uid || !album?.id) return
  // Persist tracklist alongside album so the Tracks tab can flatten saved
  // albums into the saved-tracks view (matches Apple/Spotify behaviour).
  const tracks = Array.isArray(album.tracks)
    ? album.tracks.map((t) => ({
        id: String(t.id || ''),
        title: t.title || '',
        durationMs: t.durationMs || 0,
        trackNumber: t.trackNumber || null,
      })).filter((t) => t.id)
    : []
  await setDoc(doc(savedAlbumsCol(uid), album.id), {
    albumId: album.id,
    title: album.title || '',
    artistName: album.artistName || '',
    artistId: album.artistId || '',
    year: album.year || null,
    coverUrl: album.coverUrl || '',
    tracks,
    savedAt: serverTimestamp(),
  })
}

export const unsaveAlbum = async (uid, albumId) => {
  if (!uid || !albumId) return
  await deleteDoc(doc(savedAlbumsCol(uid), albumId))
}

// Drop a single track from a saved album's embedded tracklist. Used when the
// user wants to remove an album-derived track from the Tracks tab without
// unsaving the whole album.
export const removeTrackFromSavedAlbum = async (uid, albumId, trackId) => {
  if (!uid || !albumId || !trackId) return
  const ref = doc(savedAlbumsCol(uid), albumId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const next = (data.tracks || []).filter((t) => String(t.id) !== String(trackId))
  await updateDoc(ref, { tracks: next })
}

export const saveTrack = async (uid, track) => {
  if (!uid || !track?.id) return
  await setDoc(doc(savedTracksCol(uid), track.id), {
    trackId: track.id,
    title: track.title || '',
    artistName: track.artistName || '',
    artistId: track.artistId || '',
    albumName: track.albumName || '',
    albumId: track.albumId || '',
    coverUrl: track.coverUrl || '',
    durationMs: track.durationMs || 0,
    savedAt: serverTimestamp(),
  })
}

export const unsaveTrack = async (uid, trackId) => {
  if (!uid || !trackId) return
  await deleteDoc(doc(savedTracksCol(uid), trackId))
}

export const pinItem = async (uid, item, currentMaxOrder = 0) => {
  if (!uid || !item) return
  // item shape: { kind: 'artist' | 'playlist', refId, title, coverUrl }
  await addDoc(pinsCol(uid), {
    kind: item.kind,
    refId: item.refId,
    title: item.title || '',
    coverUrl: item.coverUrl || '',
    order: currentMaxOrder + 1,
    pinnedAt: serverTimestamp(),
  })
}

export const unpinByRef = async (uid, refId) => {
  if (!uid || !refId) return
  const snap = await getDocs(pinsCol(uid))
  const batch = writeBatch(db)
  snap.docs.forEach((d) => {
    if (d.data().refId === refId) batch.delete(d.ref)
  })
  await batch.commit()
}

export const reorderPins = async (uid, orderedIds) => {
  if (!uid || !orderedIds?.length) return
  const batch = writeBatch(db)
  orderedIds.forEach((pinId, index) => {
    batch.update(doc(pinsCol(uid), pinId), { order: index + 1 })
  })
  await batch.commit()
}

export const createPlaylist = async (uid, { name, description }) => {
  if (!uid || !name?.trim()) return null
  const docRef = await addDoc(playlistsCol(uid), {
    name: name.trim(),
    description: description?.trim() || '',
    trackIds: [],
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export const addTrackToPlaylist = async (uid, playlistId, trackId) => {
  if (!uid || !playlistId || !trackId) return
  const ref = doc(playlistsCol(uid), playlistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const current = snap.data().trackIds || []
  if (current.includes(trackId)) return
  await updateDoc(ref, { trackIds: [...current, trackId] })
}

// Stubbed external endpoints — returns empty results until backend lands.

export const searchMusic = async ({ query: q, language, limit: max = 25, offset } = {}) => {
  if (!q?.trim()) return { artists: [], albums: [], tracks: [] }
  try {
    const params = new URLSearchParams({ q, lang: language || '', limit: String(max) })
    if (offset != null) params.set('offset', String(offset))
    const res = await fetch(`/api/music/search?${params.toString()}`)
    if (!res.ok) return { artists: [], albums: [], tracks: [] }
    return await res.json()
  } catch {
    return { artists: [], albums: [], tracks: [] }
  }
}

export const fetchGenreShows = async ({ genre, language, limit: max = 25, offset } = {}) => {
  if (!genre) return { artists: [], albums: [] }
  try {
    const params = new URLSearchParams({ lang: language || '', limit: String(max) })
    if (offset != null) params.set('offset', String(offset))
    const res = await fetch(
      `/api/music/genre/${encodeURIComponent(genre)}?${params.toString()}`,
    )
    if (!res.ok) return { artists: [], albums: [] }
    return await res.json()
  } catch {
    return { artists: [], albums: [] }
  }
}

export const fetchArtist = async (artistId, { language } = {}) => {
  if (!artistId) return null
  try {
    const params = new URLSearchParams()
    if (language) params.set('lang', language)
    const qs = params.toString()
    const res = await fetch(`/api/music/artist/${encodeURIComponent(artistId)}${qs ? `?${qs}` : ''}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export const fetchTrack = async (trackId, { language } = {}) => {
  if (!trackId) return null
  try {
    const params = new URLSearchParams()
    if (language) params.set('lang', language)
    const qs = params.toString()
    const res = await fetch(`/api/music/track/${encodeURIComponent(trackId)}${qs ? `?${qs}` : ''}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Time-synced lyrics (Musixmatch richsync) for an Apple Music track.
// Returns { segments: [{ start, end, text }], translations: [string] } —
// segments empty when no lyrics; translations aligned 1:1 with segments
// when the user's native language is passed and Musixmatch has a
// translation whose line count matches the source.
export const fetchTrackLyrics = async (trackId, { language, native } = {}) => {
  if (!trackId) return { segments: [], translations: [] }
  try {
    const params = new URLSearchParams()
    if (language) params.set('lang', language)
    if (native) params.set('native', native)
    const qs = params.toString()
    const res = await fetch(`/api/music/lyrics/${encodeURIComponent(trackId)}${qs ? `?${qs}` : ''}`)
    if (!res.ok) return { segments: [], translations: [] }
    return await res.json()
  } catch {
    return { segments: [], translations: [] }
  }
}

export const fetchAlbum = async (albumId, { language } = {}) => {
  if (!albumId) return null
  try {
    const params = new URLSearchParams()
    if (language) params.set('lang', language)
    const qs = params.toString()
    const res = await fetch(`/api/music/album/${encodeURIComponent(albumId)}${qs ? `?${qs}` : ''}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
