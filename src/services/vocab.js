import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { incrementWordsLearned } from './progress'

export const VOCAB_STATUSES = ['unknown', 'recognised', 'familiar', 'known']

// SM-2 Constants
const DEFAULT_EASE_FACTOR = 2.5
const MIN_EASE_FACTOR = 1.3
const FIRST_INTERVAL = 1 // days
const SECOND_INTERVAL = 6 // days

// Status promotion thresholds
const PROMOTION_THRESHOLDS = {
  // Unknown → Recognised: 1 success (handled separately)
  recognised_to_familiar: { streak: 3, minIntervalDays: 7 },
  familiar_to_known: { streak: 4, minIntervalDays: 14, requiresRecall: true },
}

export const normaliseExpression = (text) => text.trim().toLowerCase()

// Normalize language to canonical label format (e.g., 'Spanish', 'French')
const normaliseLanguage = (language) => resolveSupportedLanguageLabel(language, language)

export const getVocabDocRef = (userId, language, text) => {
  const normalisedText = normaliseExpression(text)
  const normalisedLang = normaliseLanguage(language)
  const id = `${normalisedLang.toLowerCase()}_${normalisedText.replace(/\s+/g, '_')}`
  return doc(collection(doc(collection(db, 'users'), userId), 'vocab'), id)
}

export const loadUserVocab = async (userId, language) => {
  const normalisedLang = normaliseLanguage(language)
  const vocabCollection = collection(doc(collection(db, 'users'), userId), 'vocab')
  const vocabQuery = query(vocabCollection, where('language', '==', normalisedLang))
  const snapshot = await getDocs(vocabQuery)

  const vocabEntries = {}
  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    const key = normaliseExpression(data.text || '')
    vocabEntries[key] = {
      id: docSnap.id,
      text: data.text,
      language: data.language,
      status: data.status,
      translation: data.translation,
      intervalDays: data.intervalDays,
      easeFactor: data.easeFactor ?? DEFAULT_EASE_FACTOR,
      correctStreak: data.correctStreak ?? 0,
      recallStreak: data.recallStreak ?? 0,
      nextReviewAt: data.nextReviewAt,
      sourceContentIds: data.sourceContentIds ?? [],
    }
  })

  return vocabEntries
}

export const loadAllUserVocab = async (userId) => {
  const vocabCollection = collection(doc(collection(db, 'users'), userId), 'vocab')
  const snapshot = await getDocs(vocabCollection)

  const vocabEntries = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    vocabEntries.push({
      id: docSnap.id,
      text: data.text,
      language: data.language,
      status: data.status,
      translation: data.translation,
      intervalDays: data.intervalDays,
      easeFactor: data.easeFactor ?? DEFAULT_EASE_FACTOR,
      correctStreak: data.correctStreak ?? 0,
      recallStreak: data.recallStreak ?? 0,
      nextReviewAt: data.nextReviewAt,
      sourceContentIds: data.sourceContentIds ?? [],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    })
  })

  return vocabEntries
}

export const loadDueCards = async (userId, language) => {
  const normalisedLang = normaliseLanguage(language)
  const vocabCollection = collection(doc(collection(db, 'users'), userId), 'vocab')
  const vocabQuery = query(vocabCollection, where('language', '==', normalisedLang))
  const snapshot = await getDocs(vocabQuery)

  const now = new Date()
  const dueCards = []

  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    // Skip "known" cards - they don't need review
    if (data.status === 'known') return

    const nextDate = data.nextReviewAt?.toDate ? data.nextReviewAt.toDate() : null
    if (!nextDate || nextDate <= now) {
      dueCards.push({
        id: docSnap.id,
        text: data.text,
        language: data.language,
        status: data.status,
        translation: data.translation,
        intervalDays: data.intervalDays ?? 0,
        easeFactor: data.easeFactor ?? DEFAULT_EASE_FACTOR,
        correctStreak: data.correctStreak ?? 0,
        recallStreak: data.recallStreak ?? 0,
        nextReviewAt: data.nextReviewAt,
        sourceContentIds: data.sourceContentIds ?? [],
      })
    }
  })

  // Sort by due date (oldest first)
  dueCards.sort((a, b) => {
    const aDate = a.nextReviewAt?.toDate ? a.nextReviewAt.toDate() : new Date(0)
    const bDate = b.nextReviewAt?.toDate ? b.nextReviewAt.toDate() : new Date(0)
    return aDate - bDate
  })

  return dueCards
}

