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

let _allBooks = null
let _allBooksPromise = null

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
