import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { resolveSupportedLanguageLabel } from '../constants/languages'

const normaliseLanguage = (language) => resolveSupportedLanguageLabel(language, language)

// Collection references
const getTutorProfileRef = (userId) => doc(db, 'users', userId, 'tutorProfile', 'default')
const getTutorChatsCollection = (userId) => collection(db, 'users', userId, 'tutorChats')
const getTutorChatRef = (userId, chatId) => doc(getTutorChatsCollection(userId), chatId)

/**
 * Get or create tutor profile for a user
 */
export const getTutorProfile = async (userId, targetLanguage, sourceLanguage) => {
  const ref = getTutorProfileRef(userId)
  const docSnap = await getDoc(ref)

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() }
  }

  // Create new profile
  const newProfile = {
    targetLanguage: normaliseLanguage(targetLanguage),
    sourceLanguage: normaliseLanguage(sourceLanguage || 'English'),
    createdAt: serverTimestamp(),
    lastChatAt: null,
    memory: {
      userFacts: [],
      recurringMistakes: [],
      topicsDiscussed: [],
      lastConversationSummary: '',
      observedLevel: 'beginner',
    },
    settings: {
      preferredMode: 'chat',
    },
  }

  await setDoc(ref, newProfile)
  return { id: 'default', ...newProfile }
}

/**
 * Update tutor profile
 */
export const updateTutorProfile = async (userId, updates) => {
  const ref = getTutorProfileRef(userId)
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Update tutor settings
 */
export const updateTutorSettings = async (userId, settings) => {
  const ref = getTutorProfileRef(userId)
  await updateDoc(ref, {
    settings,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Update tutor memory (merge with existing)
 */
export const updateTutorMemory = async (userId, memoryUpdates) => {
  const ref = getTutorProfileRef(userId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Tutor profile not found')
  }

  const currentMemory = docSnap.data().memory || {}

  // Merge arrays (dedupe) and update strings
  const updatedMemory = {
    userFacts: [...new Set([...(currentMemory.userFacts || []), ...(memoryUpdates.userFacts || [])])],
    recurringMistakes: [...new Set([...(currentMemory.recurringMistakes || []), ...(memoryUpdates.recurringMistakes || [])])],
    topicsDiscussed: [...new Set([...(currentMemory.topicsDiscussed || []), ...(memoryUpdates.topicsDiscussed || [])])],
    lastConversationSummary: memoryUpdates.lastConversationSummary || currentMemory.lastConversationSummary,
    observedLevel: memoryUpdates.observedLevel || currentMemory.observedLevel,
  }

  await updateDoc(ref, {
    memory: updatedMemory,
    updatedAt: serverTimestamp(),
  })

  return updatedMemory
}

/**
 * Create a new chat session
 */
export const createTutorChat = async (userId, data = {}) => {
  const chatData = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    messages: [],
    summary: null,
    archived: false,
    ...data,
  }

  const docRef = await addDoc(getTutorChatsCollection(userId), chatData)

  // Update last chat time in profile
  const profileRef = getTutorProfileRef(userId)
  await updateDoc(profileRef, {
    lastChatAt: serverTimestamp(),
  }).catch(() => {
    // Profile might not exist yet, ignore
  })

  return { id: docRef.id, ...chatData }
}

/**
 * Get a single chat
 */
export const getTutorChat = async (userId, chatId) => {
  const ref = getTutorChatRef(userId, chatId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    return null
  }

  return { id: docSnap.id, ...docSnap.data() }
}

/**
 * Add a message to a chat
 */
export const addTutorMessage = async (userId, chatId, message) => {
  const ref = getTutorChatRef(userId, chatId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Chat not found')
  }

  const chat = docSnap.data()
  const messages = chat.messages || []

  const newMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role: message.role, // 'user' | 'tutor'
    type: message.type || 'text', // 'text' | 'voice'
    content: message.content,
    audioUrl: message.audioUrl || null,
    duration: message.duration || null,
    timestamp: new Date().toISOString(),
  }

  messages.push(newMessage)

  await updateDoc(ref, {
    messages,
    updatedAt: serverTimestamp(),
  })

  return newMessage
}

/**
 * Update chat (e.g., add summary)
 */
export const updateTutorChat = async (userId, chatId, updates) => {
  const ref = getTutorChatRef(userId, chatId)
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Archive a chat
 */
export const archiveTutorChat = async (userId, chatId) => {
  const ref = getTutorChatRef(userId, chatId)
  await updateDoc(ref, {
    archived: true,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Delete a chat permanently
 */
export const deleteTutorChat = async (userId, chatId) => {
  const { deleteDoc } = await import('firebase/firestore')
  const ref = getTutorChatRef(userId, chatId)
  await deleteDoc(ref)
}

/**
 * Rename a chat
 */
export const renameTutorChat = async (userId, chatId, title) => {
  const ref = getTutorChatRef(userId, chatId)
  await updateDoc(ref, {
    title,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Subscribe to a single chat (real-time)
 */
export const subscribeToTutorChat = (userId, chatId, callback, onError) => {
  const ref = getTutorChatRef(userId, chatId)

  return onSnapshot(
    ref,
    (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() })
      } else {
        callback(null)
      }
    },
    onError
  )
}

/**
 * Subscribe to all chats (for chat history)
 */
export const subscribeToTutorChats = (userId, callback, onError) => {
  const chatsRef = getTutorChatsCollection(userId)
  const chatsQuery = query(chatsRef, where('archived', '==', false))

  return onSnapshot(
    chatsQuery,
    (snapshot) => {
      const chats = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      // Sort by updatedAt descending
      chats.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0
        const bTime = b.updatedAt?.toMillis?.() || 0
        return bTime - aTime
      })
      callback(chats)
    },
    onError
  )
}

/**
 * Get the most recent active chat (or create one)
 */
export const getOrCreateActiveChat = async (userId) => {
  const chatsRef = getTutorChatsCollection(userId)
  const recentQuery = query(chatsRef, where('archived', '==', false))

  const snapshot = await getDoc(recentQuery).catch(() => null)

  // Try to get existing chats
  const chatsSnap = await import('firebase/firestore').then(({ getDocs }) => getDocs(recentQuery))

  if (!chatsSnap.empty) {
    // Find most recent
    const chats = chatsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    chats.sort((a, b) => {
      const aTime = a.updatedAt?.toMillis?.() || 0
      const bTime = b.updatedAt?.toMillis?.() || 0
      return bTime - aTime
    })

    // Return most recent if it has messages, otherwise create new
    const mostRecent = chats[0]
    if (mostRecent && mostRecent.messages?.length > 0) {
      return mostRecent
    }
  }

  // Create new chat
  return createTutorChat(userId)
}

/**
 * Get formatted messages for AI context (last N messages)
 */
export const getConversationContext = (chat, maxMessages = 20) => {
  if (!chat?.messages?.length) return []

  const messages = chat.messages.slice(-maxMessages)
  return messages.map((m) => ({
    role: m.role === 'tutor' ? 'assistant' : 'user',
    content: m.content,
  }))
}
