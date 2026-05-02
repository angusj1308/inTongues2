// Podcast search and resolution backend.
//
// Architecture:
//   1. Spotify Web API for search (best Spanish-language coverage).
//   2. iTunes Search API to resolve an RSS feed URL from the Spotify show
//      (Apple has the most complete RSS coverage).
//   3. rss-parser to read the public feed and extract MP3 enclosure URLs
//      that the audio pipeline will eventually transcribe.
//
// Spotify auth here uses the client-credentials flow (no user required) so
// public podcast search works regardless of whether the visitor has linked
// their Spotify account.

import crypto from 'crypto'
import Parser from 'rss-parser'

const DEFAULT_MARKET = 'MX' // Spanish-speaking market with broad Latin American + EU Spanish coverage.

// --- Tiny TTL cache --------------------------------------------------------

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

// --- Spotify app token (client_credentials) --------------------------------

let appTokenCache = { token: '', expiresAt: 0 }

const getSpotifyAppToken = async () => {
  const now = Date.now()
  if (appTokenCache.token && appTokenCache.expiresAt - 60_000 > now) {
    return appTokenCache.token
  }
  // Read env at call time: this module is imported before dotenv.config()
  // runs in server.js, so capturing these at module scope yields undefined.
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not configured.')
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Spotify token failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = await res.json()
  appTokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in || 3600) * 1000,
  }
  return appTokenCache.token
}

const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/

export class InvalidSpotifyIdError extends Error {
  constructor(id) {
    super(`Invalid Spotify ID: ${String(id).slice(0, 60)}`)
    this.code = 'INVALID_SPOTIFY_ID'
    this.status = 400
  }
}

