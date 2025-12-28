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

export const VOCAB_STATUSES = ['unknown', 'recognised', 'familiar', 'known']

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
    }
  })

  return vocabEntries
}

export const upsertVocabEntry = async (
  userId,
  language,
  text,
  translation,
  status
) => {
  if (!VOCAB_STATUSES.includes(status)) {
    throw new Error(`Invalid vocab status: ${status}`)
  }

  const normalisedLang = normaliseLanguage(language)
  const ref = getVocabDocRef(userId, normalisedLang, text)
  const existingDoc = await getDoc(ref)

  const initialSRS = {}

  if (!existingDoc.exists()) {
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

    initialSRS.createdAt = serverTimestamp()
    initialSRS.intervalDays = intervalDays
    initialSRS.correctStreak = 0
    initialSRS.nextReviewAt = nextReviewDate
  }

  await setDoc(
    ref,
    {
      text,
      translation,
      language: normalisedLang,
      status,
      ...initialSRS,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

const promoteStatus = (status) => {
  const statusOrder = ['unknown', 'recognised', 'familiar', 'known']
  const currentIndex = statusOrder.indexOf(status)
  if (currentIndex === -1) return 'unknown'
  return statusOrder[Math.min(currentIndex + 1, statusOrder.length - 1)]
}

export const updateVocabSRS = async (userId, language, text, quality) => {
  const ref = getVocabDocRef(userId, language, text)
  const docSnap = await getDoc(ref)

  if (!docSnap.exists()) {
    throw new Error('Vocab entry not found for review')
  }

  const data = docSnap.data() || {}

  let status = data.status || 'unknown'
  let intervalDays = Number.isFinite(data.intervalDays) ? data.intervalDays : 0
  let correctStreak = Number.isFinite(data.correctStreak) ? data.correctStreak : 0

  const now = new Date()
  let nextReviewAt = Timestamp.fromDate(now)

  if (quality === 'again') {
    status = 'unknown'
    correctStreak = 0
    intervalDays = 0.25
    nextReviewAt = Timestamp.fromDate(new Date(now.getTime() + 6 * 60 * 60 * 1000))
  } else if (quality === 'good') {
    status = promoteStatus(status)
    intervalDays = intervalDays <= 0 ? 1 : Math.round(intervalDays * 2)
    correctStreak += 1
    nextReviewAt = Timestamp.fromDate(new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000))
  } else if (quality === 'easy') {
    status = 'known'
    intervalDays = intervalDays < 3 ? 3 : Math.round(intervalDays * 2.5)
    if (intervalDays > 60) {
      intervalDays = 60
    }
    correctStreak += 1
    nextReviewAt = Timestamp.fromDate(new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000))
  }

  await setDoc(
    ref,
    {
      status,
      intervalDays,
      correctStreak,
      nextReviewAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}
