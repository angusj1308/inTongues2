const API_BASE = 'http://localhost:4000'

export const searchYouTube = async ({ query, language, max } = {}) => {
  if (!query?.trim()) return { results: [], creditsPerMinute: 0 }
  const params = new URLSearchParams({ q: query.trim() })
  if (language) params.set('lang', language)
  if (max) params.set('max', String(max))
  const res = await fetch(`${API_BASE}/api/youtube/search?${params.toString()}`)
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`)
  const data = await res.json()
  return {
    results: Array.isArray(data?.results) ? data.results : [],
    creditsPerMinute: Number(data?.creditsPerMinute) || 0,
  }
}

const importEndpoint = `${API_BASE}/api/youtube/import`
const dubEndpoint = `${API_BASE}/api/youtube/dub`

export const importYoutubeVideo = async ({ title, youtubeUrl, uid, language }) => {
  const res = await fetch(importEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, youtubeUrl, uid, language }),
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `Import failed (${res.status})`))
  return res.json()
}

export const dubYoutubeVideo = async ({ title, youtubeUrl, uid, sourceLanguage, targetLanguage }) => {
  const res = await fetch(dubEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, youtubeUrl, uid, sourceLanguage, targetLanguage }),
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `Dub failed (${res.status})`))
  return res.json()
}
