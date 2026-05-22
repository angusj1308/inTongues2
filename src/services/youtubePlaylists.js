import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from 'firebase/firestore'
import db from '../firebase'
import { recordMediaInteraction, MEDIA_KIND } from './sharedMedia'

// Firestore layout:
//   users/{uid}/youtubePlaylistSaves/{playlistId}
//
// Playlists are SAVED (like a Spotify album / podcast episode), not
// followed — YouTube has no follow-playlist concept. Mirrors the
// followedChannels schema otherwise.

const savesCol = (uid) => collection(db, 'users', uid, 'youtubePlaylistSaves')

export const subscribeSavedPlaylists = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(savesCol(uid), orderBy('savedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeSavedPlaylists error', err)
      callback([])
    },
  )
}

export const savePlaylist = async (uid, playlist, language = '') => {
  if (!uid || !playlist?.id) return
  const resolvedLanguage = language || playlist.language || ''
  await setDoc(doc(savesCol(uid), playlist.id), {
    playlistId: playlist.id,
    title: playlist.title || '',
    channelTitle: playlist.channelTitle || '',
    channelId: playlist.channelId || '',
    coverUrl: playlist.coverUrl || '',
    videoCount: Number.isFinite(playlist.videoCount) ? playlist.videoCount : null,
    ...(resolvedLanguage ? { language: resolvedLanguage } : {}),
    savedAt: serverTimestamp(),
  })
  if (resolvedLanguage) {
    recordMediaInteraction({
      kind: MEDIA_KIND.YOUTUBE_PLAYLIST,
      externalId: playlist.id,
      language: resolvedLanguage,
      title: playlist.title || '',
      subtitle: playlist.channelTitle || '',
      coverUrl: playlist.coverUrl || '',
    })
  }
}

export const unsavePlaylist = async (uid, playlistId) => {
  if (!uid || !playlistId) return
  await deleteDoc(doc(savesCol(uid), playlistId))
}

const API_BASE =
  typeof window !== 'undefined' && window.location?.hostname === 'localhost'
    ? 'http://localhost:4000'
    : ''

export const fetchYoutubePlaylist = async (playlistId) => {
  if (!playlistId) return null
  try {
    const res = await fetch(
      `${API_BASE}/api/youtube/playlist/${encodeURIComponent(playlistId)}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.warn('fetchYoutubePlaylist failed', err?.message || err)
    return null
  }
}

export const fetchYoutubePlaylistVideos = async (playlistId, { cursor, max } = {}) => {
  if (!playlistId) return { videos: [], nextCursor: null }
  try {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (max) params.set('max', String(max))
    const qs = params.toString()
    const res = await fetch(
      `${API_BASE}/api/youtube/playlist/${encodeURIComponent(playlistId)}/videos${qs ? `?${qs}` : ''}`,
    )
    if (!res.ok) return { videos: [], nextCursor: null }
    return await res.json()
  } catch (err) {
    console.warn('fetchYoutubePlaylistVideos failed', err?.message || err)
    return { videos: [], nextCursor: null }
  }
}
