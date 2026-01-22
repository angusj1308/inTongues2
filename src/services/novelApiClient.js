// Novel Generator Service
// API client for bible generation and chapter generation

const API_BASE = 'http://localhost:4000'

/**
 * Generate a complete story bible (8-phase pipeline)
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.bookId - Optional existing book ID (placeholder) to update
 * @param {string} params.concept - Story concept/description
 * @param {string} params.level - Language level (Beginner, Intermediate, Native)
 * @param {string} params.lengthPreset - 'novella' (12 chapters) or 'novel' (35 chapters)
 * @param {string} params.language - Target language
 * @param {boolean} params.generateAudio - Whether to generate audio
 * @returns {Promise<Object>} Generated bible and book metadata
 */
export async function generateBible(params) {
  const { uid, bookId, concept, level, lengthPreset, language, generateAudio = false } = params

  const response = await fetch(`${API_BASE}/api/generate/bible`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, bookId, concept, level, lengthPreset, language, generateAudio }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to generate bible')
  }

  return response.json()
}

/**
 * Generate a single chapter
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.bookId - Book ID from generateBible
 * @param {number} params.chapterIndex - 1-based chapter index
 * @returns {Promise<Object>} Generated chapter data
 */
export async function generateChapter(params) {
  const { uid, bookId, chapterIndex } = params

  const response = await fetch(`${API_BASE}/api/generate/chapter/${bookId}/${chapterIndex}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to generate chapter')
  }

  return response.json()
}

/**
 * Get book status and bible
 * @param {string} uid - User ID
 * @param {string} bookId - Book ID
 * @returns {Promise<Object>} Book data including bible and chapter status
 */
export async function getBook(uid, bookId) {
  const response = await fetch(`${API_BASE}/api/generate/book/${bookId}?uid=${uid}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to get book')
  }

  return response.json()
}

/**
 * List all generated books for a user
 * @param {string} uid - User ID
 * @returns {Promise<Object>} List of books
 */
export async function listBooks(uid) {
  const response = await fetch(`${API_BASE}/api/generate/books?uid=${uid}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to list books')
  }

  return response.json()
}

/**
 * Delete a generated book
 * @param {string} uid - User ID
 * @param {string} bookId - Book ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteBook(uid, bookId) {
  const response = await fetch(`${API_BASE}/api/generate/book/${bookId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to delete book')
  }

  return response.json()
}

/**
 * Generate a random story concept prompt
 * @returns {Promise<string>} Generated story concept
 */
export async function generatePrompt() {
  const response = await fetch(`${API_BASE}/api/generate/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to generate prompt')
  }

  const data = await response.json()
  return data.prompt
}

/**
 * Expand a vague story concept into a detailed one
 * @param {string} concept - The user's vague concept
 * @returns {Promise<string>} Expanded story concept
 */
export async function expandPrompt(concept) {
  const response = await fetch(`${API_BASE}/api/generate/expand-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ concept }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to expand prompt')
  }

  const data = await response.json()
  return data.prompt
}

// Level mapping for display
export const NOVEL_LEVELS = [
  { value: 'Beginner', label: 'Beginner', description: 'Simple vocabulary and short sentences' },
  { value: 'Intermediate', label: 'Intermediate', description: 'Moderate complexity with varied structures' },
  { value: 'Native', label: 'Native', description: 'Natural, fluent language as native speakers use' },
]

// Length presets
export const LENGTH_PRESETS = [
  { value: 'novella', label: 'Novella', chapters: 12, description: '~12 chapters, shorter story arc' },
  { value: 'novel', label: 'Novel', chapters: 35, description: '~35 chapters, full story arc' },
]
