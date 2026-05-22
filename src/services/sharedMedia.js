// Cross-user popularity counters for podcast shows, music artists, and
// YouTube channels — the parent-level entities recommended on the Listen
// Discover rails. Audiobooks have their own catalog at /sharedAudiobooks;
// these three kinds didn't need a metadata catalog because their content
// already lives in third-party APIs (iTunes, Apple Music, YouTube), so
// we only store the minimum needed to render a Discover card plus the
// rolling popularity count.
//
// Schema:
//   /sharedMediaPopularity/{docId}
//     {
//       kind: 'podcast-show' | 'music-artist' | 'youtube-channel',
//       externalId: string,        // iTunes show id / Apple Music artist id / YouTube channel id
//       language: string,          // target language label (Spanish, Russian, …)
//       title: string,
//       subtitle: string,          // host / genre / '' — small caption under title
//       coverUrl: string,
//       popularityCount: number,
//       lastInteractionAt: serverTimestamp,
//     }
//   docId = `${kind}__${externalId}__${language}`
//
// Counts are per-language: the same iTunes show followed by Spanish
// learners and Russian learners gets two separate counter docs so a
// Spanish-heavy userbase doesn't pollute Russian charts.

import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import db from '../firebase'

export const SHARED_MEDIA_COLLECTION = 'sharedMediaPopularity'

export const MEDIA_KIND = {
  PODCAST_SHOW: 'podcast-show',
  MUSIC_ARTIST: 'music-artist',
  YOUTUBE_CHANNEL: 'youtube-channel',
}

const KIND_VALUES = new Set(Object.values(MEDIA_KIND))

const sharedMediaCol = () => collection(db, SHARED_MEDIA_COLLECTION)

const buildDocId = (kind, externalId, language) =>
  `${kind}__${externalId}__${language}`

// Upsert a popularity record. Creates the doc on first interaction
// (popularityCount=1) or increments it. Metadata (title/coverUrl/subtitle)
// is written on first interaction only — Firestore rules block changes
// to anything besides popularityCount + lastInteractionAt on update, so
// later calls' metadata is ignored even though we pass it.
export const recordMediaInteraction = async ({
  kind,
  externalId,
  language,
  title = '',
  subtitle = '',
  coverUrl = '',
} = {}) => {
  if (!KIND_VALUES.has(kind)) return
  if (!externalId || !language) return
  const docId = buildDocId(kind, externalId, language)
  try {
    await setDoc(
      doc(sharedMediaCol(), docId),
      {
        kind,
        externalId: String(externalId),
        language,
        title: title || '',
        subtitle: subtitle || '',
        coverUrl: coverUrl || '',
        popularityCount: increment(1),
        lastInteractionAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (err) {
    console.warn('recordMediaInteraction failed', err?.message || err)
  }
}

// List the most popular items for a kind+language combination. Used by
// the Listen Discover rails.
export const listPopularMedia = async ({ kind, language, max = 12 } = {}) => {
  if (!KIND_VALUES.has(kind) || !language) return []
  try {
    const snap = await getDocs(
      query(
        sharedMediaCol(),
        where('kind', '==', kind),
        where('language', '==', language),
        orderBy('popularityCount', 'desc'),
        limit(max),
      ),
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.warn('listPopularMedia failed', err?.message || err)
    return []
  }
}
