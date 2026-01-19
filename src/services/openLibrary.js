/**
 * Open Library API Service
 * Uses Open Library's Search API and Covers API to search for books
 * and fetch cover images for imported texts.
 *
 * API Documentation:
 * - Search: https://openlibrary.org/dev/docs/api/search
 * - Covers: https://openlibrary.org/dev/docs/api/covers
 */

const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json'
const OPEN_LIBRARY_COVERS_URL = 'https://covers.openlibrary.org/b'

/**
 * Search for books by title and/or author
 * @param {Object} params - Search parameters
 * @param {string} params.title - Book title to search for
 * @param {string} params.author - Author name to search for
 * @param {number} params.limit - Maximum number of results (default: 5)
 * @returns {Promise<Object[]>} Array of normalized book results
 */
export const searchBooks = async ({ title = '', author = '', limit = 5 }) => {
  const params = new URLSearchParams()

  // Build search query - combine title and author for better results
  if (title && author) {
    params.append('title', title)
    params.append('author', author)
  } else if (title) {
    params.append('title', title)
  } else if (author) {
    params.append('author', author)
  } else {
    return []
  }

  params.append('limit', limit.toString())
  // Request only the fields we need for efficiency
  params.append('fields', 'key,title,author_name,first_publish_year,cover_i,isbn,edition_key')

  const url = `${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`Open Library API error: ${response.status}`)
      return []
    }

    const data = await response.json()
    return (data.docs || []).map(normalizeBook)
  } catch (error) {
    console.error('Open Library search failed:', error)
    return []
  }
}

/**
 * Search for a book and return the best matching cover URL
 * @param {string} title - Book title
 * @param {string} author - Author name
 * @param {string} size - Cover size: 'S' (small), 'M' (medium), 'L' (large)
 * @returns {Promise<string|null>} Cover image URL or null if not found
 */
export const searchForCover = async (title, author, size = 'L') => {
  if (!title && !author) {
    return null
  }

  const books = await searchBooks({ title, author, limit: 3 })

  // Find the first book with a cover
  for (const book of books) {
    if (book.coverId) {
      return getCoverUrl(book.coverId, size)
    }
  }

  return null
}

/**
 * Get cover URL by Open Library cover ID
 * @param {number} coverId - Open Library cover ID (cover_i field)
 * @param {string} size - Cover size: 'S' (small), 'M' (medium), 'L' (large)
 * @returns {string} Cover image URL
 */
export const getCoverUrl = (coverId, size = 'L') => {
  if (!coverId) return null
  // Valid sizes: S, M, L
  const validSize = ['S', 'M', 'L'].includes(size) ? size : 'L'
  return `${OPEN_LIBRARY_COVERS_URL}/id/${coverId}-${validSize}.jpg`
}

/**
 * Get cover URL by ISBN
 * @param {string} isbn - ISBN-10 or ISBN-13
 * @param {string} size - Cover size: 'S' (small), 'M' (medium), 'L' (large)
 * @returns {string} Cover image URL
 */
export const getCoverUrlByIsbn = (isbn, size = 'L') => {
  if (!isbn) return null
  const validSize = ['S', 'M', 'L'].includes(size) ? size : 'L'
  return `${OPEN_LIBRARY_COVERS_URL}/isbn/${isbn}-${validSize}.jpg`
}

/**
 * Get cover URL by Open Library ID (OLID)
 * @param {string} olid - Open Library ID (e.g., OL7353617M)
 * @param {string} size - Cover size: 'S' (small), 'M' (medium), 'L' (large)
 * @returns {string} Cover image URL
 */
export const getCoverUrlByOlid = (olid, size = 'L') => {
  if (!olid) return null
  const validSize = ['S', 'M', 'L'].includes(size) ? size : 'L'
  return `${OPEN_LIBRARY_COVERS_URL}/olid/${olid}-${validSize}.jpg`
}

/**
 * Normalize book data from Open Library API response
 * @param {Object} book - Raw book data from API
 * @returns {Object} Normalized book object
 */
const normalizeBook = (book) => {
  return {
    key: book.key,
    title: book.title || 'Untitled',
    authors: book.author_name || [],
    authorName: book.author_name?.[0] || 'Unknown Author',
    firstPublishYear: book.first_publish_year || null,
    coverId: book.cover_i || null,
    coverUrl: book.cover_i ? getCoverUrl(book.cover_i, 'L') : null,
    isbn: book.isbn?.[0] || null,
    editionKey: book.edition_key?.[0] || null,
  }
}

/**
 * Verify if a cover URL actually returns an image
 * Open Library returns a blank 1x1 pixel image if cover doesn't exist
 * @param {string} coverUrl - Cover URL to verify
 * @returns {Promise<boolean>} True if cover exists and is valid
 */
export const verifyCoverExists = async (coverUrl) => {
  if (!coverUrl) return false

  try {
    // Add ?default=false to get 404 instead of blank image
    const testUrl = coverUrl.includes('?')
      ? `${coverUrl}&default=false`
      : `${coverUrl}?default=false`

    const response = await fetch(testUrl, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

export default {
  searchBooks,
  searchForCover,
  getCoverUrl,
  getCoverUrlByIsbn,
  getCoverUrlByOlid,
  verifyCoverExists,
}
