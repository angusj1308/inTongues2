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

// Stat type configurations
const STAT_CONFIGS = {
  knownWords: {
    collection: 'wordStats',
    field: 'wordsLearned',
    label: 'words',
    isCumulative: true, // shows cumulative total over time
  },
  wordsRead: {
    collection: 'dailyStats',
    field: 'wordsRead',
    label: 'words',
    isCumulative: true,
  },
  listeningSeconds: {
    collection: 'dailyStats',
    field: 'listeningSeconds',
    label: 'mins',
    isCumulative: true,
    transform: (val) => Math.round(val / 60), // convert to minutes
  },
  reviews: {
    collection: 'dailyStats',
    field: 'reviews',
    label: 'cards',
    isCumulative: false, // shows daily totals, not cumulative
  },
  wordsWritten: {
    collection: 'dailyStats',
    field: 'wordsWritten',
    label: 'words',
    isCumulative: true,
  },
  speakingSeconds: {
    collection: 'dailyStats',
    field: 'speakingSeconds',
    label: 'mins',
    isCumulative: true,
    transform: (val) => Math.round(val / 60), // convert to minutes
  },
}

/**
 * Get progress data for a specific period and stat type
 * @param {string} userId
 * @param {string} language
 * @param {string} period - 'week' | 'month' | 'year' | '5year'
 * @param {number} currentTotal - Current total for cumulative stats
 * @param {string} statType - 'knownWords' | 'wordsRead' | 'listeningSeconds' | 'reviews' | 'wordsWritten' | 'speakingSeconds'
 */
export const getProgressData = async (userId, language, period = 'week', currentTotal = 0, statType = 'knownWords') => {
  if (!userId || !language) return { points: [], bars: [], isEmpty: true }

  const statConfig = STAT_CONFIGS[statType] || STAT_CONFIGS.knownWords
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
    const statsRef = collection(db, 'users', userId, statConfig.collection)
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
        const value = data[statConfig.field] || 0
        rawData.push({
          date: data.date,
          value: statConfig.transform ? statConfig.transform(value) : value,
        })
      }
    })

    // Sort by date ascending
    rawData.sort((a, b) => a.date.localeCompare(b.date))

    // If no data, return empty state
    if (rawData.length === 0) {
      return generateEmptyData(period, statConfig)
    }

    // Process tally data into chart format
    const transformedTotal = statConfig.transform ? statConfig.transform(currentTotal) : currentTotal
    return processTallyData(rawData, period, config, transformedTotal, statConfig)
  } catch (error) {
    console.error('Error fetching progress data:', error)
    return generateEmptyData(period, statConfig)
  }
}

/**
 * Process daily tally data into chart-friendly format
 * Always shows full period (7 days, 30 days, etc.) like a Bitcoin chart
 */
const processTallyData = (rawData, period, config, currentTotal, statConfig) => {
  // Create a map of date -> value for quick lookup
  const dataByDate = {}
  rawData.forEach((d) => {
    dataByDate[d.date] = d.value || 0
  })

  // Generate full date range for the period
  const allDates = generateDateRange(config.days)

  // Calculate total gained in this period
  const totalGain = rawData.reduce((sum, d) => sum + (d.value || 0), 0)

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

  let points
  let minValue, maxValue

  if (statConfig.isCumulative) {
    // Build cumulative points for line graph
    // Work backwards from current total
    let cumulative = currentTotal
    points = []

    for (let i = dailyValues.length - 1; i >= 0; i--) {
      points.unshift({
        x: i / (dailyValues.length - 1 || 1),
        y: cumulative,
        date: dailyValues[i].date,
        gained: dailyValues[i].value,
      })
      cumulative = Math.max(0, cumulative - dailyValues[i].value)
    }

    // Get min/max for y-axis scaling
    minValue = Math.max(0, Math.min(...points.map((p) => p.y)))
    maxValue = Math.max(...points.map((p) => p.y))
  } else {
    // For non-cumulative stats, just show daily values
    points = dailyValues.map((d, i) => ({
      x: i / (dailyValues.length - 1 || 1),
      y: d.value,
      date: d.date,
      gained: d.value,
    }))

    // Get min/max for y-axis scaling
    minValue = 0
    maxValue = Math.max(...points.map((p) => p.y), 1)
  }

  return {
    points,
    bars,
    minWords: minValue,
    maxWords: maxValue,
    totalGain,
    isEmpty: false,
    label: statConfig.label,
  }
}

/**
 * Generate empty data structure when no data exists
 * Always shows full period like a Bitcoin chart
 */
const generateEmptyData = (period, statConfig = { label: 'words' }) => {
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
    label: statConfig.label,
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
