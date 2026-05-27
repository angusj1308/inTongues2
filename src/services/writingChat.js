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
  const data = {
    persona,
    level,
    language,
    voiceGender: voiceGender || 'female',
    title: persona.length > 30 ? persona.slice(0, 30) + '…' : persona,
    messages: [],
    lastActivity: serverTimestamp(),
    createdAt: serverTimestamp(),
  }
  const docRef = await addDoc(getChatsCollection(userId), data)
  return { id: docRef.id, ...data, lastActivity: Date.now() }
}

export const updateWritingChat = async (userId, chatId, updates) => {
  const ref = doc(getChatsCollection(userId), chatId)
  await updateDoc(ref, { ...updates, lastActivity: serverTimestamp() })
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
