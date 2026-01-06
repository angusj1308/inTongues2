import { collection, doc, addDoc, updateDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Speech service - handles speech recordings and assessments
 */

/**
 * Save a speech recording to Firestore
 */
export async function saveSpeechRecording(userId, recording) {
  const {
    type, // 'intensive' | 'voiceRecord'
    sourceType, // 'library' | 'upload' | 'writing' | 'spontaneous'
    sourceId,
    language,
    audioUrl,
    duration,
    transcription,
    referenceText,
    segmentIndex,
    segmentText,
    scores,
    feedback
  } = recording

  const recordingsRef = collection(db, 'users', userId, 'speechRecordings')

  const docRef = await addDoc(recordingsRef, {
    type,
    source: {
      type: sourceType,
      contentId: sourceId || null,
    },
    language,
    audioUrl,
    duration,
    transcription: transcription || null,
    referenceText: referenceText || null,
    segmentIndex: segmentIndex ?? null,
    segmentText: segmentText || null,
    scores: scores || null,
    feedback: feedback || null,
    createdAt: serverTimestamp(),
    reviewedAt: null,
    practiceCount: 1
  })

  return docRef.id
}

/**
 * Get user's speech recordings
 */
export async function getSpeechRecordings(userId, options = {}) {
  const {
    language,
    type,
    sourceType,
    limitCount = 50
  } = options

  const recordingsRef = collection(db, 'users', userId, 'speechRecordings')
  let q = query(recordingsRef, orderBy('createdAt', 'desc'), limit(limitCount))

  if (language) {
    q = query(recordingsRef, where('language', '==', language), orderBy('createdAt', 'desc'), limit(limitCount))
  }

  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}

/**
 * Get or create user speech profile
 */
export async function getSpeechProfile(userId, language) {
  const profilesRef = collection(db, 'users', userId, 'speechProfiles')
  const q = query(profilesRef, where('language', '==', language), limit(1))
  const snapshot = await getDocs(q)

  if (!snapshot.empty) {
    const doc = snapshot.docs[0]
    return { id: doc.id, ...doc.data() }
  }

  // Create default profile
  const defaultProfile = {
    language,
    stats: {
      totalRecordings: 0,
      totalPracticeTime: 0,
      averageScore: 0,
      intensiveRecordings: 0,
      voiceRecordRecordings: 0,
      scoreHistory: []
    },
    insights: {
      strongPhonemes: [],
      weakPhonemes: [],
      commonMistakes: [],
      focusAreas: []
    },
    settings: {
      autoSegmentLength: 10,
      showIPA: false,
      feedbackDetailLevel: 'detailed',
      voiceGender: 'female'
    },
    updatedAt: serverTimestamp()
  }

  const docRef = await addDoc(profilesRef, defaultProfile)
  return { id: docRef.id, ...defaultProfile }
}

/**
 * Update speech profile stats after a recording
 */
export async function updateSpeechProfileStats(userId, language, recordingData) {
  const profile = await getSpeechProfile(userId, language)
  const profileRef = doc(db, 'users', userId, 'speechProfiles', profile.id)

  const { type, duration, scores } = recordingData
  const stats = profile.stats || {}

  const updatedStats = {
    totalRecordings: (stats.totalRecordings || 0) + 1,
    totalPracticeTime: (stats.totalPracticeTime || 0) + (duration || 0),
    intensiveRecordings: type === 'intensive'
      ? (stats.intensiveRecordings || 0) + 1
      : (stats.intensiveRecordings || 0),
    voiceRecordRecordings: type === 'voiceRecord'
      ? (stats.voiceRecordRecordings || 0) + 1
      : (stats.voiceRecordRecordings || 0),
  }

  // Update average score
  if (scores?.overall) {
    const totalScore = (stats.averageScore || 0) * (stats.totalRecordings || 0) + scores.overall
    updatedStats.averageScore = totalScore / updatedStats.totalRecordings
  }

  // Add to score history (keep last 30 entries)
  const scoreHistory = stats.scoreHistory || []
  if (scores?.overall) {
    scoreHistory.push({
      date: new Date().toISOString().split('T')[0],
      score: scores.overall
    })
    updatedStats.scoreHistory = scoreHistory.slice(-30)
  }

  await updateDoc(profileRef, {
    stats: updatedStats,
    updatedAt: serverTimestamp()
  })

  return updatedStats
}

/**
 * Update phoneme insights based on pronunciation assessment
 */
export async function updatePhonemeInsights(userId, language, phonemeScores) {
  if (!phonemeScores || phonemeScores.length === 0) return

  const profile = await getSpeechProfile(userId, language)
  const profileRef = doc(db, 'users', userId, 'speechProfiles', profile.id)

  const insights = profile.insights || {}
  const phonemeData = {}

  // Aggregate phoneme scores
  phonemeScores.forEach(({ phoneme, score }) => {
    if (!phonemeData[phoneme]) {
      phonemeData[phoneme] = { total: 0, count: 0 }
    }
    phonemeData[phoneme].total += score
    phonemeData[phoneme].count += 1
  })

  // Identify strong and weak phonemes
  const strongPhonemes = new Set(insights.strongPhonemes || [])
  const weakPhonemes = new Set(insights.weakPhonemes || [])

  Object.entries(phonemeData).forEach(([phoneme, data]) => {
    const avgScore = data.total / data.count
    if (avgScore >= 80) {
      strongPhonemes.add(phoneme)
      weakPhonemes.delete(phoneme)
    } else if (avgScore < 60) {
      weakPhonemes.add(phoneme)
      strongPhonemes.delete(phoneme)
    }
  })

  await updateDoc(profileRef, {
    'insights.strongPhonemes': Array.from(strongPhonemes).slice(0, 20),
    'insights.weakPhonemes': Array.from(weakPhonemes).slice(0, 20),
    updatedAt: serverTimestamp()
  })
}

/**
 * Upload audio recording to server and get URL
 */
export async function uploadSpeechRecording(audioBlob, userId, language) {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')
  formData.append('userId', userId)
  formData.append('language', language)

  const response = await fetch('/api/speech/upload', {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error('Failed to upload recording')
  }

  const data = await response.json()
  return data.audioUrl
}

/**
 * Get pronunciation assessment for a recording
 */
export async function assessPronunciation(audioBase64, referenceText, language) {
  const response = await fetch('/api/speech/assess-pronunciation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      referenceText,
      language
    })
  })

  if (!response.ok) {
    throw new Error('Pronunciation assessment failed')
  }

  return response.json()
}

/**
 * Get full speech analysis (transcription + feedback)
 */
export async function analyzeSpeech(audioBase64, options = {}) {
  const {
    referenceText,
    language,
    nativeLanguage,
    type = 'reading',
    topic
  } = options

  const response = await fetch('/api/speech/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      referenceText,
      language,
      nativeLanguage,
      type,
      topic
    })
  })

  if (!response.ok) {
    throw new Error('Speech analysis failed')
  }

  return response.json()
}
