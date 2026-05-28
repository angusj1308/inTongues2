import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

const getChatsCollection = (userId) => collection(db, 'users', userId, 'writingChats')

export const createWritingChat = async (userId, { persona, level, language, voiceGender }) => {
  const fallbackTitle = persona.length > 28 ? persona.slice(0, 28) + '…' : persona
  const data = {
    persona,
    level,
    language,
    voiceGender: voiceGender || 'female',
    title: fallbackTitle,
    messages: [],
    lastActivity: serverTimestamp(),
    createdAt: serverTimestamp(),
  }
  const docRef = await addDoc(getChatsCollection(userId), data)

  // Generate a clean short title in the background, then patch it in.
  fetch('/api/writing-chat/title', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((result) => {
      if (result?.title) {
        updateDoc(docRef, { title: result.title }).catch(() => {})
      }
    })
    .catch(() => {})

  return { id: docRef.id, ...data, lastActivity: Date.now() }
}

export const updateWritingChat = async (userId, chatId, updates) => {
  const ref = doc(getChatsCollection(userId), chatId)
  await updateDoc(ref, { ...updates, lastActivity: serverTimestamp() })
}

// Regenerate a clean title for a chat without bumping lastActivity.
export const regenerateChatTitle = async (userId, chatId, persona) => {
  if (!persona) return
  try {
    const res = await fetch('/api/writing-chat/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona }),
    })
    if (!res.ok) return
    const { title } = await res.json()
    if (title) {
      await updateDoc(doc(getChatsCollection(userId), chatId), { title })
    }
  } catch {
    /* best-effort */
  }
}

export const deleteWritingChat = async (userId, chatId) => {
  await deleteDoc(doc(getChatsCollection(userId), chatId))
}

export const subscribeToWritingChats = (userId, onData, onError) => {
  const q = query(getChatsCollection(userId), orderBy('lastActivity', 'desc'))
  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        lastActivity: data.lastActivity?.toMillis?.() || Date.now(),
      }
    })
    onData(chats)
  }, onError)
}
