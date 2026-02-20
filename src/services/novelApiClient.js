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
 * Regenerate specific phases for an existing book
 * Uses existing Phase 1-7 data and regenerates Phases 8 & 9 by default
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.bookId - Book ID to regenerate
 * @param {number[]} params.phases - Which phases to regenerate (default [6])
 * @returns {Promise<Object>} Updated bible with regenerated phases
 */
export async function regeneratePhases(params) {
  const { uid, bookId, phases = [6] } = params

  const response = await fetch(`${API_BASE}/api/generate/regenerate-phases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, bookId, phases }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to regenerate phases')
  }

  return response.json()
}

/**
 * Execute a single phase for a book
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.bookId - Book ID
 * @param {number} params.phase - Phase number to execute (1-9)
 * @returns {Promise<Object>} Phase execution result
 */
export async function executePhase(params) {
  const { uid, bookId, phase } = params

  const response = await fetch(`${API_BASE}/api/generate/execute-phase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, bookId, phase }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `Failed to execute phase ${phase}`)
  }

  return response.json()
}

/**
 * Execute next (or specific) prose scene generation
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.bookId - Book ID
 * @param {number} [params.sceneIndex] - Optional specific scene index (0-based). If omitted, generates next scene.
 * @returns {Promise<Object>} Scene generation result
 */
export async function executeScene(params) {
  const { uid, bookId, sceneIndex } = params

  const response = await fetch(`${API_BASE}/api/generate/execute-scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, bookId, sceneIndex }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to generate scene')
  }

  return response.json()
}

/**
 * Reset generation to start fresh from Phase 1
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.bookId - Book ID
 * @returns {Promise<Object>} Reset result
 */
export async function resetGeneration(params) {
  const { uid, bookId } = params

  const response = await fetch(`${API_BASE}/api/generate/reset-generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, bookId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to reset generation')
  }

  return response.json()
}

/**
 * Cancel a stuck generation — resets status to phase_complete, preserving progress
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.bookId - Book ID
 * @returns {Promise<Object>} Cancel result
 */
export async function cancelGeneration(params) {
  const { uid, bookId } = params

  const response = await fetch(`${API_BASE}/api/generate/reset-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, bookId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to cancel generation')
  }

  return response.json()
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
