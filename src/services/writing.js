import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { resolveSupportedLanguageLabel } from '../constants/languages'

export const TEXT_TYPES = [
  { id: 'journal', label: 'Journal' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'essay', label: 'Essay' },
  { id: 'short-story', label: 'Short Story' },
  { id: 'poetry', label: 'Poetry' },
  { id: 'novel-chapter', label: 'Novel Chapter' },
  { id: 'screenplay', label: 'Screenplay' },
  { id: 'article', label: 'Article' },
]

export const PIECE_STATUSES = ['draft', 'submitted', 'complete']

const normaliseLanguage = (language) => resolveSupportedLanguageLabel(language, language)

const getWritingCollection = (userId) => collection(db, 'users', userId, 'writing')

const getWritingDocRef = (userId, pieceId) => doc(getWritingCollection(userId), pieceId)

export const createWritingPiece = async (userId, language, textType, title) => {
  const normalisedLang = normaliseLanguage(language)
  const typeInfo = TEXT_TYPES.find((t) => t.id === textType)
  const typeLabel = typeInfo?.label || textType

  const defaultTitle = title?.trim() || `Untitled ${typeLabel} - ${new Date().toLocaleDateString()}`

  const pieceData = {
    language: normalisedLang,
    textType,
    title: defaultTitle,
    content: '',
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    feedback: [],
  }

  const docRef = await addDoc(getWritingCollection(userId), pieceData)
  return { id: docRef.id, ...pieceData }
}

export const updateWritingPiece = async (userId, pieceId, updates) => {
  const ref = getWritingDocRef(userId, pieceId)
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export const saveWritingContent = async (userId, pieceId, content) => {
  await updateWritingPiece(userId, pieceId, { content })
}

export const updateWritingTitle = async (userId, pieceId, title) => {
  await updateWritingPiece(userId, pieceId, { title })
}

export const updateWritingStatus = async (userId, pieceId, status) => {
  if (!PIECE_STATUSES.includes(status)) {
    throw new Error(`Invalid piece status: ${status}`)
  }
  await updateWritingPiece(userId, pieceId, { status })
}

export const submitForFeedback = async (userId, pieceId) => {
  await updateWritingStatus(userId, pieceId, 'submitted')
  // Placeholder for AI feedback integration
  // In the future, this will call an AI service and update the feedback array
}

export const addFeedback = async (userId, pieceId, feedback) => {
  const ref = getWritingDocRef(userId, pieceId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Writing piece not found')
  }

  const existingFeedback = docSnap.data().feedback || []
  const newFeedback = {
    id: Date.now().toString(),
    content: feedback,
    createdAt: new Date().toISOString(),
  }

  await updateWritingPiece(userId, pieceId, {
    feedback: [...existingFeedback, newFeedback],
  })
}

export const getWritingPiece = async (userId, pieceId) => {
  const ref = getWritingDocRef(userId, pieceId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    return null
  }

  return { id: docSnap.id, ...docSnap.data() }
}

export const deleteWritingPiece = async (userId, pieceId) => {
  const ref = getWritingDocRef(userId, pieceId)
  await deleteDoc(ref)
}

export const subscribeToWritingPieces = (userId, language, callback, onError) => {
  const normalisedLang = normaliseLanguage(language)
  const writingRef = getWritingCollection(userId)
  // Only filter by language - sort client-side to avoid requiring composite index
  const writingQuery = query(
    writingRef,
    where('language', '==', normalisedLang)
  )

  return onSnapshot(
    writingQuery,
    (snapshot) => {
      const pieces = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      // Sort by updatedAt descending (client-side)
      pieces.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0
        const bTime = b.updatedAt?.toMillis?.() || 0
        return bTime - aTime
      })
      callback(pieces)
    },
    onError
  )
}

export const groupPiecesByType = (pieces) => {
  const grouped = {}

  TEXT_TYPES.forEach((type) => {
    grouped[type.id] = []
  })

  pieces.forEach((piece) => {
    if (grouped[piece.textType]) {
      grouped[piece.textType].push(piece)
    }
  })

  return grouped
}
