import { resolveSupportedLanguageLabel } from '../constants/languages'
import { rollAuthor, rollNovelAuthor } from './Authors'

// ─────────────────────────────────────────────────────────────────────────────
// generateConcept — Call 1: Roll an author from the genre, then ask the API
// to produce a detailed concept as that author.
// Params: { genre, format, timePlaceSetting }
//   genre           — genre id (e.g. 'romance', 'scifi')
//   format          — 'short story' | 'novella' | 'novel'
//   timePlaceSetting — user-entered time & place string
// ─────────────────────────────────────────────────────────────────────────────
export const generateConcept = async ({ genre, format, timePlaceSetting }) => {
  const isNovel = format === 'novel' || format === 'novella'
  const authorName = isNovel ? rollNovelAuthor(genre) : rollAuthor(genre)

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
      title: data.title,
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

// ─────────────────────────────────────────────────────────────────────────────
// Novel Pipeline — Call 1: Roll a novel author and generate a concept.
// Same shape as generateConcept but hits the novel-specific endpoint which
// strips conversational preamble and uses streaming.
// ─────────────────────────────────────────────────────────────────────────────
export const generateNovelConcept = async ({ genre, format, timePlaceSetting }) => {
  const authorName = rollNovelAuthor(genre)

  try {
    const response = await fetch('http://localhost:4000/api/generate/novel/concept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName, format, timePlaceSetting }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || 'Failed to generate novel concept.')
    }

    const data = await response.json()

    return {
      concept: data.concept,
      title: data.title,
      authorName: data.authorName,
      format: data.format,
      timePlaceSetting: data.timePlaceSetting,
    }
  } catch (error) {
    throw new Error(error?.message || 'Unable to generate novel concept. Please try again.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Novel Pipeline — Call 2: Generate chapter-by-chapter summaries.
// Takes the concept from Call 1 and returns a detailed chapter outline.
// ─────────────────────────────────────────────────────────────────────────────
export const generateChapterSummaries = async ({ authorName, format, language, concept }) => {
  try {
    const response = await fetch('http://localhost:4000/api/generate/novel/chapter-summaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName, format, language, concept }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || 'Failed to generate chapter summaries.')
    }

    const data = await response.json()
    if (!data?.chapterSummaries) {
      throw new Error('No chapter summaries were returned.')
    }

    return {
      chapterSummaries: data.chapterSummaries,
      authorName: data.authorName,
      format: data.format,
    }
  } catch (error) {
    throw new Error(error?.message || 'Unable to generate chapter summaries. Please try again.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Novel Pipeline — Call 3: Write a single chapter.
// ─────────────────────────────────────────────────────────────────────────────
export const generateNovelChapter = async ({ authorName, language, chapterNumber, chapterTitle, concept, chapterSummaries, previousProse }) => {
  try {
    const response = await fetch('http://localhost:4000/api/generate/novel/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName, language, chapterNumber, chapterTitle, concept, chapterSummaries, previousProse }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || `Failed to generate Chapter ${chapterNumber}.`)
    }

    const data = await response.json()
    if (!data?.chapterText) {
      throw new Error(`No prose was returned for Chapter ${chapterNumber}.`)
    }

    return {
      chapterNumber: data.chapterNumber,
      chapterTitle: data.chapterTitle,
      chapterText: data.chapterText,
      wordCount: data.wordCount,
    }
  } catch (error) {
    throw new Error(error?.message || `Unable to generate Chapter ${chapterNumber}. Please try again.`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Novel Pipeline — Validate a chapter against previous prose (Sonnet).
// ─────────────────────────────────────────────────────────────────────────────
export const validateNovelChapter = async ({ chapterNumber, chapterText, previousProse }) => {
  try {
    const response = await fetch('http://localhost:4000/api/generate/novel/validate-chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterNumber, chapterText, previousProse }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || 'Failed to validate chapter.')
    }

    const data = await response.json()
    return { valid: data.valid, contradictions: data.contradictions }
  } catch (error) {
    throw new Error(error?.message || 'Unable to validate chapter.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coherence Validation Sweep — validates story text for continuity errors.
// Two modes: { storyText } for short stories, { uid, bookId } for novels.
// ─────────────────────────────────────────────────────────────────────────────
export const validateCoherence = async ({ storyText, uid, bookId }) => {
  try {
    const body = {}
    if (uid && bookId) {
      body.uid = uid
      body.bookId = bookId
    } else if (storyText) {
      body.storyText = storyText
    }

    const response = await fetch('http://localhost:4000/api/generate/validate-coherence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || 'Failed to validate coherence.')
    }

    const data = await response.json()
    return { validationResult: data.validationResult }
  } catch (error) {
    throw new Error(error?.message || 'Unable to validate coherence.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Novel Pipeline — Write all chapters (server-side loop).
// Triggers the server to write every chapter sequentially, storing each in
// Firestore as it completes. Can resume from the last completed chapter.
// ─────────────────────────────────────────────────────────────────────────────
export const writeAllNovelChapters = async ({ uid, bookId }) => {
  try {
    const response = await fetch('http://localhost:4000/api/generate/novel/write-all-chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, bookId }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error || 'Failed to write novel chapters.')
    }

    const data = await response.json()
    return {
      success: data.success,
      bookId: data.bookId,
      totalChapters: data.totalChapters,
      totalWords: data.totalWords,
      chapters: data.chapters,
    }
  } catch (error) {
    throw new Error(error?.message || 'Unable to write novel chapters. Please try again.')
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