export const loadDueCardsByContentId = async (userId, language, contentId) => {
  const allDueCards = await loadDueCards(userId, language)
  return allDueCards.filter(
    (card) => card.sourceContentIds && card.sourceContentIds.includes(contentId)
  )
}

export const loadCardsByStatus = async (userId, language, status) => {
  const normalisedLang = normaliseLanguage(language)
  const vocabCollection = collection(doc(collection(db, 'users'), userId), 'vocab')
  const vocabQuery = query(
    vocabCollection,
    where('language', '==', normalisedLang),
    where('status', '==', status)
  )
  const snapshot = await getDocs(vocabQuery)

  const now = new Date()
  const dueCards = []

  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    const nextDate = data.nextReviewAt?.toDate ? data.nextReviewAt.toDate() : null
    if (!nextDate || nextDate <= now) {
      dueCards.push({
        id: docSnap.id,
        text: data.text,
        language: data.language,
        status: data.status,
        translation: data.translation,
        intervalDays: data.intervalDays ?? 0,
        easeFactor: data.easeFactor ?? DEFAULT_EASE_FACTOR,
        correctStreak: data.correctStreak ?? 0,
        recallStreak: data.recallStreak ?? 0,
        nextReviewAt: data.nextReviewAt,
        sourceContentIds: data.sourceContentIds ?? [],
      })
    }
  })

  dueCards.sort((a, b) => {
    const aDate = a.nextReviewAt?.toDate ? a.nextReviewAt.toDate() : new Date(0)
    const bDate = b.nextReviewAt?.toDate ? b.nextReviewAt.toDate() : new Date(0)
    return aDate - bDate
  })

  return dueCards
}

export const upsertVocabEntry = async (
  userId,
  language,
  text,
  translation,
  status,
  sourceContentId = null
) => {
  if (!VOCAB_STATUSES.includes(status)) {
    throw new Error(`Invalid vocab status: ${status}`)
  }

  const normalisedLang = normaliseLanguage(language)
  const ref = getVocabDocRef(userId, normalisedLang, text)
  const existingDoc = await getDoc(ref)

  // Track if this is a new "known" word for progress tracking
  const previousStatus = existingDoc.exists() ? existingDoc.data().status : null
  const isNewlyKnown = status === 'known' && previousStatus !== 'known'

  // Check if translation is a fallback/placeholder string
  const isFallbackTranslation = !translation ||
    translation === 'No translation found' ||
    translation === 'No translation'

  // Determine the translation to save
  let translationToSave = translation
  if (existingDoc.exists()) {
    const existingData = existingDoc.data()
    // Preserve existing translation if new one is a fallback
    if (isFallbackTranslation && existingData.translation &&
        existingData.translation !== 'No translation found' &&
        existingData.translation !== 'No translation') {
      translationToSave = existingData.translation
    }
  }
  // If no existing translation and new one is fallback, save null instead of the literal string
  if (isFallbackTranslation && translationToSave === translation) {
    translationToSave = null
  }

  const updates = {
    text,
    translation: translationToSave,
    language: normalisedLang,
    status,
    updatedAt: serverTimestamp(),
  }

  if (!existingDoc.exists()) {
    // New entry - initialize all SRS fields
    const now = new Date()
    const statusIntervals = {
      unknown: 0,
      recognised: 1,
      familiar: 3,
      known: 7,
    }
    const intervalDays = statusIntervals[status] ?? 0
    const nextReviewDate =
      intervalDays === 0
        ? serverTimestamp()
        : Timestamp.fromDate(new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000))

    updates.createdAt = serverTimestamp()
    updates.intervalDays = intervalDays
    updates.easeFactor = DEFAULT_EASE_FACTOR
    updates.correctStreak = 0
    updates.recallStreak = 0
    updates.nextReviewAt = nextReviewDate
    updates.sourceContentIds = sourceContentId ? [sourceContentId] : []
  } else if (sourceContentId) {
    // Existing entry - add source content ID if not already present
    const existingData = existingDoc.data()
    const existingSourceIds = existingData.sourceContentIds || []
    if (!existingSourceIds.includes(sourceContentId)) {
      updates.sourceContentIds = [...existingSourceIds, sourceContentId]
    }
  }

  await setDoc(ref, updates, { merge: true })

  // Track progress when word becomes known
  if (isNewlyKnown) {
    incrementWordsLearned(userId, normalisedLang).catch(console.error)
  }
}

