import { resolveSupportedLanguageLabel } from '../constants/languages'
import { rollAuthor } from './Authors'

// ─────────────────────────────────────────────────────────────────────────────
// generateConcept — Call 1: Roll an author from the genre, then ask the API
// to produce a detailed concept as that author.
// Params: { genre, format, timePlaceSetting }
//   genre           — genre id (e.g. 'romance', 'scifi')
//   format          — 'short story' | 'novella' | 'novel'
//   timePlaceSetting — user-entered time & place string
// ─────────────────────────────────────────────────────────────────────────────
export const generateConcept = async ({ genre, format, timePlaceSetting }) => {
  const authorName = rollAuthor(genre)

  try {
    const response = await fetch('http://localhost:4000/api/generate/concept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName, format, timePlaceSetting }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || 'Failed to generate concept.')
    }

    const data = await response.json()

    return {
      concept: data.concept,
      authorName: data.authorName,
      format: data.format,
      timePlaceSetting: data.timePlaceSetting,
    }
  } catch (error) {
    throw new Error(error?.message || 'Unable to generate concept. Please try again.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateFullStory — Call 2: Send the concept from Call 1 to the API and get
// back the complete story text as a single blob.
// Params: { authorName, format, level, language, concept }
// ─────────────────────────────────────────────────────────────────────────────
export const generateFullStory = async ({ authorName, format, level, language, concept }) => {
  try {
    const response = await fetch('http://localhost:4000/api/generate/full-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName, format, level, language, concept }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || 'Failed to generate story.')
    }

    const data = await response.json()
    if (!data?.storyText) {
      throw new Error('No story text was returned.')
    }

    return {
      storyText: data.storyText,
      authorName: data.authorName,
      format: data.format,
    }
  } catch (error) {
    throw new Error(error?.message || 'Unable to generate story. Please try again.')
  }
}

export const generateStory = async (params) => {
  const language = resolveSupportedLanguageLabel(params?.language)
  try {
    const response = await fetch(
      'http://localhost:4000/api/generate',
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...params, language, voiceGender: params?.voiceGender }),
      }
    )

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      const message = errorPayload?.error || 'Failed to generate story.'
      throw new Error(message)
    }

    const data = await response.json()
    if (!Array.isArray(data?.pages) || !data.pages.length) {
      throw new Error('No story pages were returned.')
    }

    // voiceId and voiceGender are only required when audio generation is requested
    if (params?.generateAudio) {
      if (!data?.voiceId) {
        throw new Error('No voiceId was returned for this story.')
      }

      if (!data?.voiceGender) {
        throw new Error('No voice gender was returned for this story.')
      }
    }

    return {
      pages: data.pages,
      title: data.title,
      voiceId: data.voiceId || null,
      voiceGender: data.voiceGender || null,
    }
  } catch (error) {
    throw new Error(error?.message || 'Unable to generate story. Please try again.')
  }
}
