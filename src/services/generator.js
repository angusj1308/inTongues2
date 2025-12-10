export const generateStory = async (params) => {
  try {
    const response = await fetch(
      'http://localhost:4000/api/generate',
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
    if (!Array.isArray(data?.pages) || !data.pages.length) {
      throw new Error('No story pages were returned.')
    }

    return {
      pages: data.pages,
      title: data.title,
    }
  } catch (error) {
    throw new Error(error?.message || 'Unable to generate story. Please try again.')
  }
}