export const addSourceContentId = async (userId, language, text, contentId) => {
  const ref = getVocabDocRef(userId, language, text)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    return // Entry doesn't exist, nothing to update
  }

  const data = docSnap.data()
  const existingSourceIds = data.sourceContentIds || []

  if (!existingSourceIds.includes(contentId)) {
    await setDoc(
      ref,
      {
        sourceContentIds: [...existingSourceIds, contentId],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  }
}

const getNextStatus = (currentStatus) => {
  const currentIndex = VOCAB_STATUSES.indexOf(currentStatus)
  if (currentIndex === -1) return 'unknown'
  return VOCAB_STATUSES[Math.min(currentIndex + 1, VOCAB_STATUSES.length - 1)]
}

const getPreviousStatus = (currentStatus) => {
  const currentIndex = VOCAB_STATUSES.indexOf(currentStatus)
  if (currentIndex <= 0) return 'unknown'
  return VOCAB_STATUSES[currentIndex - 1]
}

const shouldPromoteStatus = (currentStatus, correctStreak, recallStreak, intervalDays, isRecallMode) => {
  if (currentStatus === 'unknown') {
    // Unknown → Recognised: just 1 success
    return true
  }

  if (currentStatus === 'recognised') {
    const threshold = PROMOTION_THRESHOLDS.recognised_to_familiar
    return correctStreak >= threshold.streak && intervalDays >= threshold.minIntervalDays
  }

  if (currentStatus === 'familiar') {
    const threshold = PROMOTION_THRESHOLDS.familiar_to_known
    if (threshold.requiresRecall && !isRecallMode) {
      return false // Must be in recall mode to promote to known
    }
    return recallStreak >= threshold.streak && intervalDays >= threshold.minIntervalDays
  }

  return false // Already known
}

/**
 * SM-2 Algorithm Implementation
 *
 * Quality responses:
 * - 'again': Complete failure, reset interval
 * - 'hard': Correct but with difficulty
 * - 'good': Correct with normal effort
 * - 'easy': Correct with no effort
 *
 * @param {string} userId
 * @param {string} language
 * @param {string} text
 * @param {'again' | 'hard' | 'good' | 'easy'} quality
 * @param {boolean} isRecallMode - Whether review was in recall mode (translation → word)
 */
export const updateVocabSRS = async (userId, language, text, quality, isRecallMode = false) => {
  const normalisedLang = normaliseLanguage(language)
  const ref = getVocabDocRef(userId, normalisedLang, text)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Vocab entry not found for review')
  }

  const data = docSnap.data() || {}

  const previousStatus = data.status || 'unknown'
  let status = previousStatus
  let intervalDays = Number.isFinite(data.intervalDays) ? data.intervalDays : 0
  let easeFactor = Number.isFinite(data.easeFactor) ? data.easeFactor : DEFAULT_EASE_FACTOR
  let correctStreak = Number.isFinite(data.correctStreak) ? data.correctStreak : 0
  let recallStreak = Number.isFinite(data.recallStreak) ? data.recallStreak : 0

  const now = new Date()
  let nextReviewAt

  if (quality === 'again') {
    // Failed - handle regression
    if (status === 'familiar') {
      status = 'recognised' // Familiar → Recognised on failure
    } else if (status === 'known') {
      status = 'familiar' // Known → Familiar on failure
    }
    // Unknown and Recognised stay the same (no regression)

    correctStreak = 0
    recallStreak = 0
    intervalDays = 0.25 // 6 hours
    easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.2)
    nextReviewAt = Timestamp.fromDate(new Date(now.getTime() + 6 * 60 * 60 * 1000))
  } else {
    // Successful review (hard, good, or easy)
    const isFirstReview = intervalDays === 0 || correctStreak === 0
    const isSecondReview = correctStreak === 1 && intervalDays <= FIRST_INTERVAL

    if (quality === 'hard') {
      // Correct but struggled
      if (isFirstReview) {
        intervalDays = FIRST_INTERVAL
      } else if (isSecondReview) {
        intervalDays = SECOND_INTERVAL
      } else {
        intervalDays = Math.round(intervalDays * 1.2)
      }
      easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15)
      correctStreak += 1
      if (isRecallMode) recallStreak += 1
    } else if (quality === 'good') {
      // Normal correct response
      if (isFirstReview) {
        intervalDays = FIRST_INTERVAL
      } else if (isSecondReview) {
        intervalDays = SECOND_INTERVAL
      } else {
        intervalDays = Math.round(intervalDays * easeFactor)
      }
      // Ease factor unchanged for 'good'
      correctStreak += 1
      if (isRecallMode) recallStreak += 1
    } else if (quality === 'easy') {
      // Easy - instant recall
      if (isFirstReview) {
        intervalDays = SECOND_INTERVAL // Skip to second interval
      } else if (isSecondReview) {
        intervalDays = Math.round(SECOND_INTERVAL * easeFactor)
      } else {
        intervalDays = Math.round(intervalDays * easeFactor * 1.3)
      }
      easeFactor = easeFactor + 0.15
      correctStreak += 1
      if (isRecallMode) recallStreak += 1
    }

    // Cap interval at 365 days
    intervalDays = Math.min(intervalDays, 365)

    // Check for status promotion
    if (shouldPromoteStatus(status, correctStreak, recallStreak, intervalDays, isRecallMode)) {
      status = getNextStatus(status)
    }

    nextReviewAt = Timestamp.fromDate(new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000))
  }

  await setDoc(
    ref,
    {
      status,
      intervalDays,
      easeFactor,
      correctStreak,
      recallStreak,
      nextReviewAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  // Track progress when word is promoted to known
  if (status === 'known' && previousStatus !== 'known') {
    incrementWordsLearned(userId, normalisedLang).catch(console.error)
  }

  return { status, intervalDays, easeFactor, correctStreak, recallStreak }
}

/**
 * Manually set vocab status (user override)
 */
export const setVocabStatus = async (userId, language, text, newStatus) => {
  if (!VOCAB_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid vocab status: ${newStatus}`)
  }

  const normalisedLang = normaliseLanguage(language)
  const ref = getVocabDocRef(userId, normalisedLang, text)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Vocab entry not found')
  }

  const previousStatus = docSnap.data().status

  await setDoc(
    ref,
    {
      status: newStatus,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  // Track progress when word becomes known
  if (newStatus === 'known' && previousStatus !== 'known') {
    incrementWordsLearned(userId, normalisedLang).catch(console.error)
  }
}

/**
 * Update translation for a vocab entry
 */
export const updateVocabTranslation = async (userId, language, text, translation) => {
  const ref = getVocabDocRef(userId, language, text)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    return // Entry doesn't exist, nothing to update
  }

  await setDoc(
    ref,
    {
      translation,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}
