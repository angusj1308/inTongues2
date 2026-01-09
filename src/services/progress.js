import { collection, doc, getDoc, getDocs, query, orderBy, limit, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Progress tracking service
 * Stores daily snapshots of known word counts for progress visualization
 *
 * Schema: users/{userId}/progress/{date}
 * - date: YYYY-MM-DD format
 * - knownWords: number
 * - language: string
 * - timestamp: server timestamp
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
 * Record today's known word count snapshot
 */
export const recordDailyProgress = async (userId, language, knownWords) => {
  if (!userId || !language) return null

  const dateKey = getDateKey()
  const docRef = doc(db, 'users', userId, 'progress', `${language}_${dateKey}`)

  const data = {
    date: dateKey,
    language,
    knownWords,
    timestamp: new Date(),
  }

  await setDoc(docRef, data, { merge: true })
  return data
}

/**
 * Get progress data for a specific period
 * @param {string} userId
 * @param {string} language
 * @param {string} period - 'week' | 'month' | 'year' | '5year'
 */
export const getProgressData = async (userId, language, period = 'week') => {
  if (!userId || !language) return { points: [], bars: [] }

  const periodConfig = {
    week: { days: 7, groupBy: 'day' },
    month: { days: 30, groupBy: 'day' },
    year: { days: 365, groupBy: 'week' },
    '5year': { days: 1825, groupBy: 'month' },
  }

  const config = periodConfig[period] || periodConfig.week
  const startDate = getDaysAgo(config.days)
  const startDateKey = getDateKey(startDate)

  try {
    const progressRef = collection(db, 'users', userId, 'progress')
    const q = query(
      progressRef,
      where('language', '==', language),
      where('date', '>=', startDateKey),
      orderBy('date', 'asc')
    )

    const snapshot = await getDocs(q)
    const rawData = []

    snapshot.forEach((doc) => {
      rawData.push(doc.data())
    })

    // If no data, return empty with placeholder structure
    if (rawData.length === 0) {
      return generatePlaceholderData(period)
    }

    // Process data based on period
    return processProgressData(rawData, period, config)
  } catch (error) {
    console.error('Error fetching progress data:', error)
    return generatePlaceholderData(period)
  }
}

/**
 * Process raw progress data into chart-friendly format
 */
const processProgressData = (rawData, period, config) => {
  // Generate line graph points (cumulative known words over time)
  const points = rawData.map((d, i) => ({
    x: i / (rawData.length - 1 || 1),
    y: d.knownWords,
    date: d.date,
  }))

  // Calculate daily/weekly/monthly gains for bar chart
  const bars = []
  for (let i = 0; i < rawData.length; i++) {
    const current = rawData[i].knownWords
    const previous = i > 0 ? rawData[i - 1].knownWords : current
    const gain = Math.max(0, current - previous)
    bars.push({
      value: gain,
      date: rawData[i].date,
    })
  }

  // Normalize bar heights (0-100%)
  const maxGain = Math.max(...bars.map(b => b.value), 1)
  const normalizedBars = bars.map(b => ({
    ...b,
    height: (b.value / maxGain) * 100,
  }))

  // Get min/max for y-axis scaling
  const minWords = Math.min(...points.map(p => p.y))
  const maxWords = Math.max(...points.map(p => p.y))

  return {
    points,
    bars: normalizedBars,
    minWords,
    maxWords,
    totalGain: rawData.length > 1 ? rawData[rawData.length - 1].knownWords - rawData[0].knownWords : 0,
  }
}

/**
 * Generate placeholder data when no real data exists
 */
const generatePlaceholderData = (period) => {
  const counts = {
    week: 7,
    month: 30,
    year: 12,
    '5year': 5,
  }

  const count = counts[period] || 7

  // Generate flat line with zero gains (no data state)
  const points = Array.from({ length: count }, (_, i) => ({
    x: i / (count - 1 || 1),
    y: 0,
    date: '',
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
 * Get the most recent progress entry to check if today's snapshot exists
 */
export const getTodayProgress = async (userId, language) => {
  if (!userId || !language) return null

  const dateKey = getDateKey()
  const docRef = doc(db, 'users', userId, 'progress', `${language}_${dateKey}`)

  try {
    const snapshot = await getDoc(docRef)
    if (snapshot.exists()) {
      return snapshot.data()
    }
    return null
  } catch (error) {
    console.error('Error fetching today progress:', error)
    return null
  }
}
