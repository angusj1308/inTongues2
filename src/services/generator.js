import { resolveSupportedLanguageLabel } from '../constants/languages'

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
