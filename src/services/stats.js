import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { resolveSupportedLanguageLabel } from '../constants/languages'

/**
 * Stats service - aggregates user learning statistics
 */

const normaliseLanguage = (language) => resolveSupportedLanguageLabel(language, language)

/**
 * Increment the review count for a language
 * Call this each time a flashcard is reviewed
 */
export async function incrementReviewCount(userId, language) {
  if (!userId || !language) return

  const normalisedLang = normaliseLanguage(language)
  const statsRef = doc(db, 'users', userId, 'reviewStats', normalisedLang)

  try {
    await setDoc(statsRef, {
      language: normalisedLang,
      totalReviews: increment(1),
    }, { merge: true })
  } catch (error) {
    console.error('Error incrementing review count:', error)
  }
}

/**
 * Increment words read count
 * Call this when user completes reading a sentence or page
 */
export async function incrementWordsRead(userId, language, wordCount) {
  if (!userId || !language || !wordCount || wordCount <= 0) return

  const normalisedLang = normaliseLanguage(language)
  const statsRef = doc(db, 'users', userId, 'readingStats', normalisedLang)

  try {
    await setDoc(statsRef, {
      language: normalisedLang,
      totalWordsRead: increment(wordCount),
    }, { merge: true })
  } catch (error) {
    console.error('Error incrementing words read:', error)
  }
}

/**
 * Get total words read for a language (from direct tracking)
 */
export async function getWordsReadDirect(userId, language) {
  if (!userId) return 0

  const normalisedLang = normaliseLanguage(language)
  const statsRef = doc(db, 'users', userId, 'readingStats', normalisedLang)

  try {
    const snapshot = await getDoc(statsRef)
    if (snapshot.exists()) {
      return snapshot.data().totalWordsRead || 0
    }
    return 0
  } catch (error) {
    console.error('Error fetching words read:', error)
    return 0
  }
}

/**
 * Get total review count for a language
 */
export async function getReviewCount(userId, language) {
  if (!userId) return 0

  const normalisedLang = normaliseLanguage(language)
  const statsRef = doc(db, 'users', userId, 'reviewStats', normalisedLang)

  try {
    const snapshot = await getDoc(statsRef)
    if (snapshot.exists()) {
      return snapshot.data().totalReviews || 0
    }
    return 0
  } catch (error) {
    console.error('Error fetching review count:', error)
    return 0
  }
}

/**
 * Get count of known words for a language
 */
export async function getKnownWordCount(userId, language) {
  if (!userId) return 0

  const vocabRef = collection(db, 'users', userId, 'vocab')

  let vocabQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    vocabQuery = query(
      vocabRef,
      where('language', '==', normalisedLang),
      where('status', '==', 'known')
    )
  } else {
    vocabQuery = query(vocabRef, where('status', '==', 'known'))
  }

  const snapshot = await getDocs(vocabQuery)
  return snapshot.size
}

/**
 * Get vocab counts by status for a language
 */
export async function getVocabCounts(userId, language) {
  if (!userId) return { unknown: 0, recognised: 0, familiar: 0, known: 0, total: 0 }

  const vocabRef = collection(db, 'users', userId, 'vocab')

  let snapshot
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    const vocabQuery = query(vocabRef, where('language', '==', normalisedLang))
    snapshot = await getDocs(vocabQuery)
  } else {
    snapshot = await getDocs(vocabRef)
  }

  const counts = { unknown: 0, recognised: 0, familiar: 0, known: 0, total: 0 }

  snapshot.forEach((docSnap) => {
    const status = docSnap.data().status
    if (counts[status] !== undefined) {
      counts[status]++
    }
    counts.total++
  })

  return counts
}

/**
 * Count words read based on story progress
 * Calculates total words from pages that have been read (based on progress %)
 */
export async function getWordsRead(userId, language) {
  if (!userId) return 0

  const storiesRef = collection(db, 'users', userId, 'stories')

  let storiesQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    storiesQuery = query(storiesRef, where('language', '==', normalisedLang))
  } else {
    storiesQuery = query(storiesRef)
  }

  const storiesSnapshot = await getDocs(storiesQuery)
  let totalWordsRead = 0

  // For each story, calculate words read based on progress
  for (const storyDoc of storiesSnapshot.docs) {
    const storyData = storyDoc.data()
    const progress = storyData.progress || 0

    if (progress === 0) continue

    // Get pages for this story
    const pagesRef = collection(db, 'users', userId, 'stories', storyDoc.id, 'pages')
    const pagesSnapshot = await getDocs(pagesRef)

    // Count total words in story
    let storyWordCount = 0
    pagesSnapshot.forEach((pageDoc) => {
      const content = pageDoc.data().content || ''
      // Count words (split by whitespace)
      const words = content.trim().split(/\s+/).filter(Boolean)
      storyWordCount += words.length
    })

    // Calculate words read based on progress percentage
    const wordsRead = Math.floor(storyWordCount * (progress / 100))
    totalWordsRead += wordsRead
  }

  return totalWordsRead
}

