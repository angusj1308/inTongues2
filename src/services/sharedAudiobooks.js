// Shared audiobook catalogue. Generated stories and public-domain
// imports live here once and are referenced by any user that listens
// to them, so popularity / discovery / cross-user signals work and we
// don't duplicate the full text per user. Protected (copyrighted)
// user uploads stay private under /users/{uid}/stories/.
//
// Per-user library entries (progress, lastPlayedAt, vocab tags) stay
// in /users/{uid}/stories/{libraryEntryId} with a sharedAudiobookId
// field pointing here. The reader/player merges the two on read.
//
// Schema:
//   /sharedAudiobooks/{audiobookId}
//     {
//       kind: 'generated' | 'public-domain',  // category for filtering
//       title: string,
//       author: string,
//       language: string,                     // target language (label)
//       originalLanguage: string,             // source language (label)
//       level: 'A1'..'C2' | null,
//       isFlat: boolean,                      // true = single blob, false = chapters
//       sourceType: 'generated' | 'gutenberg' | 'epub' | 'txt' | 'pdf',
//       sourceId: string | null,              // upstream id for dedup (gutenberg_id, generation seed, etc)
//       genre: string | null,
//       description: string | null,
//       coverImageUrl: string | null,
//       coverImageUrlSquare: string | null,
//       coverColor: string | null,
//       audioStatus: 'pending' | 'ready' | 'failed',
//       hasFullAudio: boolean,
//       fullAudioUrl: string | null,
//       voiceId: string | null,
//       voiceGender: 'male' | 'female' | null,
//       totalWords: number | null,
//       durationMs: number | null,
//       adaptedTextBlob: string | null,       // flat books only
//       chapterCount: number | null,          // chapter books only
//       chapterOutline: array | null,         // chapter books only
//       createdAt: serverTimestamp,
//       createdByUid: string,                 // who first generated/imported it
//     }
//
//   /sharedAudiobooks/{audiobookId}/chapters/{index}
//   /sharedAudiobooks/{audiobookId}/pages/{pageNum}
//     // Same shape as the current per-user story subcollections.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
} from 'firebase/firestore'
import db from '../firebase'

export const SHARED_AUDIOBOOKS_COLLECTION = 'sharedAudiobooks'

// Stable identifier used to dedupe shared entries — same Gutenberg book
// imported by ten users should resolve to one shared doc.
//   - Gutenberg:     `gutenberg-${gutenberg_id}`
//   - Generated:     `gen-${userId}-${timestamp}` (one per generation event)
//   - Other public:  `${sourceType}-${stableHash}` (caller-supplied)
export const buildSharedAudiobookId = ({ sourceType, sourceId }) => {
  if (!sourceType || !sourceId) return null
  return `${sourceType}-${String(sourceId)}`
}

export const sharedAudiobooksCol = () => collection(db, SHARED_AUDIOBOOKS_COLLECTION)

export const sharedAudiobookRef = (audiobookId) =>
  doc(db, SHARED_AUDIOBOOKS_COLLECTION, audiobookId)

export const sharedAudiobookChaptersCol = (audiobookId) =>
  collection(db, SHARED_AUDIOBOOKS_COLLECTION, audiobookId, 'chapters')

export const sharedAudiobookPagesCol = (audiobookId) =>
  collection(db, SHARED_AUDIOBOOKS_COLLECTION, audiobookId, 'pages')

// Fetch a shared audiobook doc by id; returns null when missing.
export const fetchSharedAudiobook = async (audiobookId) => {
  if (!audiobookId) return null
  try {
    const snap = await getDoc(sharedAudiobookRef(audiobookId))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() }
  } catch (err) {
    console.warn('fetchSharedAudiobook failed', err?.message || err)
    return null
  }
}

// List shared audiobooks for a target language. Pass `kind` to filter to
// just generated or just public-domain content. Always ordered by
// createdAt DESC; pass a higher limit for discover surfaces.
export const listSharedAudiobooks = async ({ language, kind = null, max = 30 } = {}) => {
  try {
    const clauses = []
    if (language) clauses.push(where('language', '==', language))
    if (kind) clauses.push(where('kind', '==', kind))
    clauses.push(orderBy('createdAt', 'desc'))
    clauses.push(limit(max))
    const snap = await getDocs(query(sharedAudiobooksCol(), ...clauses))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.warn('listSharedAudiobooks failed', err?.message || err)
    return []
  }
}

// Load the chapter docs for a chapter-book shared audiobook in order.
export const fetchSharedAudiobookChapters = async (audiobookId) => {
  if (!audiobookId) return []
  try {
    const snap = await getDocs(
      query(sharedAudiobookChaptersCol(audiobookId), orderBy('index', 'asc')),
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.warn('fetchSharedAudiobookChapters failed', err?.message || err)
    return []
  }
}

// Same but for flat-book pages.
export const fetchSharedAudiobookPages = async (audiobookId) => {
  if (!audiobookId) return []
  try {
    const snap = await getDocs(
      query(sharedAudiobookPagesCol(audiobookId), orderBy('index', 'asc')),
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.warn('fetchSharedAudiobookPages failed', err?.message || err)
    return []
  }
}
