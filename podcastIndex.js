// Podcast Index API helper — generates the four required headers per request
// and provides a tiny in-memory TTL cache for the wrapping endpoints.
//
// Env: PODCAST_INDEX_API_KEY, PODCAST_INDEX_API_SECRET
// Docs: https://podcastindex-org.github.io/docs-api/

import crypto from 'crypto'

const BASE_URL = 'https://api.podcastindex.org/api/1.0'
const USER_AGENT = 'inTongues/1.0'

const buildHeaders = () => {
  const apiKey = process.env.PODCAST_INDEX_API_KEY
  const apiSecret = process.env.PODCAST_INDEX_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('Podcast Index API credentials are not configured.')
  }
  const authDate = Math.floor(Date.now() / 1000).toString()
  const authorization = crypto
    .createHash('sha1')
    .update(apiKey + apiSecret + authDate)
    .digest('hex')
  return {
    'User-Agent': USER_AGENT,
    'X-Auth-Date': authDate,
    'X-Auth-Key': apiKey,
    Authorization: authorization,
  }
}

export const podcastIndexFetch = async (path, params = {}) => {
  const url = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  })
  const res = await fetch(url, { headers: buildHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`Podcast Index ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Tiny TTL cache. value: { expiresAt, data }. Cap to avoid unbounded growth.
const MAX_CACHE_ENTRIES = 500
const cache = new Map()

const evictIfFull = () => {
  if (cache.size < MAX_CACHE_ENTRIES) return
  const overflow = cache.size - MAX_CACHE_ENTRIES + 1
  let i = 0
  for (const key of cache.keys()) {
    if (i++ >= overflow) break
    cache.delete(key)
  }
}

export const cached = async (key, ttlSeconds, fn) => {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return hit.data
  const data = await fn()
  evictIfFull()
  cache.set(key, { expiresAt: now + ttlSeconds * 1000, data })
  return data
}

export const cacheKey = (parts) => parts.map((p) => String(p ?? '')).join('|')
