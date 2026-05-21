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
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
  increment,
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

// ── Write helpers ─────────────────────────────────────────────────────
//
// Stage 2 stores CATALOG-ONLY entries: enough metadata for the discover
// page to render a card (title, author, cover, language, kind) plus a
// stable source identifier so the user's per-user copy can be linked
// back. Per-user docs continue to hold the full text/audio because each
// user's adaptation level / voice differs, so duplicating the entire
// adapted content here would be both wasteful and frequently wrong.
//
// When a user "discovers" a shared catalog entry and adds it to their
// library, Stage 3 will run the existing generation/import flow with
// the original `sourceId` to rebuild the content for that user — and
// drop a per-user doc with sharedAudiobookId set so the popularity
// counter is incremented.

// Build the catalog payload from a per-user story doc. Used by both the
// client (generation) and the server (imports). Returns a plain object
// safe to setDoc/addDoc.
export const buildCatalogPayload = ({
  kind,
  sourceType,
  sourceId,
  title,
  author,
  language,
  originalLanguage = null,
  level = null,
  genre = null,
  description = null,
  coverImageUrl = null,
  coverImageUrlSquare = null,
  isFlat = null,
  chapterCount = null,
  totalWords = null,
  hasFullAudio = false,
  durationMs = null,
  createdByUid,
}) => ({
  kind,
  sourceType: sourceType || null,
  sourceId: sourceId ? String(sourceId) : null,
  title: title || 'Untitled',
  author: author || '',
  language: language || '',
  originalLanguage: originalLanguage || null,
  level: level || null,
  genre: genre || null,
  description: description || null,
  coverImageUrl: coverImageUrl || null,
  coverImageUrlSquare: coverImageUrlSquare || null,
  isFlat: typeof isFlat === 'boolean' ? isFlat : null,
  chapterCount: Number.isFinite(chapterCount) ? chapterCount : null,
  totalWords: Number.isFinite(totalWords) ? totalWords : null,
  hasFullAudio: !!hasFullAudio,
  durationMs: Number.isFinite(durationMs) ? durationMs : null,
  popularityCount: 0,
  createdByUid: createdByUid || null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

// Upsert a shared catalog entry with a DETERMINISTIC id. Used for
// public-domain content (e.g. Gutenberg) so the same source resolves
// to one shared doc regardless of which user imports it. Existing
// popularityCount and createdByUid are preserved on update.
export const upsertSharedAudiobookBySource = async (payload) => {
  const audiobookId = buildSharedAudiobookId({
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
  })
  if (!audiobookId) return null
  try {
    const ref = sharedAudiobookRef(audiobookId)
    const existing = await getDoc(ref)
    if (existing.exists()) {
      // Don't clobber popularity or original creator on subsequent imports.
      const next = { ...payload, updatedAt: serverTimestamp() }
      delete next.popularityCount
      delete next.createdByUid
      delete next.createdAt
      await updateDoc(ref, next)
    } else {
      await setDoc(ref, payload)
    }
    return audiobookId
  } catch (err) {
    console.warn('upsertSharedAudiobookBySource failed', err?.message || err)
    return null
  }
}

// Create a shared catalog entry with an AUTO-GENERATED id. Used for
// generated content where each generation is unique even if the prompt
// happens to match a previous one.
export const createSharedAudiobookCatalogEntry = async (payload) => {
  try {
    const ref = await addDoc(sharedAudiobooksCol(), payload)
    return ref.id
  } catch (err) {
    console.warn('createSharedAudiobookCatalogEntry failed', err?.message || err)
    return null
  }
}

// Bump the popularity counter on a shared doc. Fire when a user adds a
// shared item to their library, or plays one.
export const incrementSharedAudiobookPopularity = async (audiobookId) => {
  if (!audiobookId) return
  try {
    await updateDoc(sharedAudiobookRef(audiobookId), {
      popularityCount: increment(1),
      lastInteractionAt: serverTimestamp(),
    })
  } catch (err) {
    console.warn('incrementSharedAudiobookPopularity failed', err?.message || err)
  }
}
