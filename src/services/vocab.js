import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

export const VOCAB_STATUSES = ['unknown', 'recognised', 'familiar', 'known']

export const normaliseExpression = (text) => text.trim().toLowerCase()

export const getVocabDocRef = (userId, language, text) => {
  const normalisedText = normaliseExpression(text)
  const id = `${language.toLowerCase()}_${normalisedText.replace(/\s+/g, '_')}`
  return doc(collection(doc(collection(db, 'users'), userId), 'vocab'), id)
}

export const loadUserVocab = async (userId, language) => {
  const vocabCollection = collection(doc(collection(db, 'users'), userId), 'vocab')
  const vocabQuery = query(vocabCollection, where('language', '==', language))
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

export const upsertVocabEntry = async (userId, language, text, status) => {
  if (!VOCAB_STATUSES.includes(status)) {
    throw new Error(`Invalid vocab status: ${status}`)
  }

  const ref = getVocabDocRef(userId, language, text)
  await setDoc(
    ref,
    { text, language, status, updatedAt: serverTimestamp() },
    { merge: true }
  )
}
