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
    youtubeUrl,
    status,
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
    status: status || 'in_progress',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    attempts: [],
    settings: {
      feedbackLanguage: 'target', // 'native' or 'target'
      showGrammar: true,
    },
  }

  // Add youtubeUrl if provided (for importing status)
  if (youtubeUrl) {
    lessonData.youtubeUrl = youtubeUrl
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

  // Update or create the attempt
  const attemptIndex = attempts.findIndex((a) => a.sentenceIndex === sentenceIndex)
  if (attemptIndex >= 0) {
    attempts[attemptIndex].status = 'finalized'
    attempts[attemptIndex].finalText = finalText
  } else {
    // Create attempt if it doesn't exist (safety fallback)
    attempts.push({
      sentenceIndex,
      userText: finalText,
      finalText,
      status: 'finalized',
      createdAt: new Date().toISOString(),
    })
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
 * Reset a practice lesson (start over from sentence 1)
 * This clears all attempts but preserves word status changes
 */
export const resetPracticeLesson = async (userId, lessonId) => {
  const ref = getPracticeDocRef(userId, lessonId)
  await updateDoc(ref, {
    attempts: [],
    currentIndex: 0,
    completedCount: 0,
    status: 'in_progress',
    updatedAt: serverTimestamp(),
  })
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

const MIN_WORDS = 10
const MAX_WORDS = 25

/**
 * Count words in a text segment
 */
const countWords = (text) => {
  if (!text?.trim()) return 0
  return text.trim().split(/\s+/).length
}

/**
 * Split text into sentences with min/max word constraints
 * - Minimum 10 words: if a sentence is too short, combine with next
 * - Maximum 25 words: if a sentence is too long, split at natural breaks
 */
export const splitIntoSentences = (text) => {
  if (!text?.trim()) return []

  // First, split on sentence-ending punctuation followed by space or end
  const rawSentences = text
    .split(/(?<=[.!?¡¿…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const result = []
  let buffer = ''

  for (let i = 0; i < rawSentences.length; i++) {
    const sentence = rawSentences[i]
    const combined = buffer ? `${buffer} ${sentence}` : sentence
    const wordCount = countWords(combined)

    if (wordCount <= MAX_WORDS) {
      // Combined is within max limit
      if (wordCount >= MIN_WORDS) {
        // Meets minimum, add to result
        result.push(combined)
        buffer = ''
      } else {
        // Still under minimum, keep buffering
        buffer = combined
      }
    } else {
      // Combined exceeds max
      if (buffer) {
        // First, flush the buffer if it meets minimum
        if (countWords(buffer) >= MIN_WORDS) {
          result.push(buffer)
          buffer = ''
        }
      }

      // Now handle the current sentence
      const currentWords = countWords(buffer ? `${buffer} ${sentence}` : sentence)
      if (currentWords > MAX_WORDS) {
        // Need to split this sentence
        const textToSplit = buffer ? `${buffer} ${sentence}` : sentence
        const splitParts = splitLongSentence(textToSplit, MIN_WORDS, MAX_WORDS)
        result.push(...splitParts)
        buffer = ''
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence
      }
    }
  }

  // Handle remaining buffer
  if (buffer) {
    if (result.length > 0 && countWords(buffer) < MIN_WORDS) {
      // Combine with last result if buffer is too short
      const lastWordCount = countWords(result[result.length - 1])
      if (lastWordCount + countWords(buffer) <= MAX_WORDS) {
        result[result.length - 1] = `${result[result.length - 1]} ${buffer}`
      } else {
        // Just add it even if short - last sentence exception
        result.push(buffer)
      }
    } else {
      result.push(buffer)
    }
  }

  return result
}

/**
 * Split a long sentence at natural break points (commas, semicolons, conjunctions)
 */
const splitLongSentence = (text, minWords, maxWords) => {
  const words = text.split(/\s+/)
  if (words.length <= maxWords) return [text]

  const result = []
  let current = []

  for (let i = 0; i < words.length; i++) {
    current.push(words[i])
    const currentText = current.join(' ')

    // Check if we're at a natural break point and have enough words
    const isNaturalBreak = /[,;:]$/.test(words[i]) ||
      /^(and|but|or|so|yet|because|although|while|when|if|then|however|therefore|moreover|furthermore|additionally|consequently|thus|hence|meanwhile|otherwise|instead|rather|indeed)$/i.test(words[i + 1] || '')

    if (current.length >= minWords && (current.length >= maxWords || (isNaturalBreak && current.length >= minWords))) {
      result.push(currentText)
      current = []
    }
  }

  // Handle remaining words
  if (current.length > 0) {
    if (result.length > 0 && current.length < minWords) {
      // Combine with previous if too short
      result[result.length - 1] = `${result[result.length - 1]} ${current.join(' ')}`
    } else {
      result.push(current.join(' '))
    }
  }

  return result
}
