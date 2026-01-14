/**
 * Gutenberg API Service
 * Uses Gutendex API (https://gutendex.com/) to search and fetch book metadata
 * from Project Gutenberg's collection of public domain classics.
 */

const GUTENDEX_BASE_URL = 'https://gutendex.com'

/**
 * Search for books in the Gutenberg library
 * @param {Object} params - Search parameters
 * @param {string} params.search - Search query (title, author, subject)
 * @param {string} params.topic - Filter by topic/subject
 * @param {string} params.languages - Filter by language code (e.g., 'en', 'es', 'fr')
 * @param {number} params.page - Page number for pagination
 * @returns {Promise<Object>} Search results with books array and pagination info
 */
export const searchBooks = async ({ search = '', topic = '', languages = '', page = 1 }) => {
  const params = new URLSearchParams()

  if (search) params.append('search', search)
  if (topic) params.append('topic', topic)
  if (languages) params.append('languages', languages)
  if (page > 1) params.append('page', page.toString())

  const url = `${GUTENDEX_BASE_URL}/books?${params.toString()}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Gutenberg API error: ${response.status}`)
  }

  const data = await response.json()

  return {
    count: data.count,
    next: data.next,
    previous: data.previous,
    books: data.results.map(normalizeBook),
  }
}

/**
 * Get a single book by its Gutenberg ID
 * @param {number} id - Gutenberg book ID
 * @returns {Promise<Object>} Book metadata
 */
export const getBookById = async (id) => {
  const url = `${GUTENDEX_BASE_URL}/books/${id}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Gutenberg API error: ${response.status}`)
  }

  const data = await response.json()
  return normalizeBook(data)
}

/**
 * Normalize book data from Gutendex API response
 * @param {Object} book - Raw book data from API
 * @returns {Object} Normalized book object
 */
const normalizeBook = (book) => {
  // Get the best available cover image
  const coverUrl = book.formats?.['image/jpeg'] || null

  // Get plain text download URL (preferred for adaptation)
  const textUrl =
    book.formats?.['text/plain; charset=utf-8'] ||
    book.formats?.['text/plain; charset=us-ascii'] ||
    book.formats?.['text/plain'] ||
    null

  // Get epub download URL
  const epubUrl =
    book.formats?.['application/epub+zip'] ||
    null

  // Get HTML URL for reading online
  const htmlUrl =
    book.formats?.['text/html; charset=utf-8'] ||
    book.formats?.['text/html'] ||
    null

  // Extract primary author
  const primaryAuthor = book.authors?.[0] || null
  const authorName = primaryAuthor?.name || 'Unknown Author'
  const authorBirthYear = primaryAuthor?.birth_year
  const authorDeathYear = primaryAuthor?.death_year

  // Format author lifespan
  let authorLifespan = ''
  if (authorBirthYear || authorDeathYear) {
    authorLifespan = `(${authorBirthYear || '?'} - ${authorDeathYear || '?'})`
  }

  return {
    id: book.id,
    title: book.title || 'Untitled',
    authors: book.authors || [],
    authorName,
    authorLifespan,
    subjects: book.subjects || [],
    bookshelves: book.bookshelves || [],
    languages: book.languages || [],
    downloadCount: book.download_count || 0,
    coverUrl,
    textUrl,
    epubUrl,
    htmlUrl,
    formats: book.formats || {},
  }
}

/**
 * Download book content as plain text
 * @param {string} textUrl - URL to the plain text file
 * @returns {Promise<string>} Book content as text
 */
export const downloadBookText = async (textUrl) => {
  if (!textUrl) {
    throw new Error('No text URL available for this book')
  }

  const response = await fetch(textUrl)
  if (!response.ok) {
    throw new Error(`Failed to download book: ${response.status}`)
  }

  return response.text()
}

/**
 * Get popular/trending books (books with high download counts)
 * @param {number} page - Page number
 * @returns {Promise<Object>} Popular books
 */
export const getPopularBooks = async (page = 1) => {
  return searchBooks({ page })
}

/**
 * Map language names to Gutenberg language codes
 */
export const LANGUAGE_CODES = {
  English: 'en',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Dutch: 'nl',
  Finnish: 'fi',
  Chinese: 'zh',
  Japanese: 'ja',
}

/**
 * Get language code from language name
 * @param {string} languageName - Full language name
 * @returns {string} Two-letter language code
 */
export const getLanguageCode = (languageName) => {
  return LANGUAGE_CODES[languageName] || ''
}
