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

// Generate array of date keys for a period
const generateDateRange = (days) => {
  const dates = []
  for (let i = days - 1; i >= 0; i--) {
    dates.push(getDateKey(getDaysAgo(i)))
  }
  return dates
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
    // Query by language only to avoid composite index requirement
    // We'll filter by date and sort client-side
    const q = query(
      statsRef,
      where('language', '==', language)
    )

    const snapshot = await getDocs(q)
    const rawData = []

    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      // Filter by date client-side
      if (data.date && data.date >= startDateKey) {
        rawData.push(data)
      }
    })

    // Sort by date ascending
    rawData.sort((a, b) => a.date.localeCompare(b.date))

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
 * Always shows full period (7 days, 30 days, etc.) like a Bitcoin chart
 */
const processTallyData = (rawData, period, config, currentKnownWords) => {
  // Create a map of date -> wordsLearned for quick lookup
  const dataByDate = {}
  rawData.forEach((d) => {
    dataByDate[d.date] = d.wordsLearned || 0
  })

  // Generate full date range for the period
  const allDates = generateDateRange(config.days)

  // Calculate total gained in this period
  const totalGain = rawData.reduce((sum, d) => sum + (d.wordsLearned || 0), 0)

  // Build bars for every day in the period
  const dailyValues = allDates.map((date) => ({
    date,
    value: dataByDate[date] || 0,
  }))

  // Normalize bar heights (0-100%)
  const maxGain = Math.max(...dailyValues.map((d) => d.value), 1)
  const bars = dailyValues.map((d) => ({
    value: d.value,
    height: (d.value / maxGain) * 100,
    date: d.date,
  }))

  // Build cumulative points for line graph
  // Work backwards from current known words
  let cumulative = currentKnownWords
  const points = []

  for (let i = dailyValues.length - 1; i >= 0; i--) {
    points.unshift({
      x: i / (dailyValues.length - 1 || 1),
      y: cumulative,
      date: dailyValues[i].date,
      gained: dailyValues[i].value,
    })
    cumulative = Math.max(0, cumulative - dailyValues[i].value)
  }

  // Get min/max for y-axis scaling (min should never be negative)
  const minWords = Math.max(0, Math.min(...points.map((p) => p.y)))
  const maxWords = Math.max(...points.map((p) => p.y))

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
 * Always shows full period like a Bitcoin chart
 */
const generateEmptyData = (period) => {
  const periodConfig = {
    week: { days: 7 },
    month: { days: 30 },
    year: { days: 365 },
    '5year': { days: 1825 },
  }

  const config = periodConfig[period] || periodConfig.week
  const allDates = generateDateRange(config.days)

  const points = allDates.map((date, i) => ({
    x: i / (allDates.length - 1 || 1),
    y: 0,
    date,
    gained: 0,
  }))

  const bars = allDates.map((date) => ({
    value: 0,
    height: 0,
    date,
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
