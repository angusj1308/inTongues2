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

// Backend-stubbed endpoints — wired later. Returns empty results so UI renders
// gracefully until the backend lands.
export const searchPodcasts = async ({ query: q, language, limit: max = 25 } = {}) => {
  if (!q?.trim()) return []
  try {
    const res = await fetch(
      `/api/podcasts/search?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(language || '')}&limit=${max}`,
    )
    if (!res.ok) return []
    const data = await res.json()
    return data?.shows || []
  } catch {
    return []
  }
}

export const fetchCategoryShows = async ({ category, language, limit: max = 25 } = {}) => {
  if (!category) return []
  try {
    const res = await fetch(
      `/api/podcasts/category/${encodeURIComponent(category)}?lang=${encodeURIComponent(language || '')}&limit=${max}`,
    )
    if (!res.ok) return []
    const data = await res.json()
    return data?.shows || []
  } catch {
    return []
  }
}

export const fetchShow = async (showId) => {
  if (!showId) return null
  try {
    const res = await fetch(`/api/podcasts/show/${encodeURIComponent(showId)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export const fetchShowEpisodes = async (showId, { cursor, sort = 'newest', limit: max = 20 } = {}) => {
  if (!showId) return { episodes: [], nextCursor: null }
  try {
    const params = new URLSearchParams({ sort, limit: String(max) })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(
      `/api/podcasts/show/${encodeURIComponent(showId)}/episodes?${params.toString()}`,
    )
    if (!res.ok) return { episodes: [], nextCursor: null }
    return await res.json()
  } catch {
    return { episodes: [], nextCursor: null }
  }
}
