const API_BASE = 'http://localhost:4000'

export const searchYouTube = async ({ query, language, max } = {}) => {
  if (!query?.trim()) return []
  const params = new URLSearchParams({ q: query.trim() })
  if (language) params.set('lang', language)
  if (max) params.set('max', String(max))
  const res = await fetch(`${API_BASE}/api/youtube/search?${params.toString()}`)
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`)
  const data = await res.json()
  return Array.isArray(data?.results) ? data.results : []
}
