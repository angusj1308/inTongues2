import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { resolveSupportedLanguageLabel } from '../constants/languages'

/**
 * Routine service - manages daily learning routines
 *
 * Schema: users/{userId}/routines/{routineId}
 * {
 *   name: string,
 *   language: string,
 *   isActive: boolean,
 *   schedule: {
 *     monday: Activity[],
 *     tuesday: Activity[],
 *     wednesday: Activity[],
 *     thursday: Activity[],
 *     friday: Activity[],
 *     saturday: Activity[],
 *     sunday: Activity[]
 *   },
 *   createdAt: timestamp,
 *   updatedAt: timestamp
 * }
 *
 * Activity: {
 *   id: string (uuid),
 *   time: string (HH:MM format),
 *   activityType: 'reading' | 'listening' | 'speaking' | 'review' | 'writing' | 'tutor',
 *   contentId?: string,
 *   contentType?: 'story' | 'youtube' | 'spotify' | 'practice',
 *   title?: string,
 *   duration?: number (minutes)
 * }
 */

export const ACTIVITY_TYPES = [
  { id: 'reading', label: 'Reading', icon: 'book', color: '#3B82F6' },
  { id: 'listening', label: 'Listening', icon: 'headphones', color: '#8B5CF6' },
  { id: 'speaking', label: 'Speaking', icon: 'mic', color: '#EC4899' },
  { id: 'review', label: 'Review', icon: 'cards', color: '#F59E0B' },
  { id: 'writing', label: 'Writing', icon: 'pen', color: '#10B981' },
  { id: 'tutor', label: 'Tutor', icon: 'chat', color: '#06B6D4' },
]

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

export const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const normaliseLanguage = (language) => resolveSupportedLanguageLabel(language, language)

/**
 * Generate a unique ID for activities
 */
function generateActivityId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create an empty schedule template
 */
function createEmptySchedule() {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }
}

/**
 * Create a new routine
 */
export async function createRoutine(userId, name, language) {
  if (!userId) throw new Error('User ID required')

  const routinesRef = collection(db, 'users', userId, 'routines')

  const routine = {
    name: name || 'My Routine',
    language: normaliseLanguage(language),
    isActive: true,
    schedule: createEmptySchedule(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = await addDoc(routinesRef, routine)
  return { id: docRef.id, ...routine }
}

/**
 * Get all routines for a user
 */
export async function getRoutines(userId, language) {
  if (!userId) return []

  const routinesRef = collection(db, 'users', userId, 'routines')

  let routinesQuery
  if (language) {
    const normalisedLang = normaliseLanguage(language)
    routinesQuery = query(routinesRef, where('language', '==', normalisedLang))
  } else {
    routinesQuery = query(routinesRef)
  }

  const snapshot = await getDocs(routinesQuery)
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }))
}

/**
 * Get active routine for a language
 */
export async function getActiveRoutine(userId, language) {
  if (!userId) return null

  const routinesRef = collection(db, 'users', userId, 'routines')
  const normalisedLang = normaliseLanguage(language)

  const routinesQuery = query(
    routinesRef,
    where('language', '==', normalisedLang),
    where('isActive', '==', true)
  )

  const snapshot = await getDocs(routinesQuery)

  if (snapshot.empty) return null

  const docSnap = snapshot.docs[0]
  return { id: docSnap.id, ...docSnap.data() }
}

/**
 * Get or create active routine for a language
 */
export async function getOrCreateActiveRoutine(userId, language) {
  const existing = await getActiveRoutine(userId, language)
  if (existing) return existing

  return createRoutine(userId, 'My Routine', language)
}

/**
 * Get a single routine by ID
 */
export async function getRoutine(userId, routineId) {
  if (!userId || !routineId) return null

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  const docSnap = await getDoc(routineRef)

  if (!docSnap.exists()) return null

  return { id: docSnap.id, ...docSnap.data() }
}

/**
 * Update routine name
 */
