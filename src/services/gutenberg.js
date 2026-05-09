/**
 * Gutenberg Classics service.
 *
 * Reads the curated `gutenberg_classics` Firestore collection (tier 1 English
 * public-domain works) and exposes the same shape the UI used to receive from
 * the Gutendex API. The full collection is small (~800 docs), so we fetch it
 * once on first use and serve search + pagination from memory — turning a
 * ~15s API page-load into a single sub-second Firestore read.
 */

import { collection, getDocs, orderBy, query } from 'firebase/firestore'

import { db } from '../firebase'

const COLLECTION = 'gutenberg_classics'
const PROBE_TIMEOUT_MS = 4000

let _allBooks = null
let _allBooksPromise = null

// Slugify a title for filesystem-based cover lookup at
// /assets/classics-covers/{slug}.png. Lowercased, diacritic-stripped, any
// non-alphanumeric run becomes a single hyphen. Leading articles preserved.
// Exported so the renderer and the cover probe use the same rule.
export const slugifyTitle = (title) => {
  if (!title) return ''
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export const localCoverPath = (title) => {
  const slug = slugifyTitle(title)
  return slug ? `/assets/classics-covers/${slug}.png` : null
}

const probeLocalCover = async (url) => {
  if (typeof fetch === 'undefined') return false
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller
    ? setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    : null
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: controller?.signal,
    })
    return resp.ok
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Annotate each book with hasCover (filesystem probe) and reorder so books
// with a custom imprint cover appear first, breaking ties by download count.
const annotateAndSort = async (books) => {
  await Promise.all(
    books.map(async (book) => {
      const url = localCoverPath(book.title)
      book.hasCover = url ? await probeLocalCover(url) : false
    }),
  )
  books.sort((a, b) => {
    if (a.hasCover !== b.hasCover) return a.hasCover ? -1 : 1
    return (b.downloadCount || 0) - (a.downloadCount || 0)
  })
  return books
}

const formatLifespan = (author) => {
  if (!author) return ''
  const { birth_year: birth, death_year: death } = author
  if (birth == null && death == null) return ''
  return `(${birth ?? '?'} - ${death ?? '?'})`
}

const normalizeBook = (data) => {
  const primary = data.authors?.[0] || null
  return {
    id: data.gutenberg_id,
    title: data.title || 'Untitled',
    authors: data.authors || [],
    authorName: primary?.name || 'Unknown Author',
    authorLifespan: formatLifespan(primary),
    subjects: data.subjects || [],
    bookshelves: data.bookshelves || [],
    languages: data.language ? [data.language] : [],
    downloadCount: data.download_count || 0,
    coverUrl: data.cover_url || null,
    textUrl: null,
    epubUrl: data.epub_url || null,
    htmlUrl: null,
    formats: {},
  }
}

const loadAll = () => {
  if (_allBooks) return Promise.resolve(_allBooks)
  if (_allBooksPromise) return _allBooksPromise
  _allBooksPromise = (async () => {
    const snapshot = await getDocs(
      query(collection(db, COLLECTION), orderBy('download_count', 'desc')),
    )
    const books = snapshot.docs.map((doc) => normalizeBook(doc.data()))
    await annotateAndSort(books)
    _allBooks = books
    return books
  })().catch((err) => {
    _allBooksPromise = null
    throw err
  })
  return _allBooksPromise
}

const matchesQuery = (book, term) => {
  if (book.title.toLowerCase().includes(term)) return true
  for (const author of book.authors) {
    if ((author?.name || '').toLowerCase().includes(term)) return true
  }
  return false
}

/**
 * Search the local Classics catalogue. The catalogue is small enough (~150
 * curated tier-1 works after Phase 1) that we return every match in a single
 * page — the panel renders the full list and the browser lazy-loads cards
 * below the fold. The Gutendex-shaped envelope (count / next / previous) is
 * preserved for backwards compatibility; `next` and `previous` are always
 * null now, which means the Load More button never renders.
 */
export const searchBooks = async ({ search = '' } = {}) => {
  const all = await loadAll()
  const term = (search || '').trim().toLowerCase()
  const filtered = term ? all.filter((book) => matchesQuery(book, term)) : all
  return {
    count: filtered.length,
    next: null,
    previous: null,
    books: filtered,
  }
}

export const getPopularBooks = async () => searchBooks({})

/**
 * Warm the in-memory cache so the Classics panel opens instantly.
 * Safe to call repeatedly — only the first call triggers a Firestore read.
 */
export const prefetchPopularBooks = () => {
  loadAll().catch((err) => {
    console.error('Failed to prefetch Classics catalogue:', err)
  })
}

export const getCachedPopularBooks = async () => searchBooks({})
