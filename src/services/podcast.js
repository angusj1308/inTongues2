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
  limit,
} from 'firebase/firestore'
import db from '../firebase'

// Firestore layout (front-end stubs — backend may evolve):
//   users/{uid}/podcastFollows/{showId}
//   users/{uid}/podcastPins/{pinId}        (pinned shows + playlists, with `order`)
//   users/{uid}/podcastEpisodeStates/{episodeId}  (progressMs, durationMs, lastPlayedAt, state)
//   users/{uid}/podcastPlaylists/{playlistId}     (name, description, episodeIds)

const followsCol = (uid) => collection(db, 'users', uid, 'podcastFollows')
const pinsCol = (uid) => collection(db, 'users', uid, 'podcastPins')
const episodeStatesCol = (uid) => collection(db, 'users', uid, 'podcastEpisodeStates')
const playlistsCol = (uid) => collection(db, 'users', uid, 'podcastPlaylists')

export const subscribeFollowedShows = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(followsCol(uid), orderBy('followedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeFollowedShows error', err)
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
      console.error('subscribePins error', err)
      callback([])
    },
  )
}

export const subscribeEpisodeStates = (uid, callback) => {
  if (!uid) return () => {}
  return onSnapshot(
    episodeStatesCol(uid),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeEpisodeStates error', err)
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
      console.error('subscribePlaylists error', err)
      callback([])
    },
  )
}

export const followShow = async (uid, show) => {
  if (!uid || !show?.id) return
  await setDoc(doc(followsCol(uid), show.id), {
    showId: show.id,
    title: show.title || '',
    host: show.host || '',
    coverUrl: show.coverUrl || '',
    language: show.language || '',
    category: show.category || '',
    followedAt: serverTimestamp(),
  })
}

export const unfollowShow = async (uid, showId) => {
  if (!uid || !showId) return
  await deleteDoc(doc(followsCol(uid), showId))
}

export const pinItem = async (uid, item, currentMaxOrder = 0) => {
  if (!uid || !item) return
  // item shape: { kind: 'show' | 'playlist', refId, title, coverUrl }
  await addDoc(pinsCol(uid), {
    kind: item.kind,
    refId: item.refId,
    title: item.title || '',
    coverUrl: item.coverUrl || '',
    order: currentMaxOrder + 1,
    pinnedAt: serverTimestamp(),
  })
}

export const unpinItem = async (uid, pinId) => {
  if (!uid || !pinId) return
  await deleteDoc(doc(pinsCol(uid), pinId))
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
    episodeIds: [],
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export const addEpisodeToPlaylist = async (uid, playlistId, episodeId) => {
  if (!uid || !playlistId || !episodeId) return
  const ref = doc(playlistsCol(uid), playlistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const current = snap.data().episodeIds || []
  if (current.includes(episodeId)) return
  await updateDoc(ref, { episodeIds: [...current, episodeId] })
}

const API_BASE = 'http://localhost:4000'

// Mixed-type search backed by Spotify (with iTunes RSS resolution for show pages).
// Returns an array of results
// where each entry is either { type: 'show', ... } or { type: 'episode', ... }.
// Throws on network/server failure so callers can render the error state.
export const searchPodcasts = async ({ query: q, language } = {}) => {
  if (!q?.trim()) return []
  const params = new URLSearchParams({ q })
  if (language) params.set('lang', language)
  const res = await fetch(`${API_BASE}/api/podcasts/search?${params.toString()}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return Array.isArray(data?.results) ? data.results : []
}

export const fetchCategoryShows = async ({ category, language, limit: max = 25 } = {}) => {
  if (!category) return []
  try {
    const params = new URLSearchParams({ limit: String(max) })
    if (language) params.set('lang', language)
    const res = await fetch(
      `${API_BASE}/api/podcasts/category/${encodeURIComponent(category)}?${params.toString()}`,
    )
    if (!res.ok) return []
    const data = await res.json()
    return data?.shows || []
  } catch {
    return []
  }
}

// Adapt the backend-sanitised show/episode shape to the props the show page
// component expects (id/title/host/coverUrl/...). Field names accept both
// the Spotify-era keys (spotifyShowId, etc.) and the older ones for safety.
const adaptShow = (raw) => {
  if (!raw) return null
  return {
    id: String(raw.spotifyShowId ?? raw.feedId ?? raw.id ?? ''),
    title: raw.title || '',
    host: raw.author || raw.host || '',
    description: raw.description || '',
    coverUrl: raw.coverArtUrl || raw.coverUrl || '',
    language: raw.language || '',
    category: Array.isArray(raw.categories) ? raw.categories[0] || '' : raw.category || '',
    episodeCount: raw.episodeCount,
    available: raw.available !== false,
    unavailableReason: raw.unavailableReason || null,
    feedUrl: raw.feedUrl || null,
  }
}

const adaptEpisode = (raw) => {
  if (!raw) return null
  const publishedAt = raw.publishDate
    ? new Date(raw.publishDate * 1000).toISOString()
    : raw.publishedAt || null
  const durationMs = typeof raw.duration === 'number' ? raw.duration * 1000 : raw.durationMs || 0
  return {
    id: String(raw.spotifyEpisodeId ?? raw.episodeId ?? raw.id ?? ''),
    showId: raw.spotifyShowId ? String(raw.spotifyShowId) : raw.feedId ? String(raw.feedId) : '',
    title: raw.title || '',
    description: raw.description || '',
    coverUrl: raw.coverArtUrl || raw.coverUrl || '',
    audioUrl: raw.audioUrl || '',
    publishedAt,
    durationMs,
    showName: raw.showTitle || raw.showName || '',
  }
}

export const fetchShow = async (showId) => {
  if (!showId) return null
  try {
    const res = await fetch(`${API_BASE}/api/podcasts/show/${encodeURIComponent(showId)}`)
    if (!res.ok) return null
    return adaptShow(await res.json())
  } catch {
    return null
  }
}

export const fetchShowEpisodes = async (showId, { cursor, sort = 'newest', limit: max = 50 } = {}) => {
  if (!showId) return { episodes: [], nextCursor: null, available: true }
  try {
    const params = new URLSearchParams({ sort, limit: String(max) })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(
      `${API_BASE}/api/podcasts/show/${encodeURIComponent(showId)}/episodes?${params.toString()}`,
    )
    if (!res.ok) return { episodes: [], nextCursor: null, available: true }
    const data = await res.json()
    const episodes = Array.isArray(data?.episodes) ? data.episodes.map(adaptEpisode) : []
    if (sort === 'oldest') episodes.reverse()
    return {
      episodes,
      nextCursor: data?.nextCursor || null,
      available: data?.available !== false,
      unavailableReason: data?.unavailableReason || null,
    }
  } catch {
    return { episodes: [], nextCursor: null, available: true }
  }
}