export async function updateRoutineName(userId, routineId, name) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')

  const routineRef = doc(db, 'users', userId, 'routines', routineId)

  await updateDoc(routineRef, {
    name,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Set routine as active (deactivates others for same language)
 */
export async function setRoutineActive(userId, routineId, language) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')

  // Deactivate other routines for this language
  const routines = await getRoutines(userId, language)
  for (const routine of routines) {
    if (routine.id !== routineId && routine.isActive) {
      const ref = doc(db, 'users', userId, 'routines', routine.id)
      await updateDoc(ref, { isActive: false, updatedAt: serverTimestamp() })
    }
  }

  // Activate selected routine
  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await updateDoc(routineRef, {
    isActive: true,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Delete a routine
 */
export async function deleteRoutine(userId, routineId) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await deleteDoc(routineRef)
}

/**
 * Add an activity to a day
 */
export async function addActivity(userId, routineId, day, activity) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')
  if (!DAYS_OF_WEEK.includes(day)) throw new Error('Invalid day')

  const routine = await getRoutine(userId, routineId)
  if (!routine) throw new Error('Routine not found')

  const schedule = routine.schedule || createEmptySchedule()
  const dayActivities = schedule[day] || []

  const newActivity = {
    id: generateActivityId(),
    time: activity.time || '09:00',
    activityType: activity.activityType || 'reading',
    contentId: activity.contentId || null,
    contentType: activity.contentType || null,
    title: activity.title || null,
    duration: activity.duration || 30,
  }

  dayActivities.push(newActivity)

  // Sort by time
  dayActivities.sort((a, b) => {
    const timeA = a.time || '00:00'
    const timeB = b.time || '00:00'
    return timeA.localeCompare(timeB)
  })

  schedule[day] = dayActivities

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await updateDoc(routineRef, {
    schedule,
    updatedAt: serverTimestamp(),
  })

  return newActivity
}

/**
 * Update an activity
 */
export async function updateActivity(userId, routineId, day, activityId, updates) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')
  if (!DAYS_OF_WEEK.includes(day)) throw new Error('Invalid day')

  const routine = await getRoutine(userId, routineId)
  if (!routine) throw new Error('Routine not found')

  const schedule = routine.schedule || createEmptySchedule()
  const dayActivities = schedule[day] || []

  const activityIndex = dayActivities.findIndex((a) => a.id === activityId)
  if (activityIndex === -1) throw new Error('Activity not found')

  dayActivities[activityIndex] = {
    ...dayActivities[activityIndex],
    ...updates,
  }

  // Re-sort by time if time changed
  if (updates.time) {
    dayActivities.sort((a, b) => {
      const timeA = a.time || '00:00'
      const timeB = b.time || '00:00'
      return timeA.localeCompare(timeB)
    })
  }

  schedule[day] = dayActivities

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await updateDoc(routineRef, {
    schedule,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Remove an activity from a day
 */
export async function removeActivity(userId, routineId, day, activityId) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')
  if (!DAYS_OF_WEEK.includes(day)) throw new Error('Invalid day')

  const routine = await getRoutine(userId, routineId)
  if (!routine) throw new Error('Routine not found')

  const schedule = routine.schedule || createEmptySchedule()
  const dayActivities = schedule[day] || []

  schedule[day] = dayActivities.filter((a) => a.id !== activityId)

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await updateDoc(routineRef, {
    schedule,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Move an activity to a different day
 */
export async function moveActivity(userId, routineId, fromDay, toDay, activityId) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')
  if (!DAYS_OF_WEEK.includes(fromDay) || !DAYS_OF_WEEK.includes(toDay)) {
    throw new Error('Invalid day')
  }

  const routine = await getRoutine(userId, routineId)
  if (!routine) throw new Error('Routine not found')

  const schedule = routine.schedule || createEmptySchedule()
  const fromActivities = schedule[fromDay] || []
  const toActivities = schedule[toDay] || []

  const activityIndex = fromActivities.findIndex((a) => a.id === activityId)
  if (activityIndex === -1) throw new Error('Activity not found')

  const [activity] = fromActivities.splice(activityIndex, 1)
  toActivities.push(activity)

  // Sort destination by time
  toActivities.sort((a, b) => {
    const timeA = a.time || '00:00'
    const timeB = b.time || '00:00'
    return timeA.localeCompare(timeB)
  })

  schedule[fromDay] = fromActivities
  schedule[toDay] = toActivities

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await updateDoc(routineRef, {
    schedule,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Get today's activities
 */
export async function getTodayActivities(userId, language) {
  const routine = await getActiveRoutine(userId, language)
  if (!routine) return []

  const today = new Date()
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase()

  return routine.schedule?.[today] || []
}

/**
 * Get activities for a specific day
 */
export function getActivitiesForDay(routine, day) {
  if (!routine || !routine.schedule) return []
  return routine.schedule[day] || []
}

/**
 * Copy activities from one day to another
 */
export async function copyDayActivities(userId, routineId, fromDay, toDay) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')
  if (!DAYS_OF_WEEK.includes(fromDay) || !DAYS_OF_WEEK.includes(toDay)) {
    throw new Error('Invalid day')
  }

  const routine = await getRoutine(userId, routineId)
  if (!routine) throw new Error('Routine not found')

  const schedule = routine.schedule || createEmptySchedule()
  const fromActivities = schedule[fromDay] || []

  // Create copies with new IDs
  const copiedActivities = fromActivities.map((activity) => ({
    ...activity,
    id: generateActivityId(),
  }))

  schedule[toDay] = [...(schedule[toDay] || []), ...copiedActivities]

  // Sort by time
  schedule[toDay].sort((a, b) => {
    const timeA = a.time || '00:00'
    const timeB = b.time || '00:00'
    return timeA.localeCompare(timeB)
  })

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await updateDoc(routineRef, {
    schedule,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Clear all activities for a day
 */
export async function clearDayActivities(userId, routineId, day) {
  if (!userId || !routineId) throw new Error('User ID and Routine ID required')
  if (!DAYS_OF_WEEK.includes(day)) throw new Error('Invalid day')

  const routine = await getRoutine(userId, routineId)
  if (!routine) throw new Error('Routine not found')

  const schedule = routine.schedule || createEmptySchedule()
  schedule[day] = []

  const routineRef = doc(db, 'users', userId, 'routines', routineId)
  await updateDoc(routineRef, {
    schedule,
    updatedAt: serverTimestamp(),
  })
}
