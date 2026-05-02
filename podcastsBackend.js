// Podcast search and resolution backend.
//
// Architecture: iTunes Search API for catalogue + rss-parser for episode feeds.
//
// iTunes Search is keyless and free, has comprehensive Spanish-language
// coverage, and returns the RSS feed URL directly on every show result. That
// eliminates the previous Spotify-then-iTunes resolution step.

import Parser from 'rss-parser'

const DEFAULT_COUNTRY = 'MX'

const LANGUAGE_TO_COUNTRY = {
  es: 'MX',
  fr: 'FR',
  it: 'IT',
  de: 'DE',
  pt: 'BR',
  en: 'US',
}

export const countryForLanguage = (language) => {
  const code = String(language || '').toLowerCase().slice(0, 2)
  return LANGUAGE_TO_COUNTRY[code] || DEFAULT_COUNTRY
}

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

// --- iTunes ID validation --------------------------------------------------

// iTunes collectionIds are positive integers, typically 9-12 digits.
const ITUNES_ID_PATTERN = /^[0-9]{6,15}$/

export class InvalidItunesIdError extends Error {
  constructor(id) {
    super(`Invalid iTunes collection ID: ${String(id).slice(0, 60)}`)
    this.code = 'INVALID_ITUNES_ID'
    this.status = 400
  }
}

export const isValidItunesId = (id) => ITUNES_ID_PATTERN.test(String(id || ''))

// --- iTunes API ------------------------------------------------------------

const ITUNES_BASE = 'https://itunes.apple.com'

