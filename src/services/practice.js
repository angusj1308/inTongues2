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

export const ADAPTATION_LEVELS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'native', label: 'Native (as-is)' },
]

export const SOURCE_TYPES = [
  { id: 'text', label: 'Plain Text' },
  { id: 'youtube', label: 'YouTube Video' },
  { id: 'file', label: 'File Upload' },
  { id: 'audio', label: 'Audio File' },
]

const normaliseLanguage = (language) => resolveSupportedLanguageLabel(language, language)

const getPracticeCollection = (userId) => collection(db, 'users', userId, 'practiceLessons')

const getPracticeDocRef = (userId, lessonId) => doc(getPracticeCollection(userId), lessonId)

/**
 * Create a new practice lesson
 */
export const createPracticeLesson = async (userId, data) => {
  const {
    title,
    sourceLanguage,
    targetLanguage,
    adaptationLevel,
    sourceType,
    sentences,
  } = data

  const normalisedTarget = normaliseLanguage(targetLanguage)
  const normalisedSource = normaliseLanguage(sourceLanguage)

  const lessonData = {
    title: title?.trim() || `Practice - ${new Date().toLocaleDateString()}`,
    sourceLanguage: normalisedSource,
    targetLanguage: normalisedTarget,
    adaptationLevel: adaptationLevel || 'native',
    sourceType: sourceType || 'text',
    sentences: sentences || [],
    currentIndex: 0,
    completedCount: 0,
    status: 'in_progress',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    attempts: [],
    settings: {
      feedbackLanguage: 'target', // 'native' or 'target'
      showGrammar: true,
    },
  }

  const docRef = await addDoc(getPracticeCollection(userId), lessonData)
  return { id: docRef.id, ...lessonData }
}

/**
 * Get a single practice lesson
 */
export const getPracticeLesson = async (userId, lessonId) => {
  const ref = getPracticeDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    return null
  }

  return { id: docSnap.id, ...docSnap.data() }
}

/**
 * Update a practice lesson
 */
export const updatePracticeLesson = async (userId, lessonId, updates) => {
  const ref = getPracticeDocRef(userId, lessonId)
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Save an attempt for a sentence
 */
export const saveAttempt = async (userId, lessonId, attemptData) => {
  const ref = getPracticeDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Practice lesson not found')
  }

  const lesson = docSnap.data()
  const attempts = lesson.attempts || []

  const newAttempt = {
    sentenceIndex: attemptData.sentenceIndex,
    userText: attemptData.userText,
    modelSentence: attemptData.modelSentence || '',
    feedback: attemptData.feedback || null,
    status: attemptData.status || 'attempted', // 'attempted', 'revised', 'finalized'
    createdAt: new Date().toISOString(),
  }

  // Find existing attempt for this sentence or add new
  const existingIndex = attempts.findIndex(
    (a) => a.sentenceIndex === attemptData.sentenceIndex
  )

  if (existingIndex >= 0) {
    attempts[existingIndex] = { ...attempts[existingIndex], ...newAttempt }
  } else {
    attempts.push(newAttempt)
  }

  await updateDoc(ref, {
    attempts,
    updatedAt: serverTimestamp(),
  })

  return newAttempt
}

/**
 * Finalize an attempt and move to next sentence
 */
export const finalizeAttempt = async (userId, lessonId, sentenceIndex, finalText) => {
  const ref = getPracticeDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Practice lesson not found')
  }

  const lesson = docSnap.data()
  const attempts = lesson.attempts || []
  const sentences = lesson.sentences || []

  // Update the attempt status
  const attemptIndex = attempts.findIndex((a) => a.sentenceIndex === sentenceIndex)
  if (attemptIndex >= 0) {
    attempts[attemptIndex].status = 'finalized'
    attempts[attemptIndex].finalText = finalText
  }

  // Calculate progress
  const completedCount = attempts.filter((a) => a.status === 'finalized').length
  const nextIndex = Math.min(sentenceIndex + 1, sentences.length - 1)
  const isComplete = completedCount >= sentences.length

  await updateDoc(ref, {
    attempts,
    currentIndex: nextIndex,
    completedCount,
    status: isComplete ? 'complete' : 'in_progress',
    updatedAt: serverTimestamp(),
  })

  return {
    nextIndex,
    completedCount,
    isComplete,
  }
}

/**
 * Update lesson settings
 */
export const updateLessonSettings = async (userId, lessonId, settings) => {
  const ref = getPracticeDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Practice lesson not found')
  }

  const currentSettings = docSnap.data().settings || {}

  await updateDoc(ref, {
    settings: { ...currentSettings, ...settings },
    updatedAt: serverTimestamp(),
  })
}

/**
 * Delete a practice lesson
 */
export const deletePracticeLesson = async (userId, lessonId) => {
  const ref = getPracticeDocRef(userId, lessonId)
  await deleteDoc(ref)
}

/**
 * Subscribe to practice lessons for a language
 */
export const subscribeToPracticeLessons = (userId, language, callback, onError) => {
  const normalisedLang = normaliseLanguage(language)
  const practiceRef = getPracticeCollection(userId)
  const practiceQuery = query(
    practiceRef,
    where('targetLanguage', '==', normalisedLang)
  )

  return onSnapshot(
    practiceQuery,
    (snapshot) => {
      const lessons = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      // Sort by updatedAt descending (client-side)
      lessons.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0
        const bTime = b.updatedAt?.toMillis?.() || 0
        return bTime - aTime
      })
      callback(lessons)
    },
    onError
  )
}

/**
 * Get completed document text from a lesson
 */
export const getCompletedDocument = (lesson) => {
  if (!lesson?.attempts || !lesson?.sentences) return ''

  const finalizedAttempts = lesson.attempts
    .filter((a) => a.status === 'finalized')
    .sort((a, b) => a.sentenceIndex - b.sentenceIndex)

  return finalizedAttempts.map((a) => a.finalText || a.userText).join(' ')
}

/**
 * Split text into sentences (simple implementation)
 */
export const splitIntoSentences = (text) => {
  if (!text?.trim()) return []

  // Split on sentence-ending punctuation followed by space or end
  const sentences = text
    .split(/(?<=[.!?¡¿…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return sentences
}
