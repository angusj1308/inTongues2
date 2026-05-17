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

// Firestore layout:
//   users/{uid}/youtubeChannelFollows/{channelId}
//
// Mirrors the music/podcast follow pattern. Doc fields:
//   channelId, title, description, coverUrl, followedAt

const followsCol = (uid) => collection(db, 'users', uid, 'youtubeChannelFollows')

export const subscribeFollowedChannels = (uid, callback) => {
  if (!uid) return () => {}
  const q = query(followsCol(uid), orderBy('followedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('subscribeFollowedChannels error', err)
      callback([])
    },
  )
}

export const followChannel = async (uid, channel) => {
  if (!uid || !channel?.id) return
  await setDoc(doc(followsCol(uid), channel.id), {
    channelId: channel.id,
    title: channel.title || '',
    description: channel.description || '',
    coverUrl: channel.coverUrl || '',
    followedAt: serverTimestamp(),
  })
}

export const unfollowChannel = async (uid, channelId) => {
  if (!uid || !channelId) return
  await deleteDoc(doc(followsCol(uid), channelId))
}