/**
 * Get total listening time in seconds
 * Aggregates from speech recordings and listening sessions
 */
export async function getListeningTime(userId, language) {
  if (!userId) return 0

  let totalSeconds = 0

  // Get from speech profile (which tracks total practice time)
  const speechProfilesRef = collection(db, 'users', userId, 'speechProfiles')

  let profilesQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    profilesQuery = query(speechProfilesRef, where('language', '==', normalisedLang))
  } else {
    profilesQuery = query(speechProfilesRef)
  }

  const profilesSnapshot = await getDocs(profilesQuery)
  profilesSnapshot.forEach((docSnap) => {
    const stats = docSnap.data().stats || {}
    totalSeconds += stats.totalPracticeTime || 0
  })

  // Get from speech recordings (backup if profile stats missing)
  const recordingsRef = collection(db, 'users', userId, 'speechRecordings')

  let recordingsQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    recordingsQuery = query(recordingsRef, where('language', '==', normalisedLang))
  } else {
    recordingsQuery = query(recordingsRef)
  }

  const recordingsSnapshot = await getDocs(recordingsQuery)
  recordingsSnapshot.forEach((docSnap) => {
    const duration = docSnap.data().duration || 0
    // Duration is in seconds
    totalSeconds += duration
  })

  // Get from YouTube videos (estimate based on progress if available)
  const youtubeRef = collection(db, 'users', userId, 'youtubeVideos')

  let youtubeQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    youtubeQuery = query(youtubeRef, where('language', '==', normalisedLang))
  } else {
    youtubeQuery = query(youtubeRef)
  }

  const youtubeSnapshot = await getDocs(youtubeQuery)
  youtubeSnapshot.forEach((docSnap) => {
    const data = docSnap.data()
    // If we have duration info, use it
    if (data.duration) {
      const progress = data.progress || 0
      totalSeconds += Math.floor(data.duration * (progress / 100))
    }
  })

  // Get from Spotify items
  const spotifyRef = collection(db, 'users', userId, 'spotifyItems')

  let spotifyQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    spotifyQuery = query(spotifyRef, where('language', '==', normalisedLang))
  } else {
    spotifyQuery = query(spotifyRef)
  }

  const spotifySnapshot = await getDocs(spotifyQuery)
  spotifySnapshot.forEach((docSnap) => {
    const data = docSnap.data()
    // durationMs is in milliseconds
    if (data.durationMs) {
      const progress = data.progress || 100 // Assume fully listened if no progress tracked
      totalSeconds += Math.floor((data.durationMs / 1000) * (progress / 100))
    }
  })

  // Get from stories with audio (audiobooks) - only count if duration is set
  const storiesRef = collection(db, 'users', userId, 'stories')

  let storiesQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    storiesQuery = query(storiesRef, where('language', '==', normalisedLang))
  } else {
    storiesQuery = query(storiesRef)
  }

  const storiesSnapshot = await getDocs(storiesQuery)
  storiesSnapshot.forEach((docSnap) => {
    const data = docSnap.data()
    // Only count if story has audio duration (audiobook)
    if (data.duration && data.duration > 0) {
      const progress = data.progress || 0
      totalSeconds += Math.floor(data.duration * (progress / 100))
    }
  })

  return totalSeconds
}

/**
 * Format seconds as hours and minutes string
 */
export function formatListeningTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

/**
 * Get all stats for home page
 */
export async function getHomeStats(userId, language) {
  if (!userId) {
    return {
      knownWords: 0,
      wordsRead: 0,
      listeningSeconds: 0,
      listeningFormatted: '0m',
      reviewCount: 0,
      vocabCounts: { unknown: 0, recognised: 0, familiar: 0, known: 0, total: 0 },
    }
  }

  // Run queries in parallel for efficiency
  const [knownWords, wordsRead, listeningSeconds, reviewCount, vocabCounts] = await Promise.all([
    getKnownWordCount(userId, language),
    getWordsReadDirect(userId, language),
    getListeningTime(userId, language),
    getReviewCount(userId, language),
    getVocabCounts(userId, language),
  ])

  return {
    knownWords,
    wordsRead,
    listeningSeconds,
    listeningFormatted: formatListeningTime(listeningSeconds),
    reviewCount,
    vocabCounts,
  }
}
