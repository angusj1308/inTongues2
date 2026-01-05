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

const normaliseLanguage = (language) => resolveSupportedLanguageLabel(language, language)

const getFreeWritingCollection = (userId) => collection(db, 'users', userId, 'freeWritingLessons')

const getFreeWritingDocRef = (userId, lessonId) => doc(getFreeWritingCollection(userId), lessonId)

/**
 * Create a new free writing lesson
 */
export const createFreeWritingLesson = async (userId, data) => {
  const {
    title,
    topic,
    textType,
    targetLanguage,
    sourceLanguage,
  } = data

  const normalisedTarget = normaliseLanguage(targetLanguage)
  const normalisedSource = normaliseLanguage(sourceLanguage || 'English')

  const lessonData = {
    title: title?.trim() || `Free Writing - ${new Date().toLocaleDateString()}`,
    topic: topic?.trim() || null,
    textType: textType || 'journal', // journal, essay, short-story, etc.
    targetLanguage: normalisedTarget,
    sourceLanguage: normalisedSource,
    feedbackMode: 'line', // 'line' or 'document'

    lines: [], // Array of { index, text, modelSentence?, feedback?, status }
    currentIndex: 0,
    wordCount: 0,
    lineCount: 0,

    // Document-level feedback (populated when user submits full document)
    documentFeedback: null,

    status: 'in_progress', // 'in_progress' | 'complete'
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    settings: {
      feedbackLanguage: 'native', // 'native' or 'target'
    },
  }

  const docRef = await addDoc(getFreeWritingCollection(userId), lessonData)
  return { id: docRef.id, ...lessonData }
}

/**
 * Get a single free writing lesson
 */
export const getFreeWritingLesson = async (userId, lessonId) => {
  const ref = getFreeWritingDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    return null
  }

  return { id: docSnap.id, ...docSnap.data() }
}

/**
 * Update a free writing lesson
 */
export const updateFreeWritingLesson = async (userId, lessonId, updates) => {
  const ref = getFreeWritingDocRef(userId, lessonId)
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Save a line with feedback
 */
export const saveFreeWritingLine = async (userId, lessonId, lineData) => {
  const ref = getFreeWritingDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Free writing lesson not found')
  }

  const lesson = docSnap.data()
  const lines = lesson.lines || []

  const newLine = {
    index: lineData.index,
    text: lineData.text,
    modelSentence: lineData.modelSentence || '',
    feedback: lineData.feedback || null,
    status: lineData.status || 'draft', // 'draft' | 'reviewed' | 'finalized'
    createdAt: new Date().toISOString(),
  }

  // Find existing line or add new
  const existingIndex = lines.findIndex((l) => l.index === lineData.index)

  if (existingIndex >= 0) {
    lines[existingIndex] = { ...lines[existingIndex], ...newLine }
  } else {
    lines.push(newLine)
  }

  // Calculate word count
  const wordCount = lines.reduce((acc, line) => {
    const words = line.text?.trim().split(/\s+/).filter(Boolean) || []
    return acc + words.length
  }, 0)

  await updateDoc(ref, {
    lines,
    wordCount,
    lineCount: lines.length,
    updatedAt: serverTimestamp(),
  })

  return newLine
}

/**
 * Finalize a line and move to next
 */
export const finalizeFreeWritingLine = async (userId, lessonId, lineIndex, finalText) => {
  const ref = getFreeWritingDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Free writing lesson not found')
  }

  const lesson = docSnap.data()
  const lines = lesson.lines || []

  // Update or create the line
  const existingLineIndex = lines.findIndex((l) => l.index === lineIndex)
  if (existingLineIndex >= 0) {
    lines[existingLineIndex].status = 'finalized'
    lines[existingLineIndex].text = finalText
  } else {
    lines.push({
      index: lineIndex,
      text: finalText,
      status: 'finalized',
      createdAt: new Date().toISOString(),
    })
  }

  // Calculate word count
  const wordCount = lines.reduce((acc, line) => {
    const words = line.text?.trim().split(/\s+/).filter(Boolean) || []
    return acc + words.length
  }, 0)

  const nextIndex = lineIndex + 1

  await updateDoc(ref, {
    lines,
    currentIndex: nextIndex,
    wordCount,
    lineCount: lines.length,
    updatedAt: serverTimestamp(),
  })

  return {
    nextIndex,
    lineCount: lines.length,
  }
}

/**
 * Save document-level feedback
 */
export const saveDocumentFeedback = async (userId, lessonId, documentFeedback, lineByLineFeedback) => {
  const ref = getFreeWritingDocRef(userId, lessonId)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Free writing lesson not found')
  }

  const lesson = docSnap.data()
  let lines = lesson.lines || []

  // Update lines with line-by-line feedback if provided
  if (lineByLineFeedback && Array.isArray(lineByLineFeedback)) {
    lines = lines.map((line) => {
      const feedbackForLine = lineByLineFeedback.find((f) => f.lineIndex === line.index)
      if (feedbackForLine) {
        return {
          ...line,
          modelSentence: feedbackForLine.modelSentence || line.modelSentence,
          feedback: feedbackForLine.feedback || line.feedback,
          status: 'reviewed',
        }
      }
      return line
    })
  }

  await updateDoc(ref, {
    lines,
    documentFeedback,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Delete a free writing lesson
 */
export const deleteFreeWritingLesson = async (userId, lessonId) => {
  const ref = getFreeWritingDocRef(userId, lessonId)
  await deleteDoc(ref)
}

/**
 * Reset a free writing lesson
 */
export const resetFreeWritingLesson = async (userId, lessonId) => {
  const ref = getFreeWritingDocRef(userId, lessonId)
  await updateDoc(ref, {
    lines: [],
    currentIndex: 0,
    wordCount: 0,
    lineCount: 0,
    documentFeedback: null,
    status: 'in_progress',
    updatedAt: serverTimestamp(),
  })
}

/**
 * Subscribe to free writing lessons for a language
 */
export const subscribeToFreeWritingLessons = (userId, language, callback, onError) => {
  const normalisedLang = normaliseLanguage(language)
  const freeWritingRef = getFreeWritingCollection(userId)
  const freeWritingQuery = query(
    freeWritingRef,
    where('targetLanguage', '==', normalisedLang)
  )

  return onSnapshot(
    freeWritingQuery,
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
 * Get full document text from a lesson
 */
export const getFullDocument = (lesson) => {
  if (!lesson?.lines) return ''

  const sortedLines = [...lesson.lines].sort((a, b) => a.index - b.index)
  return sortedLines.map((l) => l.text).join(' ')
}