const spotifyApiFetch = async (path, params = {}) => {
  const token = await getSpotifyAppToken()
  const url = new URL(`https://api.spotify.com/v1${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v == null || v === '') return
    let value = v
    // Spotify accepts limit between 1 and 50 on /search and most list endpoints.
    // Clamp defensively so a stray value can't trigger 400 "Invalid limit".
    if (k === 'limit') {
      const n = Number.parseInt(String(v), 10)
      if (Number.isNaN(n)) return
      value = String(Math.max(1, Math.min(50, n)))
    }
    url.searchParams.set(k, String(value))
  })
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`Spotify ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// --- Sanitisers ------------------------------------------------------------

const pickShowImage = (show) => show?.images?.[0]?.url || ''

const sanitizeSpotifyShow = (show) => {
  if (!show) return null
  return {
    spotifyShowId: show.id,
    title: show.name || '',
    author: show.publisher || '',
    description: show.description || '',
    coverArtUrl: pickShowImage(show),
    categories: [], // Spotify doesn't expose category on the show object publicly.
    episodeCount: show.total_episodes || 0,
    language: Array.isArray(show.languages) ? (show.languages[0] || '').toLowerCase().slice(0, 2) : '',
    type: 'show',
  }
}

const sanitizeSpotifyEpisode = (ep, parentShow) => {
  if (!ep) return null
  const show = ep.show || parentShow || null
  const language = (() => {
    if (Array.isArray(ep.languages) && ep.languages.length) return ep.languages[0]
    if (ep.language) return ep.language
    if (Array.isArray(show?.languages) && show.languages.length) return show.languages[0]
    return ''
  })()
  return {
    spotifyEpisodeId: ep.id,
    spotifyShowId: show?.id || null,
    title: ep.name || '',
    showTitle: show?.name || '',
    showPublisher: show?.publisher || '',
    description: ep.description || '',
    coverArtUrl: ep.images?.[0]?.url || pickShowImage(show),
    publishDate: ep.release_date ? Math.floor(new Date(ep.release_date).getTime() / 1000) : null,
    duration: typeof ep.duration_ms === 'number' ? Math.round(ep.duration_ms / 1000) : 0,
    language: (language || '').toLowerCase().slice(0, 2),
    type: 'episode',
  }
}

// --- Search ----------------------------------------------------------------

export const searchSpotifyPodcasts = async ({ query, language, market = DEFAULT_MARKET } = {}) => {
  if (!query?.trim()) return []
  const data = await spotifyApiFetch('/search', {
    q: query,
    type: 'show,episode',
    market,
    limit: 20,
  })

  const targetLang = (language || '').toLowerCase().slice(0, 2)

  const showItems = (data?.shows?.items || []).filter(Boolean)
  const filteredShows = targetLang
    ? showItems.filter((s) => {
        const langs = (s.languages || []).map((l) => l.toLowerCase().slice(0, 2))
        return langs.length === 0 || langs.includes(targetLang)
      })
    : showItems

  const episodeItems = (data?.episodes?.items || []).filter(Boolean)
  const filteredEpisodes = targetLang
    ? episodeItems.filter((e) => {
        const langs = (e.languages || []).map((l) => l.toLowerCase().slice(0, 2))
        if (langs.length === 0 && e.language) langs.push(e.language.toLowerCase().slice(0, 2))
        return langs.length === 0 || langs.includes(targetLang)
      })
    : episodeItems

  // Preserve Spotify's relevance order: shows first then episodes, both in
  // their returned order. Use index-based rank to interleave by relative rank.
  const ranked = []
  filteredShows.forEach((s, i) => ranked.push({ rank: i, sanitized: sanitizeSpotifyShow(s) }))
  filteredEpisodes.forEach((e, i) => ranked.push({ rank: i, sanitized: sanitizeSpotifyEpisode(e) }))
  ranked.sort((a, b) => a.rank - b.rank)
  return ranked.map((r) => r.sanitized).filter(Boolean)
}

export const fetchSpotifyShow = async (spotifyShowId, { market = DEFAULT_MARKET } = {}) => {
  if (!spotifyShowId) return null
  // Reject anything that isn't a Spotify base62 ID (22 alphanumeric chars).
  // Stale follows from the prior Podcast Index integration carry numeric feed
  // IDs; routing to those would otherwise hit "Invalid base62 id" from Spotify.
  if (!SPOTIFY_ID_PATTERN.test(String(spotifyShowId))) {
    throw new InvalidSpotifyIdError(spotifyShowId)
  }
  const data = await spotifyApiFetch(`/shows/${encodeURIComponent(spotifyShowId)}`, { market })
  return sanitizeSpotifyShow(data)
}

// --- iTunes RSS resolution -------------------------------------------------

const stripDiacritics = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const stripLeadingArticle = (s) =>
  String(s || '').replace(/^\s*(the|el|la|los|las|le|les|il)\s+/i, '')

const normalizeForMatch = (s) =>
  stripDiacritics(stripLeadingArticle(s))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()

const titlesMatch = (a, b) => {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.includes(nb) || nb.includes(na)
}

const publishersMatch = (a, b) => {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.includes(nb) || nb.includes(na)
}

// resolveRssFeed: Spotify show -> { feedUrl, itunesId } | null
// Cached indefinitely (effectively long TTL) — RSS feeds rarely change provider.
const RESOLVE_TTL = 60 * 60 * 24 * 30 // 30 days

export const resolveRssFeed = async ({ spotifyShowId, title, publisher } = {}) => {
  if (!title?.trim()) return null
  const tag = cacheKey(['rss-resolve', spotifyShowId || '', title.toLowerCase().slice(0, 60)])
  return cached(tag, RESOLVE_TTL, async () => {
    const url = new URL('https://itunes.apple.com/search')
    url.searchParams.set('term', title)
    url.searchParams.set('media', 'podcast')
    url.searchParams.set('limit', '5')
    let resp
    try {
      resp = await fetch(url)
    } catch (err) {
      console.warn('iTunes search request failed', err.message)
      return null
    }
    if (!resp.ok) return null
    const json = await resp.json().catch(() => null)
    const results = Array.isArray(json?.results) ? json.results : []
    if (!results.length) return null

    const titleMatches = results.filter((r) =>
      titlesMatch(r.collectionName || r.trackName, title),
    )
    if (!titleMatches.length) return null

    let chosen = null
    if (publisher) {
      chosen = titleMatches.find((r) => publishersMatch(r.artistName, publisher))
    }
    // If publisher missing or no match, accept top title-matched result whose
    // artist is at least non-empty — otherwise we have no signal of authenticity.
    if (!chosen) {
      const topByTitle = titleMatches[0]
      // No publisher available to verify against — accept only if iTunes provides
      // an artistName at all (Apple normally does for legitimate feeds).
      if (!publisher && topByTitle.artistName) chosen = topByTitle
    }
    if (!chosen?.feedUrl) return null
    return { feedUrl: chosen.feedUrl, itunesId: chosen.collectionId || null }
  })
}

// --- RSS parsing -----------------------------------------------------------

const rssParser = new Parser({
  customFields: {
    item: [
      ['itunes:duration', 'itunesDuration'],
      ['itunes:image', 'itunesImage'],
      ['itunes:episode', 'itunesEpisodeNumber'],
      ['itunes:season', 'itunesSeason'],
    ],
    feed: [
      ['itunes:image', 'itunesImage'],
      ['language', 'language'],
    ],
  },
})

const parseItunesDuration = (raw) => {
  if (!raw && raw !== 0) return 0
  if (typeof raw === 'number') return Math.round(raw)
  const s = String(raw).trim()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const parts = s.split(':').map((p) => parseInt(p, 10) || 0)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

const pickItemImage = (item, feed) => {
  if (item.itunesImage?.href) return item.itunesImage.href
  if (item.itunesImage && typeof item.itunesImage === 'object' && item.itunesImage.$?.href) {
    return item.itunesImage.$.href
  }
  if (feed?.itunesImage?.href) return feed.itunesImage.href
  if (feed?.image?.url) return feed.image.url
  return ''
}

const sanitizeRssEpisode = (item, feed) => {
  if (!item) return null
  const publishDate = item.isoDate
    ? Math.floor(new Date(item.isoDate).getTime() / 1000)
    : item.pubDate
      ? Math.floor(new Date(item.pubDate).getTime() / 1000)
      : null
  const audioUrl =
    (item.enclosure && item.enclosure.url) ||
    (Array.isArray(item.enclosures) ? item.enclosures[0]?.url : '') ||
    ''
  return {
    episodeId: item.guid || item.link || `${publishDate || Math.random()}-${item.title}`,
    title: item.title || '',
    showTitle: feed?.title || '',
    description: item.contentSnippet || item.content || item.summary || '',
    coverArtUrl: pickItemImage(item, feed),
    publishDate,
    duration: parseItunesDuration(item.itunesDuration),
    audioUrl,
    language: (feed?.language || '').toLowerCase().slice(0, 2),
    type: 'episode',
  }
}

export const parseRssFeed = async (feedUrl, { max = 50 } = {}) => {
  if (!feedUrl) return { episodes: [] }
  let feed
  try {
    feed = await rssParser.parseURL(feedUrl)
  } catch (err) {
    console.warn('RSS parse failed', feedUrl, err.message)
    return { episodes: [], parseError: true }
  }
  const items = Array.isArray(feed?.items) ? feed.items : []
  const episodes = items
    .map((item) => {
      try {
        return sanitizeRssEpisode(item, feed)
      } catch (err) {
        console.warn('Skipping malformed RSS item', err.message)
        return null
      }
    })
    .filter((ep) => ep && ep.audioUrl)
    .slice(0, max)
  return { episodes }
}