const itunesFetch = async (path, params = {}) => {
  const url = new URL(`${ITUNES_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  })
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`iTunes ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// --- Sanitisers ------------------------------------------------------------

const pickShowImage = (raw) =>
  raw?.artworkUrl600 || raw?.artworkUrl100 || raw?.artworkUrl60 || ''

const sanitizeItunesShow = (raw, { description = '' } = {}) => {
  if (!raw) return null
  return {
    itunesCollectionId: String(raw.collectionId || raw.trackId || ''),
    title: raw.collectionName || raw.trackName || '',
    author: raw.artistName || '',
    description,
    coverArtUrl: pickShowImage(raw),
    categories: [raw.primaryGenreName, ...(raw.genres || [])].filter(
      (g, i, arr) => g && arr.indexOf(g) === i,
    ),
    episodeCount: raw.trackCount || 0,
    language: '', // iTunes doesn't return show language directly; filled from RSS where available.
    feedUrl: raw.feedUrl || '',
    type: 'show',
  }
}

const sanitizeItunesEpisode = (raw) => {
  if (!raw) return null
  const releaseTs = raw.releaseDate
    ? Math.floor(new Date(raw.releaseDate).getTime() / 1000)
    : null
  return {
    itunesEpisodeId: String(raw.trackId || ''),
    itunesCollectionId: String(raw.collectionId || ''),
    title: raw.trackName || '',
    showTitle: raw.collectionName || '',
    showPublisher: raw.artistName || '',
    description: raw.description || raw.shortDescription || '',
    coverArtUrl: pickShowImage(raw),
    publishDate: releaseTs,
    duration: typeof raw.trackTimeMillis === 'number' ? Math.round(raw.trackTimeMillis / 1000) : 0,
    audioUrl: raw.episodeUrl || raw.previewUrl || '',
    language: '',
    type: 'episode',
  }
}

// --- Search ----------------------------------------------------------------

export const searchITunesPodcasts = async ({ query, language, country } = {}) => {
  if (!query?.trim()) return []
  const c = country || countryForLanguage(language)

  const [showsResp, episodesResp] = await Promise.all([
    itunesFetch('/search', {
      term: query,
      media: 'podcast',
      entity: 'podcast',
      limit: 25,
      country: c,
    }).catch((err) => {
      console.warn('iTunes show search failed', err.status || '', err.message)
      return null
    }),
    itunesFetch('/search', {
      term: query,
      media: 'podcast',
      entity: 'podcastEpisode',
      limit: 25,
      country: c,
    }).catch((err) => {
      console.warn('iTunes episode search failed', err.status || '', err.message)
      return null
    }),
  ])

  const showResults = (showsResp?.results || [])
    .filter((r) => r.wrapperType === 'track' || r.kind === 'podcast' || r.collectionId)
    .map((r) => sanitizeItunesShow(r))
    .filter(Boolean)

  const episodeResults = (episodesResp?.results || [])
    .filter((r) => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode' || r.trackId)
    .map((r) => sanitizeItunesEpisode(r))
    .filter(Boolean)

  // Preserve API-returned ordering (relevance), interleaving by relative rank.
  const ranked = []
  showResults.forEach((s, i) => ranked.push({ rank: i, sanitized: s }))
  episodeResults.forEach((e, i) => ranked.push({ rank: i, sanitized: e }))
  ranked.sort((a, b) => a.rank - b.rank)
  return ranked.map((r) => r.sanitized)
}

export const lookupItunesShow = async (collectionId) => {
  if (!collectionId) return null
  if (!isValidItunesId(collectionId)) {
    throw new InvalidItunesIdError(collectionId)
  }
  const data = await itunesFetch('/lookup', { id: collectionId, entity: 'podcast' })
  const result = Array.isArray(data?.results)
    ? data.results.find((r) => String(r.collectionId) === String(collectionId)) || data.results[0]
    : null
  return sanitizeItunesShow(result)
}

// --- RSS parsing -----------------------------------------------------------

const rssParser = new Parser({
  customFields: {
    item: [
      ['itunes:duration', 'itunesDuration'],
      ['itunes:image', 'itunesImage'],
      ['itunes:episode', 'itunesEpisodeNumber'],
      ['itunes:season', 'itunesSeason'],
      ['podcast:transcript', 'podcastTranscript', { keepArray: true }],
    ],
    feed: [
      ['itunes:image', 'itunesImage'],
      ['language', 'language'],
      ['itunes:summary', 'itunesSummary'],
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

// Surface the Podcasting 2.0 <podcast:transcript> tag if present so the
// front-end / transcription pipeline can skip Scribe when authors already
// publish a transcript.
const pickTranscriptUrl = (item) => {
  const list = item?.podcastTranscript
  if (!Array.isArray(list) || !list.length) return ''
  // rss-parser exposes the attribute bag at $; common attrs: url, type, language.
  const preferred = list.find((t) => {
    const attrs = t?.$ || t
    const type = (attrs?.type || '').toLowerCase()
    return type.includes('vtt') || type.includes('srt') || type.includes('json')
  })
  const chosen = preferred || list[0]
  const attrs = chosen?.$ || chosen
  return attrs?.url || ''
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
    transcriptUrl: pickTranscriptUrl(item),
    language: (feed?.language || '').toLowerCase().slice(0, 2),
    type: 'episode',
  }
}

export const parseRssFeed = async (feedUrl, { max = 50 } = {}) => {
  if (!feedUrl) return { episodes: [], feedTitle: '', feedDescription: '', feedLanguage: '' }
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
  return {
    episodes,
    feedTitle: feed?.title || '',
    feedDescription: feed?.description || feed?.itunesSummary || '',
    feedLanguage: (feed?.language || '').toLowerCase().slice(0, 2),
  }
}

// --- Migration helper ------------------------------------------------------

// Given a stale Spotify show id with its title/publisher, find the iTunes
// collectionId that best matches. Used by the one-time migration script.
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

export const findItunesShowByTitle = async ({ title, publisher } = {}) => {
  if (!title?.trim()) return null
  const data = await itunesFetch('/search', {
    term: title,
    media: 'podcast',
    entity: 'podcast',
    limit: 5,
  })
  const results = Array.isArray(data?.results) ? data.results : []
  const titleMatches = results.filter((r) =>
    titlesMatch(r.collectionName || r.trackName, title),
  )
  if (!titleMatches.length) return null
  let chosen = null
  if (publisher) {
    chosen = titleMatches.find((r) => publishersMatch(r.artistName, publisher))
  }
  if (!chosen) chosen = titleMatches[0]
  return sanitizeItunesShow(chosen)
}
