export const generateStory = async (params) => {
  try {
    const response = await fetch(
      'http://127.0.0.1:5001/intongues2/us-central1/generateStory/api/generate',
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      }
    )

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      const message = errorPayload?.error || 'Failed to generate story.'
      throw new Error(message)
    }

    const data = await response.json()
    if (!data?.content) {
      throw new Error('No story content was returned.')
    }

    return data.content
  } catch (error) {
    throw new Error(error?.message || 'Unable to generate story. Please try again.')
  }
}
