import { collection, doc, getDoc, getDocs, increment, query, orderBy, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Progress tracking service
 * Uses daily tally system to track words moved to "known" status
 *
 * Schema: users/{userId}/wordStats/{language}_{date}
 * - date: YYYY-MM-DD format
 * - wordsLearned: number (count of words moved to known that day)
 * - language: string
 */

// Get today's date in YYYY-MM-DD format
const getDateKey = (date = new Date()) => {
  return date.toISOString().split('T')[0]
}

// Get date from N days ago
const getDaysAgo = (days) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

/**
 * Increment today's learned word count
 * Call this whenever a word's status changes to "known"
 */
export const incrementWordsLearned = async (userId, language, count = 1) => {
  if (!userId || !language) return

  const dateKey = getDateKey()
  const docRef = doc(db, 'users', userId, 'wordStats', `${language}_${dateKey}`)

  try {
    await setDoc(docRef, {
      date: dateKey,
      language,
      wordsLearned: increment(count),
    }, { merge: true })
  } catch (error) {
    console.error('Error incrementing words learned:', error)
  }
}

/**
 * Get progress data for a specific period
 * @param {string} userId
 * @param {string} language
 * @param {string} period - 'week' | 'month' | 'year' | '5year'
 * @param {number} currentKnownWords - Current total known words (for cumulative line)
 */
export const getProgressData = async (userId, language, period = 'week', currentKnownWords = 0) => {
  if (!userId || !language) return { points: [], bars: [], isEmpty: true }

  const periodConfig = {
    week: { days: 7 },
    month: { days: 30 },
    year: { days: 365 },
    '5year': { days: 1825 },
  }

  const config = periodConfig[period] || periodConfig.week
  const startDate = getDaysAgo(config.days)
  const startDateKey = getDateKey(startDate)

  try {
    const statsRef = collection(db, 'users', userId, 'wordStats')
    const q = query(
      statsRef,
      where('language', '==', language),
      where('date', '>=', startDateKey),
      orderBy('date', 'asc')
    )

    const snapshot = await getDocs(q)
    const rawData = []

    snapshot.forEach((docSnap) => {
      rawData.push(docSnap.data())
    })

    // If no data, return empty state
    if (rawData.length === 0) {
      return generateEmptyData(period)
    }

    // Process tally data into chart format
    return processTallyData(rawData, period, config, currentKnownWords)
  } catch (error) {
    console.error('Error fetching progress data:', error)
    return generateEmptyData(period)
  }
}

/**
 * Process daily tally data into chart-friendly format
 */
const processTallyData = (rawData, period, config, currentKnownWords) => {
  // Calculate total gained in this period
  const totalGain = rawData.reduce((sum, d) => sum + (d.wordsLearned || 0), 0)

  // Work backwards from current known words to get cumulative values
  // This creates the line graph showing growth over time
  let cumulative = currentKnownWords
  const points = []

  // Reverse to build from newest to oldest
  for (let i = rawData.length - 1; i >= 0; i--) {
    points.unshift({
      x: i / (rawData.length - 1 || 1),
      y: cumulative,
      date: rawData[i].date,
      gained: rawData[i].wordsLearned || 0,
    })
    cumulative -= (rawData[i].wordsLearned || 0)
  }

  // Normalize bar heights (0-100%)
  const maxGain = Math.max(...rawData.map(d => d.wordsLearned || 0), 1)
  const bars = rawData.map((d) => ({
    value: d.wordsLearned || 0,
    height: ((d.wordsLearned || 0) / maxGain) * 100,
    date: d.date,
  }))

  // Get min/max for y-axis scaling
  const minWords = Math.min(...points.map(p => p.y))
  const maxWords = Math.max(...points.map(p => p.y))

  return {
    points,
    bars,
    minWords,
    maxWords,
    totalGain,
    isEmpty: false,
  }
}

/**
 * Generate empty data structure when no data exists
 */
const generateEmptyData = (period) => {
  const counts = {
    week: 7,
    month: 30,
    year: 12,
    '5year': 5,
  }

  const count = counts[period] || 7

  const points = Array.from({ length: count }, (_, i) => ({
    x: i / (count - 1 || 1),
    y: 0,
    date: '',
    gained: 0,
  }))

  const bars = Array.from({ length: count }, () => ({
    value: 0,
    height: 0,
    date: '',
  }))

  return {
    points,
    bars,
    minWords: 0,
    maxWords: 0,
    totalGain: 0,
    isEmpty: true,
  }
}

/**
 * Get today's word stats
 */
export const getTodayStats = async (userId, language) => {
  if (!userId || !language) return null

  const dateKey = getDateKey()
  const docRef = doc(db, 'users', userId, 'wordStats', `${language}_${dateKey}`)

  try {
    const snapshot = await getDoc(docRef)
    if (snapshot.exists()) {
      return snapshot.data()
    }
    return { wordsLearned: 0, date: dateKey, language }
  } catch (error) {
    console.error('Error fetching today stats:', error)
    return null
  }
}
