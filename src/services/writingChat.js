import {
  collection,
  doc,
  addDoc,
  getDoc,
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

// One-time fetch of a single chat (used by the voice call view to pull the
// thread's persona/level/language without needing the full subscription).
export const getWritingChat = async (userId, chatId) => {
  if (!userId || !chatId) return null
  const snap = await getDoc(doc(getChatsCollection(userId), chatId))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: snap.id,
    ...data,
    lastActivity: data.lastActivity?.toMillis?.() || Date.now(),
  }
}

// Append a call record (role: 'call') to a thread. Pulls the latest messages
// to avoid clobbering anything the user sent while the call was in progress.
export const appendCallRecord = async (userId, chatId, callRecord) => {
  if (!userId || !chatId || !callRecord) return
  const ref = doc(getChatsCollection(userId), chatId)
  const snap = await getDoc(ref)
  const current = snap.exists() ? (snap.data().messages || []) : []
  const next = [...current, { role: 'call', ...callRecord }]
  await updateDoc(ref, {
    messages: next,
    lastActivity: serverTimestamp(),
  })
}

// Patch an existing call record (matched by id) — used when the recording
// audio URL becomes ready after the call already saved.
export const patchCallRecord = async (userId, chatId, recordId, patch) => {
  if (!userId || !chatId || !recordId) return
  const ref = doc(getChatsCollection(userId), chatId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const messages = (snap.data().messages || []).map((m) =>
    m.role === 'call' && m.id === recordId ? { ...m, ...patch } : m,
  )
  await updateDoc(ref, { messages })
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
