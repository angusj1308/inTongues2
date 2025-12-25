// Environment configuration: set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI
// in your .env file before running the server. Example for local dev:
// SPOTIFY_CLIENT_ID=your_client_id
// SPOTIFY_CLIENT_SECRET=your_client_secret
// SPOTIFY_REDIRECT_URI=http://localhost:4000/api/spotify/callback
import express from 'express'
import dotenv from 'dotenv'
import multer from 'multer'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import pdfParse from 'pdf-parse'
import admin from 'firebase-admin'
import { Readable } from 'stream'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { spawn } from 'child_process'
import { createRequire } from 'module'
import ytdl from 'ytdl-core'
const require = createRequire(import.meta.url)
const { EPub } = require('epub2')
const serviceAccount = require('./serviceAccountKey.json')
dotenv.config()
import OpenAI from 'openai'

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'intongues2.firebasestorage.app',
  })
}

export const bucket = admin.storage().bucket()
const firestore = admin.firestore()

const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
].join(' ')

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:5173'
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY

const LANGUAGE_NAME_TO_CODE = {
  English: 'en',
  French: 'fr',
  Spanish: 'es',
  Italian: 'it',
}

const LANGUAGE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(LANGUAGE_NAME_TO_CODE).map(([label, code]) => [code, label]),
)

const ELEVENLABS_VOICE_MAP = {
  English: {
    male: 'NFG5qt843uXKj4pFvR7C',
    female: 'ZF6FPAbjXT4488VcRRnw',
  },
  Spanish: {
    male: 'kulszILr6ees0ArU8miO',
    female: '1WXz8v08ntDcSTeVXMN2',
  },
  French: {
    male: 'UBXZKOKbt62aLQHhc1Jm',
    female: 'sANWqF1bCMzR6eyZbCGw',
  },
  Italian: {
    male: 'W71zT1VwIFFx3mMGH2uZ',
    female: 'gfKKsLN1k0oYYN9n2dXX',
  },
}

const SUPPORTED_VOICE_GENDERS = new Set(['male', 'female'])

const SUPPORTED_LANGUAGE_CODES = new Set(Object.values(LANGUAGE_NAME_TO_CODE))

function normalizeLanguageLabel(language) {
  const raw = String(language || '').trim()
  if (!raw) return ''

  if (LANGUAGE_NAME_TO_CODE[raw]) return raw

  const lowered = raw.toLowerCase()
  const matchedLabel = Object.keys(LANGUAGE_NAME_TO_CODE).find(
    (label) => label.toLowerCase() === lowered,
  )

  if (matchedLabel) return matchedLabel

  return LANGUAGE_CODE_TO_NAME[lowered] || ''
}

function normalizeBaseLanguageCode(language) {
  const raw = String(language || '').trim()
  if (!raw) return ''

  return raw.toLowerCase()
}

function isValidLanguageCode(language) {
  if (!language || typeof language !== 'string') return false

  return /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(language.trim())
}

function resolveTargetCode(targetLang) {
  if (!targetLang) return 'en'
  if (LANGUAGE_NAME_TO_CODE[targetLang]) return LANGUAGE_NAME_TO_CODE[targetLang]
  if (SUPPORTED_LANGUAGE_CODES.has(targetLang)) return targetLang
  return 'en'
}

function resolveElevenLabsVoiceId(language, voiceGender) {
  const normalizedLanguage = normalizeLanguageLabel(language)
  if (!normalizedLanguage || !ELEVENLABS_VOICE_MAP[normalizedLanguage]) {
    const message = `Unsupported language for voice selection: ${language || 'unknown'}`
    console.error(message)
    throw new Error(message)
  }

  const normalizedGender = String(voiceGender || '').trim().toLowerCase()
  if (!SUPPORTED_VOICE_GENDERS.has(normalizedGender)) {
    const message = `Invalid voice gender selection: ${voiceGender || 'unknown'}`
    console.error(message)
    throw new Error(message)
  }

  const voiceId = ELEVENLABS_VOICE_MAP[normalizedLanguage]?.[normalizedGender]
  if (!voiceId) {
    const message = `Missing ElevenLabs voiceId for ${normalizedLanguage} (${normalizedGender})`
    console.error(message)
    throw new Error(message)
  }

  return { voiceId, voiceGender: normalizedGender, language: normalizedLanguage }
}

function escapeForSsml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const ADAPTATION_SYSTEM_PROMPT = `
You are an expert language educator adapting reading materials for learners.
Always preserve all key events, factual details, character actions, and tone from the source. Do not omit plot points, merge scenes, or summarize; deliver a full, faithful retelling in the requested level and language.

Language output
- Write only in the requested target language.
- Keep proper nouns (people, places, brands) exactly as in the source.
- Use full sentences with natural punctuation. Do not use lists, headings, or bullet points.
- Return only the adapted narrative text—no explanations, notes, or markup.

CEFR adaptation rules
- A1: Extremely simple, short sentences. Split any long sentence into multiple simple ones. Use high-frequency words and very simple verb phrases.
- A2: Simple, direct sentences. Prefer present or simple past. Avoid multi-clause sentences; split long or complex sentences.
- B1: Clear, straightforward prose with some detail. Moderate sentence length. Lightly simplify complex grammar.
- B2: Natural, fluent prose. Keep most descriptive detail. Moderate to longer sentences are acceptable.
- C1/C2: Preserve the original stylistic richness and complexity while remaining readable.

Meaning fidelity
- Include every important action and piece of information. Do not shorten by removing events.
- You may simplify grammar or vocabulary to match the level, but keep the narrative complete.
`

const app = express()
app.use(express.json())

const TTS_SUPPORTS_SSML = process.env.TTS_ALLOW_SSML !== '0'
const TTS_SUPPORTS_LANGUAGE_PARAM = process.env.TTS_ALLOW_LANGUAGE_PARAM !== '0'

const logTtsMethod = (method, lang) => {
  if (process.env.TTS_DEBUG === '1') {
    console.log(`TTS_LANG_LOCK_METHOD=${method} lang=${lang}`)
  }
}

async function requestElevenLabsTts(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY')
  }

  if (!voiceId) {
    throw new Error('Missing ElevenLabs voiceId')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  let response
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
        }),
        signal: controller.signal,
      },
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const trimmedErrorText = errorText ? errorText.slice(0, 400) : ''
    throw new Error(
      `ElevenLabs request failed (${response.status}): ${trimmedErrorText || response.statusText}`,
    )
  }

  return Buffer.from(await response.arrayBuffer())
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir())
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`)
  },
})

const upload = multer({ storage })

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

const getSpotifyTokenRef = (userId) => firestore.collection('spotifyTokens').doc(userId)

const extractYouTubeId = (url) => {
  if (!url) return ''

  try {
    const parsed = new URL(url)

    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.replace('/', '')
    }

    if (parsed.searchParams.get('v')) {
      return parsed.searchParams.get('v')
    }

    const paths = parsed.pathname.split('/')
    const embedIndex = paths.indexOf('embed')
    if (embedIndex !== -1 && paths[embedIndex + 1]) {
      return paths[embedIndex + 1]
    }
  } catch (err) {
    return ''
  }

  return ''
}

const parseIsoDurationToSeconds = (duration) => {
  if (!duration || typeof duration !== 'string') return null
  const match = duration.match(
    /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/,
  )
  if (!match) return null

  const [, days, hours, minutes, seconds] = match.map((value) => Number(value) || 0)
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

const fetchYoutubeMetadata = async (videoId) => {
  if (!videoId) return { channelTitle: null, durationSeconds: null }

  if (!YOUTUBE_API_KEY) {
    console.warn('YOUTUBE_API_KEY is not set; skipping YouTube metadata fetch')
    return { channelTitle: null, durationSeconds: null }
  }

  const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  apiUrl.searchParams.set('part', 'snippet,contentDetails')
  apiUrl.searchParams.set('id', videoId)
  apiUrl.searchParams.set('key', YOUTUBE_API_KEY)

  const response = await fetch(apiUrl.toString())
  if (!response.ok) {
    throw new Error(`YouTube API request failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const item = Array.isArray(data?.items) ? data.items[0] : null

  if (!item) return { channelTitle: null, durationSeconds: null }

  const channelTitle = item?.snippet?.channelTitle || null
  const durationSeconds = parseIsoDurationToSeconds(item?.contentDetails?.duration)

  return { channelTitle, durationSeconds }
}

const decodeState = (state) => {
  try {
    const payload = Buffer.from(state || '', 'base64url').toString('utf8')
    return JSON.parse(payload)
  } catch (err) {
    console.error('Failed to decode Spotify state', err)
    return null
  }
}

const encodeState = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url')

const getSpotifyImage = (images = []) => {
  if (!Array.isArray(images)) return null
  return images[images.length - 1]?.url || images[0]?.url || null
}

async function refreshSpotifyAccessToken(userId) {
  const doc = await getSpotifyTokenRef(userId).get()
  if (!doc.exists) return null

  const data = doc.data() || {}
  const bufferMs = 60_000
  const now = Date.now()

  if (data.accessToken && data.expiresAt && data.expiresAt.toMillis) {
    const expiresAtMs = data.expiresAt.toMillis()
    if (expiresAtMs - bufferMs > now) {
      return data.accessToken
    }
  }

  if (!data.refreshToken) return null

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: data.refreshToken,
  })

  const authHeader = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    console.error('Spotify token refresh failed', response.status, await response.text())
    return null
  }

  const json = await response.json()
  const expiresAt = admin.firestore.Timestamp.fromMillis(now + (json.expires_in || 3600) * 1000)

  await getSpotifyTokenRef(userId).set(
    {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || data.refreshToken,
      expiresAt,
      scopes: data.scopes || SPOTIFY_SCOPES,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return json.access_token
}

async function ensureSpotifyAccessToken(userId) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
    throw new Error('Spotify environment variables are not configured')
  }

  return refreshSpotifyAccessToken(userId)
}

const mapTrackItem = (item) => ({
  spotifyId: item?.track?.id,
  spotifyUri: item?.track?.uri,
  type: 'track',
  title: item?.track?.name,
  subtitle: (item?.track?.artists || []).map((a) => a.name).join(', '),
  imageUrl: getSpotifyImage(item?.track?.album?.images),
  durationMs: item?.track?.duration_ms,
  isrc: item?.track?.external_ids?.isrc || null,
})

const mapPlaylistItem = (item) => ({
  spotifyId: item?.id,
  spotifyUri: item?.uri,
  type: 'playlist',
  title: item?.name,
  subtitle: item?.owner?.display_name || `${item?.tracks?.total || 0} tracks`,
  imageUrl: getSpotifyImage(item?.images),
})

const mapShowItem = (item) => ({
  spotifyId: item?.show?.id,
  spotifyUri: item?.show?.uri,
  type: 'show',
  title: item?.show?.name,
  subtitle: item?.show?.publisher,
  imageUrl: getSpotifyImage(item?.show?.images),
})

const mapSearchTrack = (track) => ({
  spotifyId: track?.id,
  spotifyUri: track?.uri,
  type: 'track',
  title: track?.name,
  subtitle: (track?.artists || []).map((a) => a.name).join(', '),
  imageUrl: getSpotifyImage(track?.album?.images),
  durationMs: track?.duration_ms,
  isrc: track?.external_ids?.isrc || null,
})

const mapSearchPlaylist = (playlist) => ({
  spotifyId: playlist?.id,
  spotifyUri: playlist?.uri,
  type: 'playlist',
  title: playlist?.name,
  subtitle: playlist?.owner?.display_name || `${playlist?.tracks?.total || 0} tracks`,
  imageUrl: getSpotifyImage(playlist?.images),
})

const mapSearchShow = (show) => ({
  spotifyId: show?.id,
  spotifyUri: show?.uri,
  type: 'show',
  title: show?.name,
  subtitle: show?.publisher,
  imageUrl: getSpotifyImage(show?.images),
})

const mapSearchArtist = (artist) => ({
  spotifyId: artist?.id,
  spotifyUri: artist?.uri,
  type: 'artist',
  title: artist?.name,
  subtitle: `${artist?.followers?.total?.toLocaleString?.() || '0'} followers`,
  imageUrl: getSpotifyImage(artist?.images),
})

const mapSearchAlbum = (album) => ({
  spotifyId: album?.id,
  spotifyUri: album?.uri,
  type: 'album',
  title: album?.name,
  subtitle: (album?.artists || []).map((a) => a.name).join(', '),
  imageUrl: getSpotifyImage(album?.images),
})

async function fetchSpotifyTrackIsrc(userId, spotifyId) {
  if (!userId || !spotifyId) return null

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return null

    const response = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(spotifyId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error('Spotify track lookup failed', response.status, await response.text())
      return null
    }

    const data = await response.json()
    return data?.external_ids?.isrc || null
  } catch (error) {
    console.error('Spotify track lookup error', error)
    return null
  }
}

const mapEpisodeItem = (episode) => {
  const minutes = episode?.duration_ms ? Math.round(episode.duration_ms / 60000) : null
  const durationLabel = minutes ? `${minutes} min` : null
  const releaseLabel = episode?.release_date || ''
  const subtitle = [releaseLabel, durationLabel].filter(Boolean).join(' · ')

  return {
    spotifyId: episode?.id,
    spotifyUri: episode?.uri,
    type: 'episode',
    title: episode?.name,
    subtitle,
    imageUrl: getSpotifyImage(episode?.images),
    media_type: episode?.media_type,
    hasVideo: episode?.media_type === 'video',
  }
}

const MUSIXMATCH_BASE_URL = 'https://api.musixmatch.com/ws/1.1'
const MUSIXMATCH_DEBUG = process.env.MUSIXMATCH_DEBUG === 'true'

const logMusixmatchDebug = (...args) => {
  if (!MUSIXMATCH_DEBUG) return
  console.log('[musixmatch]', ...args)
}

const cleanMusixmatchLyrics = (text = '') => {
  if (!text) return ''
  const withoutDisclaimer = text.split('\n\n*******')[0] || text
  return withoutDisclaimer.trim()
}

const chunkLyricsToPages = (lyrics = '', maxLength = 900) => {
  if (!lyrics) return []

  const lines = lyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const pages = []
  let buffer = []

  lines.forEach((line) => {
    const next = [...buffer, line].join('\n')
    if (next.length > maxLength && buffer.length) {
      pages.push(buffer.join('\n'))
      buffer = [line]
    } else {
      buffer = [...buffer, line]
    }
  })

  if (buffer.length) {
    pages.push(buffer.join('\n'))
  }

  return pages
}

async function searchMusixmatchTrackId(trackTitle, artistName) {
  if (!MUSIXMATCH_API_KEY) return null
  const params = new URLSearchParams({
    q_track: trackTitle || '',
    q_artist: artistName || '',
    f_has_lyrics: '1',
    page_size: '1',
    page: '1',
    apikey: MUSIXMATCH_API_KEY,
  })

  const response = await fetch(`${MUSIXMATCH_BASE_URL}/track.search?${params.toString()}`)

  if (!response.ok) {
    console.error('Musixmatch track.search failed', response.status, await response.text())
    return null
  }

  const data = await response.json()
  const trackList = data?.message?.body?.track_list || []
  const firstTrack = trackList[0]?.track

  if (!firstTrack?.track_id) return null
  return {
    trackId: firstTrack.track_id,
    commontrackId: firstTrack.commontrack_id || null,
  }
}

async function fetchMusixmatchLyrics(trackId) {
  if (!MUSIXMATCH_API_KEY || !trackId) return null

  const params = new URLSearchParams({ track_id: String(trackId), apikey: MUSIXMATCH_API_KEY })
  const response = await fetch(`${MUSIXMATCH_BASE_URL}/track.lyrics.get?${params.toString()}`)

  if (!response.ok) {
    console.error('Musixmatch track.lyrics.get failed', response.status, await response.text())
    return null
  }

  const data = await response.json()
  const lyricsBody = data?.message?.body?.lyrics?.lyrics_body
  const language = data?.message?.body?.lyrics?.lyrics_language || null

  if (!lyricsBody) return null

  const cleaned = cleanMusixmatchLyrics(lyricsBody)
  return { lyrics: cleaned, language }
}

const parseRichsyncSegments = (richsyncBody) => {
  if (!richsyncBody) return []

  try {
    const parsed = JSON.parse(richsyncBody)
    if (!Array.isArray(parsed)) return []

    const entries = parsed
      .map((entry) => ({
        start: Number(entry?.ts),
        end: Number(entry?.te),
        text: (entry?.x || '').trim(),
      }))
      .filter((entry) => Number.isFinite(entry.start) && entry.text)
      .sort((a, b) => a.start - b.start)

    if (!entries.length) return []

    return entries.map((entry, index) => {
      const next = entries[index + 1]
      const inferredEnd =
        Number.isFinite(entry.end) && entry.end > entry.start
          ? entry.end
          : next && next.start > entry.start
            ? next.start
            : entry.start

      return {
        start: entry.start,
        end: inferredEnd,
        text: entry.text,
      }
    })
  } catch (error) {
    console.error('Failed to parse Musixmatch richsync body', error)
    return []
  }
}

async function fetchMusixmatchRichsync({ trackId, commontrackId, isrc }) {
  if (!MUSIXMATCH_API_KEY) return null

  const params = new URLSearchParams({ apikey: MUSIXMATCH_API_KEY })

  if (isrc) {
    params.set('track_isrc', isrc)
  } else if (trackId) {
    params.set('track_id', String(trackId))
  } else if (commontrackId) {
    params.set('commontrack_id', String(commontrackId))
  } else {
    return null
  }

  const response = await fetch(`${MUSIXMATCH_BASE_URL}/track.richsync.get?${params.toString()}`)

  if (!response.ok) {
    console.error('Musixmatch track.richsync.get failed', response.status, await response.text())
    return null
  }

  const data = await response.json()
  const richsync = data?.message?.body?.richsync

  if (!richsync || richsync?.restricted || richsync?.instrumental) {
    logMusixmatchDebug('richsync restricted/unavailable', {
      restricted: richsync?.restricted,
      instrumental: richsync?.instrumental,
    })
    return null
  }

  const richsyncBody = richsync?.richsync_body
  const segments = parseRichsyncSegments(richsyncBody)

  if (!segments.length) {
    logMusixmatchDebug('richsync empty', { isrc, trackId, commontrackId })
    return null
  }

  logMusixmatchDebug('richsync parsed', {
    count: segments.length,
    first: segments[0]?.start,
    last: segments[segments.length - 1]?.start,
  })

  return { segments }
}

async function getSpotifyTrackLyrics({ title, subtitle, isrc }) {
  if (!MUSIXMATCH_API_KEY) {
    console.warn('MUSIXMATCH_API_KEY not configured; skipping lyrics fetch')
    return null
  }

  const primaryArtist = subtitle?.split(',')?.[0]?.trim() || ''
  const trackMatch = await searchMusixmatchTrackId(title, primaryArtist)

  const trackId = trackMatch?.trackId || null
  const commontrackId = trackMatch?.commontrackId || null
  if (!trackId && !commontrackId && !isrc) return null

  const [result, richsync] = await Promise.all([
    trackId ? fetchMusixmatchLyrics(trackId) : null,
    fetchMusixmatchRichsync({ trackId, commontrackId, isrc }),
  ])

  const lyricsText = result?.lyrics || ''
  const pages = lyricsText ? chunkLyricsToPages(lyricsText) : []

  if (!lyricsText && !richsync?.segments?.length) return null
  return {
    lyrics: lyricsText,
    pages,
    language: resolveTargetCode(result?.language || 'en'),
    richsyncSegments: richsync?.segments || [],
    provider: 'musixmatch',
  }
}

const normaliseTranscriptSegments = (segments = []) =>
  (Array.isArray(segments) ? segments : [])
    .map((segment) => {
      const start = Number.isFinite(segment.start)
        ? Number(segment.start)
        : Number(segment.startMs) / 1000 || 0
      const end = Number.isFinite(segment.end)
        ? Number(segment.end)
        : Number(segment.endMs) / 1000 || start

      return {
        start,
        end: end > start ? end : start,
        text: (segment.text || '').trim(),
      }
  })
  .filter((segment) => segment.text)

app.get('/api/spotify/status', async (req, res) => {
  const userId = req.query.uid

  if (!userId) return res.status(400).json({ error: 'uid is required' })

  try {
    const tokenDoc = await getSpotifyTokenRef(userId).get()
    const connected = tokenDoc.exists
    res.json({ connected })
  } catch (err) {
    console.error('Spotify status error', err)
    res.status(500).json({ error: 'Unable to check Spotify connection' })
  }
})

app.get('/api/spotify/playerToken', async (req, res) => {
  const userId = req.query.uid

  if (!userId) return res.status(400).json({ error: 'uid is required' })

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    res.json({ accessToken: token })
  } catch (err) {
    console.error('Spotify player token error', err)
    res.status(500).json({ error: 'Unable to generate player token' })
  }
})

app.post('/api/spotify/transfer-playback', async (req, res) => {
  const { uid, deviceId, play } = req.body || {}

  if (!uid || !deviceId) {
    return res.status(400).json({ error: 'uid and deviceId are required' })
  }

  try {
    const token = await ensureSpotifyAccessToken(uid)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const response = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [deviceId], play: Boolean(play) }),
    })

    if (!response.ok) {
      console.error('Spotify transfer playback error', response.status, await response.text())
      return res.status(response.status).json({ error: 'Unable to transfer playback' })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Spotify transfer playback failure', err)
    res.status(500).json({ error: 'Unable to transfer playback' })
  }
})

app.post('/api/spotify/start-playback', async (req, res) => {
  const { uid, deviceId, spotifyUri } = req.body || {}

  if (!uid || !deviceId || !spotifyUri) {
    return res.status(400).json({ error: 'uid, deviceId, and spotifyUri are required' })
  }

  try {
    const token = await ensureSpotifyAccessToken(uid)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [spotifyUri] }),
      },
    )

    if (!response.ok) {
      console.error('Spotify start playback error', response.status, await response.text())
      return res.status(response.status).json({ error: 'Unable to start playback' })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Spotify start playback failure', err)
    res.status(500).json({ error: 'Unable to start playback' })
  }
})

app.put('/api/spotify/player/activate', async (req, res) => {
  const { deviceId, uid } = req.body || {}

  if (!deviceId || !uid) {
    return res.status(400).json({ error: 'deviceId and uid are required' })
  }

  try {
    const token = await ensureSpotifyAccessToken(uid)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const response = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    })

    if (!response.ok) {
      console.error('Spotify activate device error', response.status, await response.text())
      return res.status(500).json({ error: 'Unable to activate playback device' })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Spotify activate failure', err)
    res.status(500).json({ error: 'Unable to activate playback device' })
  }
})

app.get('/api/spotify/login', async (req, res) => {
  const userId = req.query.uid
  if (!userId) return res.status(400).json({ error: 'uid is required' })

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    return res.status(500).json({ error: 'Spotify is not configured on the server' })
  }

  const state = encodeState({ uid: userId })

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    state,
  })

  const url = `https://accounts.spotify.com/authorize?${params.toString()}`
  res.json({ url })
})

app.get('/api/spotify/callback', async (req, res) => {
  const { code, state } = req.query
  const decoded = decodeState(state)
  const userId = decoded?.uid

  if (!code || !userId) {
    return res.status(400).send('Missing code or state')
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    })

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      console.error('Spotify callback token error', response.status, await response.text())
      return res.status(500).send('Unable to complete Spotify authentication')
    }

    const json = await response.json()
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + (json.expires_in || 3600) * 1000,
    )

    await getSpotifyTokenRef(userId).set(
      {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt,
        scopes: SPOTIFY_SCOPES,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return res.redirect(`${FRONTEND_BASE_URL}/listening-library?spotify=connected`)
  } catch (err) {
    console.error('Spotify callback error', err)
    return res.status(500).send('Spotify authentication failed')
  }
})

app.get('/api/spotify/access-token', async (req, res) => {
  const userId = req.query.uid
  if (!userId) return res.status(400).json({ error: 'uid is required' })

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    res.json({ accessToken: token })
  } catch (err) {
    console.error('Spotify access token error', err)
    res.status(500).json({ error: 'Unable to fetch Spotify access token' })
  }
})

app.get('/api/spotify/me/tracks', async (req, res) => {
  const userId = req.query.uid
  if (!userId) return res.status(400).json({ error: 'uid is required' })

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const response = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error('Spotify tracks error', response.status, await response.text())
      return res.status(500).json({ error: 'Unable to fetch Spotify tracks' })
    }

    const json = await response.json()
    const items = (json.items || []).map(mapTrackItem).filter((item) => item.spotifyId)
    res.json({ items })
  } catch (err) {
    console.error('Spotify tracks failure', err)
    res.status(500).json({ error: 'Unable to fetch Spotify tracks' })
  }
})

app.get('/api/spotify/me/playlists', async (req, res) => {
  const userId = req.query.uid
  if (!userId) return res.status(400).json({ error: 'uid is required' })

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error('Spotify playlists error', response.status, await response.text())
      return res.status(500).json({ error: 'Unable to fetch Spotify playlists' })
    }

    const json = await response.json()
    const items = (json.items || []).map(mapPlaylistItem).filter((item) => item.spotifyId)
    res.json({ items })
  } catch (err) {
    console.error('Spotify playlists failure', err)
    res.status(500).json({ error: 'Unable to fetch Spotify playlists' })
  }
})

app.get('/api/spotify/me/shows', async (req, res) => {
  const userId = req.query.uid
  if (!userId) return res.status(400).json({ error: 'uid is required' })

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const response = await fetch('https://api.spotify.com/v1/me/shows?limit=50', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error('Spotify shows error', response.status, await response.text())
      return res.status(500).json({ error: 'Unable to fetch Spotify shows' })
    }

    const json = await response.json()
    const items = (json.items || []).map(mapShowItem).filter((item) => item.spotifyId)
    res.json({ items })
  } catch (err) {
    console.error('Spotify shows failure', err)
    res.status(500).json({ error: 'Unable to fetch Spotify shows' })
  }
})

app.get('/api/spotify/search', async (req, res) => {
  const userId = req.query.uid
  const queryText = req.query.q || ''
  const typeParam = req.query.type || 'track'

  if (!userId) return res.status(400).json({ error: 'uid is required' })
  if (!queryText) return res.status(400).json({ error: 'q is required' })

  const allowedTypes = new Set(['track', 'artist', 'album', 'playlist', 'show'])
  const types = String(typeParam)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => allowedTypes.has(t))

  if (!types.length) {
    return res.status(400).json({ error: 'type must include at least one supported category' })
  }

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const params = new URLSearchParams({
      q: queryText,
      type: types.join(','),
      limit: '20',
    })

    const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error('Spotify search error', response.status, await response.text())
      return res.status(500).json({ error: 'Unable to perform Spotify search' })
    }

    const json = await response.json()
    const results = {}

    if (types.includes('track')) {
      results.tracks = (json?.tracks?.items || [])
        .map(mapSearchTrack)
        .filter((item) => item.spotifyId)
    }

    if (types.includes('playlist')) {
      results.playlists = (json?.playlists?.items || [])
        .map(mapSearchPlaylist)
        .filter((item) => item.spotifyId)
    }

    if (types.includes('show')) {
      results.shows = (json?.shows?.items || [])
        .map(mapSearchShow)
        .filter((item) => item.spotifyId)
    }

    if (types.includes('artist')) {
      results.artists = (json?.artists?.items || [])
        .map(mapSearchArtist)
        .filter((item) => item.spotifyId)
    }

    if (types.includes('album')) {
      results.albums = (json?.albums?.items || [])
        .map(mapSearchAlbum)
        .filter((item) => item.spotifyId)
    }

    res.json({ results })
  } catch (err) {
    console.error('Spotify search failure', err)
    res.status(500).json({ error: 'Unable to perform Spotify search' })
  }
})

app.get('/api/spotify/show/:id/episodes', async (req, res) => {
  const userId = req.query.uid
  const showId = req.params.id

  if (!userId || !showId) {
    return res.status(400).json({ error: 'uid and show id are required' })
  }

  try {
    const token = await ensureSpotifyAccessToken(userId)
    if (!token) return res.status(401).json({ error: 'Not connected to Spotify' })

    const response = await fetch(
      `https://api.spotify.com/v1/shows/${encodeURIComponent(showId)}/episodes?limit=50`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (!response.ok) {
      console.error('Spotify episodes error', response.status, await response.text())
      return res.status(500).json({ error: 'Unable to fetch show episodes' })
    }

    const json = await response.json()
    const episodes = (json?.items || []).map(mapEpisodeItem).filter((item) => item.spotifyId)
    res.json({ episodes })
  } catch (err) {
    console.error('Spotify episodes failure', err)
    res.status(500).json({ error: 'Unable to fetch show episodes' })
  }
})

app.post('/api/spotify/library/add', async (req, res) => {
  const {
    uid,
    spotifyId,
    spotifyUri,
    type,
    title,
    subtitle,
    imageUrl,
    media_type: mediaTypeRaw,
    isrc: isrcRaw,
  } = req.body || {}

  if (!uid || !spotifyId) {
    return res.status(400).json({ error: 'uid and spotifyId are required' })
  }

  try {
    const mediaType = mediaTypeRaw || 'audio'
    const itemRef = firestore.collection('users').doc(uid).collection('spotifyItems').doc(spotifyId)
    const existingSnap = await itemRef.get()
    const existingData = existingSnap.exists ? existingSnap.data() || {} : {}
    const cachedSegments = normaliseTranscriptSegments(existingData.transcriptSegments || [])
    const hasCachedSegments = cachedSegments.length > 0
    const shouldFetchLyrics = !existingData?.lyricsProvider && !hasCachedSegments
    const existingIsrc = existingData?.isrc || null
    const isrc = isrcRaw || existingIsrc || null
    const basePayload = {
      spotifyId,
      spotifyUri: spotifyUri || '',
      type: type || 'track',
      title: title || 'Untitled',
      subtitle: subtitle || '',
      imageUrl: imageUrl || '',
      mediaType,
      hasVideo: mediaType === 'video',
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'spotify',
      transcriptStatus: existingData?.transcriptStatus || (hasCachedSegments ? 'ready' : 'pending'),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    let lyricsPages = []
    let resolvedIsrc = isrc

    if ((type || 'track') === 'track' && !resolvedIsrc) {
      resolvedIsrc = await fetchSpotifyTrackIsrc(uid, spotifyId)
    }

    if (resolvedIsrc) {
      basePayload.isrc = resolvedIsrc
    }

    if ((type || 'track') === 'track' && shouldFetchLyrics) {
      try {
        const lyrics = await getSpotifyTrackLyrics({ title, subtitle, isrc: resolvedIsrc })
        if (lyrics?.pages?.length) {
          lyricsPages = lyrics.pages
          basePayload.transcriptLanguage = lyrics.language || null
          basePayload.lyricsProvider = lyrics.provider
          basePayload.language = lyrics.language || null
        }

        if (lyrics?.richsyncSegments?.length) {
          basePayload.transcriptSegments = lyrics.richsyncSegments
          basePayload.transcriptStatus = 'ready'
          basePayload.transcriptProvider = 'musixmatch-richsync'
          logMusixmatchDebug('richsync available', {
            spotifyId,
            count: lyrics.richsyncSegments.length,
          })
        } else if (lyrics?.pages?.length) {
          basePayload.transcriptStatus = 'ready'
        }
      } catch (lyricsErr) {
        console.error('Failed to fetch Musixmatch lyrics for Spotify track', lyricsErr)
      }
    } else if (hasCachedSegments) {
      logMusixmatchDebug('richsync cached', { spotifyId, count: cachedSegments.length })
    }

    await itemRef.set(basePayload, { merge: true })

    if (lyricsPages.length) {
      const pagesRef = itemRef.collection('pages')
      const batch = firestore.batch()

      lyricsPages.forEach((text, index) => {
        const pageDoc = pagesRef.doc(String(index))
        batch.set(pageDoc, {
          index,
          text,
          originalText: text,
          adaptedText: null,
          status: 'ready',
          audioUrl: null,
          audioStatus: 'none',
        })
      })

      await batch.commit()
    }

    res.json({ ok: true, lyricsFetched: lyricsPages.length > 0 })
  } catch (err) {
    console.error('Spotify library add error', err)
    res.status(500).json({ error: 'Unable to save Spotify item' })
  }
})

app.get('/api/spotify/transcript/:spotifyId', async (req, res) => {
  const userId = req.query.uid
  const { spotifyId } = req.params

  if (!userId || !spotifyId) {
    return res.status(400).json({ error: 'uid and spotifyId are required' })
  }

  try {
    const doc = await firestore
      .collection('users')
      .doc(userId)
      .collection('spotifyItems')
      .doc(spotifyId)
      .get()

    if (!doc.exists) return res.status(404).json({ error: 'Spotify item not found' })

    const data = doc.data()
    res.json({
      transcriptStatus: data.transcriptStatus || 'none',
      transcriptSegments: normaliseTranscriptSegments(data.transcriptSegments || []),
      errorMessage: data.errorMessage || null,
    })
  } catch (err) {
    console.error('Spotify transcript fetch error', err)
    res.status(500).json({ error: 'Unable to fetch Spotify transcript' })
  }
})

app.post('/api/spotify/transcript/generate', async (req, res) => {
  const { uid, spotifyId } = req.body || {}
  if (!uid || !spotifyId) {
    return res.status(400).json({ error: 'uid and spotifyId are required' })
  }

  try {
    const placeholderSegments = [
      { start: 0, end: 5, text: 'Placeholder transcript line 1.' },
      { start: 5, end: 10, text: 'Placeholder transcript line 2.' },
    ]

    const itemRef = firestore.collection('users').doc(uid).collection('spotifyItems').doc(spotifyId)

    await itemRef.set(
      {
        transcriptSegments: placeholderSegments,
        transcriptStatus: 'whisperReady',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('Spotify transcript generate error', err)
    res.status(500).json({ error: 'Unable to generate transcript' })
  }
})

async function fetchYoutubeCaptionSegments(videoId, languageCode) {
  const info = await ytdl.getInfo(videoId)
  const tracks =
    info?.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []

  console.log('CAPTION TRACKS:', JSON.stringify(tracks, null, 2))

  if (!tracks.length) return []

  const normalisedLang = (languageCode || 'auto').toLowerCase()

  const matchByLangCode = tracks.find((track) => track.languageCode?.toLowerCase() === normalisedLang)
  const autoTrack = tracks.find((track) => track.kind === 'asr')
  const fallbackTrack = tracks[0]

  const selectedTrack = matchByLangCode || autoTrack || fallbackTrack

  if (!selectedTrack?.baseUrl) return []

  const trackUrl = `${selectedTrack.baseUrl}&fmt=json3`
  const response = await fetch(trackUrl)

  if (!response.ok) {
    throw new Error(`Failed to fetch caption track: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const events = Array.isArray(data?.events) ? data.events : []

  const segments = events
    .map((event) => {
      const start = Number(event.tStartMs || event.startMs || 0) / 1000
      const durationMs =
        Number(event.dDurationMs ?? event.dur ?? event.segs?.[0]?.tDurMs ?? 0)
      const end = start + durationMs / 1000
      const text = (event.segs || [])
        .map((seg) => (seg.utf8 || '').replace('\n', ' '))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()

      if (!text) return null

      return {
        start,
        end: end > start ? end : start,
        text,
      }
    })
    .filter(Boolean)

  return segments
}

async function downloadYoutubeAudio(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const tempBase = path.join(os.tmpdir(), `yt-audio-${videoId}-${Date.now()}`)
  const outputTemplate = `${tempBase}.%(ext)s`
  const downloadDir = path.dirname(tempBase)
  const baseName = path.basename(tempBase)

  let actualAudioPath = null

  await new Promise((resolve, reject) => {
    const ytProcess = spawn('yt-dlp', ['-f', 'bestaudio', '-o', outputTemplate, videoUrl])

    ytProcess.on('error', reject)

    ytProcess.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exited with code ${code}`))
      }

      try {
        const entries = await fs.readdir(downloadDir)
        const matchedFiles = entries.filter((name) => name.startsWith(`${baseName}.`))

        if (matchedFiles.length === 0) {
          return reject(new Error('No audio file found for yt-dlp output template'))
        }

        actualAudioPath = path.join(downloadDir, matchedFiles[0])
        const stat = await fs.stat(actualAudioPath)

        if (!stat.size) {
          return reject(new Error('Downloaded audio file is empty'))
        }

        return resolve()
      } catch (fileError) {
        return reject(fileError)
      }
    })
  })

  return actualAudioPath
}

async function downloadAudioUrlToTempFile(audioUrl) {
  if (!audioUrl) return null

  const response = await fetch(audioUrl)

  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const tempPath = path.join(os.tmpdir(), `audio-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`)

  await fs.writeFile(tempPath, Buffer.from(arrayBuffer))

  return tempPath
}

function splitIntoSentences(text) {
  return (text || '')
    .split(/(?<=[.!?¡¿…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function buildSentenceSegmentsFromWhisper(whisperSegments = []) {
  const sentenceSegments = []
  const segments = Array.isArray(whisperSegments) ? whisperSegments : []

  segments.forEach((seg) => {
    const rawStart = Number(seg?.start)
    const rawEnd = Number(seg?.end)
    const segmentStart = Number.isFinite(rawStart) ? Math.max(0, rawStart) : 0
    const segmentEnd = Number.isFinite(rawEnd) ? Math.max(segmentStart, rawEnd) : segmentStart
    const duration = Math.max(0, segmentEnd - segmentStart)

    const normalisedText = (seg?.text || '').replace(/\s+/g, ' ').trim()
    if (!normalisedText) return

    const subSentences = splitIntoSentences(normalisedText)
    const parts = subSentences.length ? subSentences : [normalisedText]
    const totalChars = parts.reduce((sum, sentence) => sum + sentence.length, 0)

    let cursor = segmentStart
    parts.forEach((sentence, index) => {
      const defaultWeight = parts.length > 0 ? 1 / parts.length : 1
      const weight = totalChars > 0 ? sentence.length / totalChars : defaultWeight
      const subDuration = duration * (Number.isFinite(weight) && weight > 0 ? weight : defaultWeight)
      const sentenceEnd = index === parts.length - 1 ? segmentEnd : Math.max(cursor, cursor + subDuration)

      sentenceSegments.push({ start: cursor, end: sentenceEnd, text: sentence })
      cursor = sentenceEnd
    })
  })

  return sentenceSegments
}

async function transcribeWithWhisper({ videoId, audioUrl, languageCode }) {
  let audioPath = null

  try {
    if (videoId) {
      audioPath = await downloadYoutubeAudio(videoId)
    } else if (audioUrl) {
      audioPath = await downloadAudioUrlToTempFile(audioUrl)
    }

    if (!audioPath) {
      throw new Error('No audio source provided for Whisper transcription')
    }

    const resolvedLanguage = resolveTargetCode(languageCode || 'auto')
    const whisperLanguage = resolvedLanguage === 'auto' ? null : resolvedLanguage

    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      ...(whisperLanguage ? { language: whisperLanguage } : {}),
    })

    console.log('Whisper verbose_json response keys:', Object.keys(transcription || {}))
    console.log('First segment sample:', transcription?.segments?.[0])

    const segments = normaliseTranscriptSegments(transcription?.segments || [])
    const sentenceSegments = buildSentenceSegmentsFromWhisper(segments)

    if (!segments.length) {
      console.warn('Whisper verbose_json has no segments, falling back to text-only')
    }

    return { text: transcription?.text || '', segments, sentenceSegments }
  } finally {
    if (audioPath) {
      try {
        await fs.unlink(audioPath)
      } catch (cleanupError) {
        if (cleanupError?.code !== 'ENOENT') {
          console.error('Failed to clean up temporary audio file', cleanupError)
        }
      }
    }
  }
}

app.post('/api/youtube/transcript', async (req, res) => {
  const { videoId, language, uid, videoDocId } = req.body || {}

  if (!videoId || !uid || !videoDocId) {
    return res.status(400).json({ error: 'videoId, uid, and videoDocId are required' })
  }

  const languageCode = (language || 'auto').toLowerCase()

  try {
    const videoRef = firestore.collection('users').doc(uid).collection('youtubeVideos').doc(videoDocId)
    const videoDoc = await videoRef.get()
    if (!videoDoc.exists) {
      return res.status(404).json({ error: 'YouTube video not found for this user' })
    }

    const transcriptRef = videoRef.collection('transcripts').doc(languageCode)
    const existing = await transcriptRef.get()
    const existingData = existing.exists ? existing.data() || {} : {}
    if (existing.exists) {
      const cachedSegments = normaliseTranscriptSegments(existingData.segments)
      const cachedSentenceSegments = normaliseTranscriptSegments(existingData.sentenceSegments)

      if (cachedSegments.length > 0 || cachedSentenceSegments.length > 0) {
        const resolvedSentenceSegments =
          cachedSentenceSegments.length > 0
            ? cachedSentenceSegments
            : buildSentenceSegmentsFromWhisper(cachedSegments)

        return res.json({
          text: existingData.text || cachedSegments.map((segment) => segment.text).join(' '),
          segments: cachedSegments,
          sentenceSegments: resolvedSentenceSegments,
        })
      }
    }
    let transcriptResult = { text: '', segments: [], sentenceSegments: [] }

    try {
      const captionSegments = await fetchYoutubeCaptionSegments(videoId, languageCode)
      transcriptResult = { text: captionSegments.map((seg) => seg.text).join(' '), segments: captionSegments }
    } catch (captionError) {
      console.error('Failed to fetch YouTube captions, will attempt Whisper fallback', captionError)
    }

    if (!transcriptResult.segments || transcriptResult.segments.length === 0) {
      try {
        const whisperResult = await transcribeWithWhisper({ videoId, languageCode })
        transcriptResult = {
          text: whisperResult?.text || '',
          segments: Array.isArray(whisperResult?.segments) ? whisperResult.segments : [],
          sentenceSegments: Array.isArray(whisperResult?.sentenceSegments)
            ? whisperResult.sentenceSegments
            : [],
        }
      } catch (transcriptionError) {
        console.error('Failed to transcribe audio with Whisper', transcriptionError)
        return res.status(500).json({ error: 'Failed to generate subtitles' })
      }
    }

    const normalisedSegments = normaliseTranscriptSegments(transcriptResult.segments)
    const resolvedSentenceSegments = (() => {
      const cached = normaliseTranscriptSegments(transcriptResult.sentenceSegments)
      if (cached.length) return cached
      return buildSentenceSegmentsFromWhisper(normalisedSegments)
    })()
    const transcriptText = transcriptResult.text || normalisedSegments.map((segment) => segment.text).join(' ')

    const transcriptPayload = {
      videoId,
      language: languageCode,
      segments: normalisedSegments,
      text: transcriptText,
      sentenceSegments: resolvedSentenceSegments,
      createdAt: existingData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    }

    await transcriptRef.set(transcriptPayload, { merge: true })

    return res.json({
      text: transcriptPayload.text,
      segments: transcriptPayload.segments,
      sentenceSegments: transcriptPayload.sentenceSegments,
    })
  } catch (error) {
    console.error('Failed to transcribe YouTube audio', error)
    return res.status(500).json({ error: 'Failed to transcribe YouTube audio' })
  }
})

app.post('/api/youtube/import', async (req, res) => {
  const { title, youtubeUrl, uid } = req.body || {}
  const trimmedTitle = (title || '').trim()
  const trimmedUrl = (youtubeUrl || '').trim()

  if (!trimmedTitle || !trimmedUrl || !uid) {
    return res.status(400).json({ error: 'title, youtubeUrl, and uid are required' })
  }

  const videoId = extractYouTubeId(trimmedUrl)
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' })
  }

  let metadata = { channelTitle: null, durationSeconds: null }
  try {
    metadata = await fetchYoutubeMetadata(videoId)
  } catch (metadataError) {
    console.error('Failed to fetch YouTube metadata', metadataError)
  }

  const payload = {
    title: trimmedTitle,
    youtubeUrl: trimmedUrl,
    videoId,
    channelTitle: metadata.channelTitle || 'Unknown channel',
    ...(Number.isFinite(metadata.durationSeconds) && { durationSeconds: metadata.durationSeconds }),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'youtube',
  }

  try {
    const videoRef = await firestore
      .collection('users')
      .doc(uid)
      .collection('youtubeVideos')
      .add(payload)

    return res.json({ id: videoRef.id, ...payload })
  } catch (error) {
    console.error('Failed to save YouTube import', error)
    return res.status(500).json({ error: 'Failed to import YouTube video' })
  }
})

app.post('/api/audio-url', async (req, res) => {
  const { audioPath } = req.body || {}

  if (!audioPath || typeof audioPath !== 'string') {
    return res.status(400).json({ error: 'audioPath is required' })
  }

  try {
    const file = bucket.file(audioPath)
    const [exists] = await file.exists()

    if (!exists) {
      return res.status(404).json({ error: 'Audio file not found' })
    }

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    })

    return res.json({ signedUrl })
  } catch (error) {
    console.error('Failed to generate signed audio URL', { audioPath, error })
    return res.status(500).json({ error: 'Failed to generate signed audio URL' })
  }
})

app.post('/api/generate', async (req, res) => {
  try {
    const { level, genre, length, description, language, pageCount, voiceGender } = req.body
    const totalPages = Math.max(5, Number(pageCount || length || 1) || 1)
    const trimmedDescription = description?.trim() || 'Use your creativity to craft the plot.'

    let resolvedVoiceId = ''
    let resolvedVoiceGender = ''

    try {
      const voiceSelection = resolveElevenLabsVoiceId(language, voiceGender)
      resolvedVoiceId = voiceSelection.voiceId
      resolvedVoiceGender = voiceSelection.voiceGender
    } catch (voiceError) {
      return res.status(400).json({ error: voiceError?.message || 'Invalid voice selection' })
    }

    let title = 'Untitled Story'
    let pagePlans = new Array(totalPages).fill(null)

    try {
      const planningPrompt = `You are planning a ${genre} story in ${language} for a reader at ${level} level. Use this idea: ${trimmedDescription}. Create a concise outline for ${totalPages} pages. Provide a JSON object with a short, compelling story title in the requested language and an array of page-level beats that loosely guide the narrative (do not force scene endings to align to page breaks). Return only JSON with keys "title" and "pagePlans" (array length ${totalPages}, each entry 1-3 sentences).`

      const planningResponse = await client.responses.create({
        model: "gpt-4.1",
        input: planningPrompt,
        text: { format: { type: 'json_object' } },
      })

      const contentBlocks = planningResponse?.output?.[0]?.content || []
      const jsonBlock = contentBlocks.find((block) =>
        block?.type === 'output_json' || block?.type === 'json'
      )

      let planningPayload = jsonBlock?.output_json || jsonBlock?.json

      if (!planningPayload) {
        const textBlock = contentBlocks.find((block) => typeof block?.text === 'string')
        const candidateText = textBlock?.text || planningResponse?.output_text
        if (candidateText) {
          try {
            planningPayload = JSON.parse(candidateText)
          } catch (err) {
            planningPayload = null
          }
        }
      }

      if (planningPayload) {
        if (typeof planningPayload.title === 'string' && planningPayload.title.trim()) {
          title = planningPayload.title.trim()
        }

        if (Array.isArray(planningPayload.pagePlans)) {
          const normalizedPlans = Array.from({ length: totalPages }, (_, index) =>
            planningPayload.pagePlans[index] ?? null,
          )
          pagePlans = normalizedPlans
        }
      }
    } catch (planningError) {
      console.error('Planning step failed:', planningError)
    }

    const pages = []

    for (let index = 0; index < totalPages; index += 1) {
      const pageNumber = index + 1

      const isFirstPage = pageNumber === 1

      const plannedBeat = pagePlans[index] || 'Continue following the planned narrative and pacing.'

      const baseInstructions = `You are writing page ${pageNumber} of ${totalPages} of a ${genre} story in ${language} at ${level} level. Story title: ${title}. Planned beat for this page: ${plannedBeat}. Each page must be approximately 250 words (between 230 and 260 words). A page is just a layout boundary, not a unit of the story. Scenes, ideas, paragraphs, and sentences can start on one page and continue onto the next.`

      const input = isFirstPage
        ? `${baseInstructions} Continue the same story from any previous pages, keeping characters and tone consistent. Story description: ${trimmedDescription}. Provide only the full text for page ${pageNumber} with no headings, titles, or page labels.`
        : (() => {
            const previousPage = pages[pageNumber - 2] || ''
            const previousTail = previousPage.slice(Math.max(previousPage.length - 1000, 0))

            return `${baseInstructions} Continue directly from the previous page. Previous page ending (context only, do not repeat): "${previousTail}". Use the previous page ending only as context and do not repeat those sentences. Keep characters and tone consistent. Scenes, ideas, paragraphs, and sentences can cross page boundaries. Do not try to start or wrap up a scene just because the page is ending. Stop after about 250 words (between 230 and 260) even if in the middle of a paragraph or scene. Story description: ${trimmedDescription}. Provide only the full text for page ${pageNumber} with no headings, titles, or page labels.`
          })()

      const response = await client.responses.create({
        model: "gpt-4.1",
        input,
      })

      pages.push(response.output_text.trim())
    }

    res.json({ title, pages, voiceId: resolvedVoiceId, voiceGender: resolvedVoiceGender })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "OpenAI generation failed" })
  }
})

app.post('/api/translatePhrase', async (req, res) => {
  try {
    const { phrase, sourceLang, targetLang, ttsLanguage, skipAudio } = req.body || {}
    const rawTtsLanguage = req.body?.ttsLanguage

    if (!phrase || typeof phrase !== 'string') {
      return res.status(400).json({ error: 'phrase is required' })
    }

    if (!targetLang) {
      return res.status(400).json({ error: 'targetLang is required' })
    }

    if (!sourceLang) {
      return res.status(400).json({ error: 'sourceLang is required' })
    }

    const sourceLabel = sourceLang || 'auto-detected'
    const targetLabel = targetLang || 'English'

    const prompt = `
Translate the following phrase from ${sourceLabel} to ${targetLabel}.
Return only the translated phrase, with no extra commentary.

${phrase}
`.trim()

    const translationPromise = (async () => {
      let translation = phrase
      let targetText = phrase

      try {
        const response = await client.responses.create({
          model: 'gpt-4o-mini',
          input: prompt,
        })
        translation = response.output_text?.trim() || translation
        targetText = translation
      } catch (innerErr) {
        console.error('Error translating phrase with OpenAI:', innerErr)
      }

      return { translation, targetText }
    })()

    const pronunciationPromise = translationPromise.then(async ({
      translation,
      targetText,
    }) => {
      // Always pronounce the learner's target-language text (i.e., the text they selected),
      // not the translated/native-language output. This keeps audio aligned with the
      // on-page content when learners are translating into their native language.
      const phraseForAudio = phrase?.trim() || targetText?.trim() || translation?.trim()

      if (!phraseForAudio || !phraseForAudio.trim()) return null

      const phraseForAudioSafe =
        phraseForAudio.length > 600 ? phraseForAudio.slice(0, 600) : phraseForAudio

      // Use ElevenLabs TTS with language-specific voice to avoid cognate mispronunciation
      const resolvedGender = voiceGender || 'male'

      try {
        const { voiceId } = resolveElevenLabsVoiceId(sourceLang, resolvedGender)

        if (process.env.TTS_DEBUG === '1') {
          console.log(
            `TTS_TRANSLATE_PHRASE (ElevenLabs) len=${phraseForAudioSafe.length} lang=${sourceLang} gender=${resolvedGender} voiceId=${voiceId}`
          )
        }

        const audioBuffer = await requestElevenLabsTts(phraseForAudioSafe, voiceId)
        return audioBuffer.toString('base64')
      } catch (ttsError) {
        console.error('Error generating pronunciation audio (ElevenLabs):', ttsError)
        return null
      }
    })

    // Skip audio generation if requested (e.g., for intensive mode sentence preloading)
    if (skipAudio) {
      const { translation, targetText } = await translationPromise
      return res.json({ phrase, translation, targetText, audioBase64: null })
    }

    const [{ translation, targetText }, audioBase64] = await Promise.all([
      translationPromise,
      pronunciationPromise,
    ])

    return res.json({ phrase, translation, targetText, audioBase64 })
  } catch (error) {
    console.error('Error translating phrase:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

function detectFileType(originalName = '') {
  const lower = originalName.toLowerCase()
  if (lower.endsWith('.txt')) return 'txt'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.epub')) return 'epub'
  return 'unknown'
}

async function extractTxt(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  const words = raw.split(/\s+/)
  const pages = []
  let buffer = []

  for (const word of words) {
    buffer.push(word)
    if (buffer.join(' ').length > 1200) {
      pages.push(buffer.join(' '))
      buffer = []
    }
  }

  if (buffer.length > 0) pages.push(buffer.join(' '))
  return pages
}

async function extractPdf(filePath) {
  const data = await fs.readFile(filePath)
  const pdf = await pdfParse(data)
  const fullText = pdf.text || ''
  const trimmed = fullText.trim()

  if (trimmed.length < 100) {
    const err = new Error('SCANNED_PDF_NOT_SUPPORTED')
    err.code = 'SCANNED_PDF_NOT_SUPPORTED'
    throw err
  }
  const words = fullText.split(/\s+/)

  const pages = []
  let buffer = []

  for (const word of words) {
    buffer.push(word)
    if (buffer.join(' ').length > 1200) {
      pages.push(buffer.join(' '))
      buffer = []
    }
  }

  if (buffer.length > 0) pages.push(buffer.join(' '))
  return pages
}

function parseEpub(filePath) {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath)

    epub.on('error', (err) => {
      console.error('EPUB parse error:', err)
      reject(err)
    })

    epub.on('end', () => {
      resolve(epub)
    })

    epub.parse()
  })
}

function getChapterAsync(epub, id) {
  return new Promise((resolve, reject) => {
    epub.getChapter(id, (err, text) => {
      if (err) {
        console.error('EPUB getChapter error:', err)
        reject(err)
      } else {
        resolve(text || '')
      }
    })
  })
}

async function extractEpub(filePath) {
  const epub = await parseEpub(filePath)

  let fullText = ''

  // epub.flow is an array describing the reading order
  for (const item of epub.flow) {
    const content = await getChapterAsync(epub, item.id)
    fullText += content.replace(/<[^>]+>/g, ' ') + ' '
  }

  const words = fullText.split(/\s+/)
  const pages = []
  let buffer = []

  for (const word of words) {
    buffer.push(word)
    if (buffer.join(' ').length > 1200) {
      pages.push(buffer.join(' '))
      buffer = []
    }
  }

  if (buffer.length > 0) pages.push(buffer.join(' '))
  return pages
}

async function extractPagesForFile(file) {
  if (!file || !file.path) {
    return []
  }

  const fileType = detectFileType(file.originalname)
  console.log('Detected import file type:', fileType, 'for', file.originalname)

  if (fileType === 'txt') return extractTxt(file.path)
  if (fileType === 'pdf') return extractPdf(file.path)
  if (fileType === 'epub') return extractEpub(file.path)

  // Unknown type for now
  return [`[STUB] Unknown file type for: ${file.originalname}`]
}

async function saveImportedBookToFirestore({
  userId,
  title,
  author,
  originalLanguage,
  outputLanguage,
  translationMode,
  level,
  isPublicDomain,
  pages,
}) {
  if (!userId) {
    throw new Error('userId is required to import a book')
  }

  const storyRef = firestore
    .collection('users')
    .doc(userId)
    .collection('stories')
    .doc()

  await storyRef.set({
    userId,
    language: outputLanguage,
    title,
    author,
    originalLanguage,
    outputLanguage,
    translationMode,
    level: translationMode === 'graded' ? level : null,
    isPublicDomain: isPublicDomain === 'true',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    pageCount: pages.length,
    adaptedPages: 0,
    status: 'pending',
    hasFullAudio: false,
    audioStatus: 'none',
    fullAudioUrl: null,
    description: `Imported: ${title || 'Untitled book'}`,
  })

  const batch = firestore.batch()
  const pagesRef = storyRef.collection('pages')

  pages.forEach((text, index) => {
    const pageDoc = pagesRef.doc(String(index))
    batch.set(pageDoc, {
      index,
      text: text,
      originalText: text,
      adaptedText: null,
      status: 'pending',
      audioUrl: null,
      audioStatus: 'pending',
    })
  })

  await batch.commit()

  return storyRef.id
}

async function adaptPageText({
  originalText,
  originalLanguage,
  outputLanguage,
  translationMode,
  level,
}) {
  const sourceLabel = originalLanguage || 'auto-detected'
  const targetLabel = outputLanguage || 'target language'

  const modeInstruction =
    translationMode === 'graded'
      ? `Rewrite this text as a simplified graded reader in ${targetLabel} at CEFR level ${level}. Preserve all key information and narrative events, but use simpler vocabulary and shorter sentences.`
      : `Translate this text from ${sourceLabel} to ${targetLabel} as literally as possible while keeping natural grammar. Do not simplify or summarize.`

  const prompt = `
You are adapting a book for language learners.

${modeInstruction}

Return only the adapted text, with no headings, no commentary, and no explanations.

--- BEGIN TEXT ---
${originalText}
--- END TEXT ---
  `.trim()

  const response = await client.responses.create({
    model: 'gpt-4o-mini',
    input: prompt,
  })

  const adapted = response.output_text?.trim() || ''
  return adapted
}

async function runAdaptationForBook(bookId) {
  const bookRef = firestore.collection('books').doc(bookId)
  const bookSnap = await bookRef.get()

  if (!bookSnap.exists) {
    throw new Error(`Book not found: ${bookId}`)
  }

  const bookData = bookSnap.data() || {}
  const {
    originalLanguage,
    outputLanguage,
    translationMode,
    level,
    totalPages,
  } = bookData

  console.log('Starting adaptation for book:', bookId, {
    originalLanguage,
    outputLanguage,
    translationMode,
    level,
    totalPages,
  })

  // Mark book as adapting
  await bookRef.update({
    status: 'adapting',
  })

  const pagesRef = bookRef.collection('pages')
  const pendingSnap = await pagesRef.where('status', '==', 'pending').orderBy('index').get()

  let adaptedCount = bookData.adaptedPages || 0

  for (const doc of pendingSnap.docs) {
    const pageData = doc.data()
    const { originalText, index } = pageData

    if (!originalText || typeof originalText !== 'string' || !originalText.trim()) {
      console.warn(`Skipping empty page ${index} for book ${bookId}`)
      await doc.ref.update({ status: 'skipped' })
      continue
    }

    console.log(`Adapting page ${index} of book ${bookId}`)

    try {
      const adaptedText = await adaptPageText({
        originalText,
        originalLanguage,
        outputLanguage,
        translationMode,
        level,
      })

      await doc.ref.update({
        adaptedText,
        status: 'done',
      })

      adaptedCount += 1
      await bookRef.update({
        adaptedPages: adaptedCount,
      })
    } catch (err) {
      console.error(`Failed to adapt page ${index} of book ${bookId}:`, err)
      await doc.ref.update({
        status: 'error',
        errorMessage: err.message || 'Adaptation failed',
      })
    }
  }

  // If every page is done/skipped, mark book as ready
  if (adaptedCount >= (totalPages || adaptedCount)) {
    await bookRef.update({
      status: 'ready',
    })
  }

  console.log('Finished adaptation for book:', bookId, 'adaptedPages:', adaptedCount)
}

app.post('/api/import-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' })
    }

    const {
      originalLanguage,
      outputLanguage,
      translationMode,
      level,
      author,
      title,
      isPublicDomain,
      userId,
    } = req.body || {}

    const metadata = {
      originalLanguage,
      outputLanguage,
      translationMode,
      level,
      author,
      title,
      isPublicDomain,
      userId,
    }

    console.log('Import upload received:', req.file.path, req.file.originalname, metadata)

    const pages = await extractPagesForFile(req.file)
    const bookId = await saveImportedBookToFirestore({
      userId,
      title,
      author,
      originalLanguage,
      outputLanguage,
      translationMode,
      level,
      isPublicDomain,
      pages,
    })
    console.log('Stub extracted pages count:', pages.length)

    // Fire-and-forget adaptation trigger
    const adaptPayload = {
      uid: userId,
      storyId: bookId,
      targetLanguage: outputLanguage,
      level,
    }

    fetch('http://localhost:4000/api/adapt-imported-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adaptPayload),
    }).catch((err) => console.error('Auto-adapt trigger failed:', err))

    return res.json({
      success: true,
      message: 'Import processed successfully',
      bookId,
      pageCount: pages.length,
    })
  } catch (error) {
    console.error('Error handling import upload:', error)
    if (error.code === 'SCANNED_PDF_NOT_SUPPORTED' || error.message === 'SCANNED_PDF_NOT_SUPPORTED') {
      return res.status(400).json({
        error: 'SCANNED_PDF_NOT_SUPPORTED',
        message:
          'This file appears to be a scanned PDF with no real text inside. Scanned PDFs contain images instead of words, and we cannot ensure accurate or high-quality adaptations from them. To guarantee reliability, inTongues only accepts pure/text PDFs, EPUB, or TXT files. Please upload a clean digital version of the book.',
      })
    }
    return res.status(500).json({ error: 'Failed to handle import upload' })
  }
})

app.post('/api/start-adaptation/:bookId', async (req, res) => {
  const { bookId } = req.params || {}

  if (!bookId) {
    return res.status(400).json({ error: 'bookId is required' })
  }

  try {
    console.log('Received request to start adaptation for book:', bookId)

    // Fire and forget for now; we don't await full completion before responding
    runAdaptationForBook(bookId)
      .then(() => {
        console.log('Adaptation completed for book:', bookId)
      })
      .catch((err) => {
        console.error('Adaptation worker failed for book:', bookId, err)
      })

    return res.json({
      success: true,
      message: `Adaptation started for book ${bookId}`,
    })
  } catch (error) {
    console.error('Error starting adaptation for book:', bookId, error)
    return res.status(500).json({ error: 'Failed to start adaptation' })
  }
})

app.post('/api/adapt-imported-book', async (req, res) => {
  try {
    const { uid, storyId, targetLanguage, level } = req.body || {}

    if (!uid || !storyId) {
      return res.status(400).json({ error: 'uid and storyId are required' })
    }

    console.log('Received adapt-imported-book request:', { uid, storyId, targetLanguage, level })

    const storyRef = firestore.collection('users').doc(uid).collection('stories').doc(storyId)
    const storySnap = await storyRef.get()

    if (!storySnap.exists) {
      return res.status(404).json({ error: 'Story not found' })
    }

    const pagesRef = storyRef.collection('pages')
    const pagesSnap = await pagesRef.orderBy('index').get()

    if (pagesSnap.empty) {
      return res.status(404).json({ error: 'No pages found for this story' })
    }

    await storyRef.update({ status: 'adapting' })

    console.log('Found pages for adaptation:', pagesSnap.size)

    const resolvedTargetLanguage = resolveTargetCode(targetLanguage)

    let processedCount = 0

    for (const doc of pagesSnap.docs) {
      const data = doc.data() || {}
      const sourceText = data.originalText || data.text || ''
      const pageIndex = data.index ?? doc.id

      if (!sourceText || !sourceText.trim()) {
        console.warn(`Skipping empty page ${pageIndex} for story ${storyId}`)
        await doc.ref.update({ status: 'error', errorMessage: 'Empty page content' })
        continue
      }

      console.log(`Adapting page ${pageIndex} for story ${storyId}`)

      try {
        const response = await client.responses.create({
          model: "gpt-4.1",
          input: [
            {
              role: "system",
              content: ADAPTATION_SYSTEM_PROMPT
            },
            {
              role: "user",
              content: `Adapt the following text to level ${level} in ${resolvedTargetLanguage}:\n\n${sourceText}`
            }
          ]
        })

        const adaptedText = response?.output?.[0]?.content?.[0]?.text?.trim() || ''

        await doc.ref.update({
          adaptedText,
          status: 'done',
        })

        processedCount += 1
        console.log(`Finished adapting page ${pageIndex} for story ${storyId}`)
      } catch (adaptError) {
        console.error(`Error adapting page ${pageIndex} for story ${storyId}:`, adaptError)
        await doc.ref.update({
          status: 'error',
          errorMessage: adaptError.message || 'Adaptation failed',
        })
      }
    }

    await storyRef.update({
      status: 'ready',
      adaptedPages: processedCount,
    })

    fetch('http://localhost:4000/api/generate-audio-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, storyId }),
    }).catch((err) => {
      console.error('Auto audio generation trigger failed:', err)
    })

    console.log('Adaptation completed for story:', storyId, 'pages processed:', processedCount)

    return res.json({ success: true, storyId, pageCount: processedCount })
  } catch (error) {
    console.error('Error adapting imported book:', error)
    return res.status(500).json({ error: 'Failed to adapt imported book' })
  }
})

async function saveAudioBufferForGuidebookPage(bookId, pageIndex, audioBuffer) {
  const filePath = `guidebooks/${bookId}/page_${pageIndex}.mp3`
  const file = bucket.file(filePath)

  await file.save(audioBuffer, { contentType: 'audio/mpeg' })
  await file.makePublic()

  return file.publicUrl()
}

async function saveFullAudioForStory(uid, storyId, audioBuffer) {
  const filePath = `audio/full/${uid}/${storyId}.mp3`
  const file = bucket.file(filePath)

  await file.save(audioBuffer, { contentType: 'audio/mpeg' })
  await file.makePublic()

  return file.publicUrl()
}

function bufferToStream(buffer) {
  return Readable.from(buffer)
}

async function transcodeBufferToFormat(inputBuffer, configureCommand) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const baseCommand = inputBuffer ? ffmpeg(bufferToStream(inputBuffer)) : ffmpeg()
    const command = configureCommand(baseCommand)

    const outputStream = command.on('error', reject).pipe()

    outputStream.on('data', (chunk) => chunks.push(chunk))
    outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    outputStream.on('error', reject)
  })
}

async function downloadPageAudioAsWav(bucketPath) {
  const [mp3Buffer] = await bucket.file(bucketPath).download()

  return transcodeBufferToFormat(mp3Buffer, (command) =>
    command.inputFormat('mp3').audioChannels(2).audioFrequency(24000).format('wav')
  )
}

async function mergeWavBuffers(wavBuffers) {
  if (!Array.isArray(wavBuffers) || wavBuffers.length === 0) return null

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audiomerge-'))
  const wavPaths = []

  try {
    for (let i = 0; i < wavBuffers.length; i += 1) {
      const wavPath = path.join(tmpDir, `part-${i}.wav`)
      await fs.writeFile(wavPath, wavBuffers[i])
      wavPaths.push(wavPath)
    }

    const listFilePath = path.join(tmpDir, 'inputs.txt')
    const listFileContents = wavPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    await fs.writeFile(listFilePath, listFileContents, 'utf8')

    return await transcodeBufferToFormat(null, (command) =>
      command
        .input(listFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-acodec', 'pcm_s16le'])
        .format('wav')
    )
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

async function encodeMergedWavToMp3(wavBuffer) {
  return transcodeBufferToFormat(wavBuffer, (command) =>
    command.inputFormat('wav').audioChannels(2).audioFrequency(24000).format('mp3')
  )
}

async function generateAudioForPage(bookId, pageIndex, text, voiceId, languageLabel) {
  if (!text || !text.trim()) return null

  const MAX_CHARS = 6000
  const safeText = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text
  const audioBuffer = await requestElevenLabsTts(safeText, voiceId)
  const audioUrl = await saveAudioBufferForGuidebookPage(bookId, pageIndex, audioBuffer)
  logTtsMethod('elevenlabs', languageLabel || 'unknown')

  return audioUrl
}

app.post('/api/generate-audio-book', async (req, res) => {
  let storyRef

  try {
    const { uid, storyId } = req.body || {}

    if (!uid || !storyId) {
      return res.status(400).json({ error: 'uid and storyId are required' })
    }

    storyRef = firestore.collection('users').doc(uid).collection('stories').doc(storyId)
    const storySnap = await storyRef.get()

    if (!storySnap.exists) {
      return res.status(404).json({ error: 'Story not found' })
    }

    const storyData = storySnap.data() || {}
    const storyLanguage = normalizeLanguageLabel(storyData?.language || storyData?.outputLanguage)
    const storyVoiceGender = String(storyData?.voiceGender || '').trim().toLowerCase()
    const storyVoiceId = storyData?.voiceId

    if (!storyLanguage || !ELEVENLABS_VOICE_MAP[storyLanguage]) {
      const message = `Unsupported language for audio generation: ${storyData?.language || storyData?.outputLanguage || 'unknown'}`
      console.error(message)
      throw new Error(message)
    }

    if (!SUPPORTED_VOICE_GENDERS.has(storyVoiceGender)) {
      const message = `Invalid voice gender for audio generation: ${storyData?.voiceGender || 'unknown'}`
      console.error(message)
      throw new Error(message)
    }

    if (!storyVoiceId) {
      const message = 'Missing ElevenLabs voiceId for audio generation'
      console.error(message)
      throw new Error(message)
    }

    const expectedVoiceId =
      ELEVENLABS_VOICE_MAP[storyLanguage]?.[storyVoiceGender]

    if (!expectedVoiceId) {
      const message = `Missing voiceId mapping for ${storyLanguage} (${storyVoiceGender})`
      console.error(message)
      throw new Error(message)
    }

    if (storyVoiceId !== expectedVoiceId) {
      const message = `VoiceId mismatch for ${storyLanguage} (${storyVoiceGender})`
      console.error(message)
      throw new Error(message)
    }

    await storyRef.update({
      audioStatus: 'processing',
      hasFullAudio: false,
      fullAudioUrl: null,
    })

    const pagesRef = storyRef.collection('pages')
    const pagesSnap = await pagesRef.orderBy('index').get()

    if (pagesSnap.empty) {
      await storyRef.update({
        audioStatus: 'error',
        hasFullAudio: false,
        fullAudioUrl: null,
      })
      return res.status(404).json({ error: 'No pages found for this story' })
    }

    let pagesProcessed = 0
    let pagesSucceeded = 0
    const storyTextParts = []

    for (const doc of pagesSnap.docs) {
      const data = doc.data() || {}
      const pageIndex = data.index ?? Number(doc.id) ?? 0
      const readyAudio = data.audioStatus === 'ready' && data.audioUrl
      const pageText =
        (data.adaptedText && data.adaptedText.trim()) ||
        (data.originalText && data.originalText.trim()) ||
        (data.text && data.text.trim()) ||
        ''

      storyTextParts.push(pageText)

      if (readyAudio) {
        pagesSucceeded += 1
        continue
      }

      if (!pageText) {
        await doc.ref.update({ audioStatus: 'error', audioUrl: null })
        pagesProcessed += 1
        continue
      }

      pagesProcessed += 1

      try {
        const audioUrl = await generateAudioForPage(
          storyId,
          pageIndex,
          pageText,
          storyVoiceId,
          storyLanguage,
        )
        if (audioUrl) {
          await doc.ref.update({ audioUrl, audioStatus: 'ready' })
          pagesSucceeded += 1
        } else {
          await doc.ref.update({ audioStatus: 'error', audioUrl: null })
        }
      } catch (pageError) {
        console.error(`Error generating audio for page ${pageIndex} in story ${storyId}:`, pageError)
        await doc.ref.update({
          audioStatus: 'error',
          audioUrl: null,
          audioError: pageError?.message || 'Audio generation failed',
        })
      }
    }

    const finalStatus = pagesSucceeded === pagesSnap.size ? 'ready' : 'error'
    if (finalStatus !== 'ready') {
      await storyRef.update({
        hasFullAudio: false,
        audioStatus: finalStatus,
        fullAudioUrl: null,
      })

      return res.json({
        success: true,
        audioStatus: finalStatus,
        pagesProcessed,
        pagesSucceeded,
      })
    }

    try {
      await storyRef.update({
        hasFullAudio: false,
        audioStatus: 'processing',
        fullAudioUrl: null,
      })

      const wavBuffers = []

      for (const doc of pagesSnap.docs) {
        const data = doc.data() || {}
        const pageIndex = data.index ?? Number(doc.id) ?? 0
        const bucketPath = `guidebooks/${storyId}/page_${pageIndex}.mp3`
        const wavBuffer = await downloadPageAudioAsWav(bucketPath)
        wavBuffers.push(wavBuffer)
      }

      const mergedWavBuffer = await mergeWavBuffers(wavBuffers)

      if (!mergedWavBuffer) {
        throw new Error('No audio buffers available to merge')
      }

      const fullAudioBuffer = await encodeMergedWavToMp3(mergedWavBuffer)
      const fullAudioUrl = await saveFullAudioForStory(uid, storyId, fullAudioBuffer)

      await storyRef.update({
        hasFullAudio: true,
        audioStatus: 'ready',
        fullAudioUrl,
      })

      try {
        const transcriptResult = await transcribeWithWhisper({
          audioUrl: fullAudioUrl,
          languageCode: storyData?.language || storyData?.outputLanguage,
        })

        const transcriptRef = storyRef.collection('transcripts').doc('intensive')
        const timestamp = admin.firestore.FieldValue.serverTimestamp()

        await transcriptRef.set(
          {
            text: transcriptResult?.text || '',
            segments: Array.isArray(transcriptResult?.segments)
              ? transcriptResult.segments
              : [],
            sentenceSegments: Array.isArray(transcriptResult?.sentenceSegments)
              ? transcriptResult.sentenceSegments
              : buildSentenceSegmentsFromWhisper(
                  normaliseTranscriptSegments(transcriptResult?.segments || []),
                ),
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          { merge: true },
        )
      } catch (transcriptError) {
        console.error('Failed to generate Whisper transcript for story', transcriptError)
      }

      return res.json({
        success: true,
        audioStatus: 'ready',
        pagesProcessed,
        pagesSucceeded,
        fullAudioUrl,
      })
    } catch (mergeError) {
      console.error('Error merging full audiobook:', mergeError)

      await storyRef.update({
        audioStatus: 'error',
        hasFullAudio: false,
        fullAudioUrl: null,
      })

      return res.status(500).json({ error: 'Failed to merge full audiobook' })
    }
  } catch (error) {
    console.error('Error generating full audiobook:', error)
    if (storyRef) {
      await storyRef.update({
        audioStatus: 'error',
        hasFullAudio: false,
        fullAudioUrl: null,
      })
    }
    return res.status(500).json({ error: 'Failed to generate audiobook' })
  }
})

app.post('/api/delete-story', async (req, res) => {
  let storyRef

  try {
    const { uid, storyId } = req.body || {}

    if (!uid || !storyId) {
      return res.status(400).json({ error: 'uid and storyId are required' })
    }

    storyRef = firestore.collection('users').doc(uid).collection('stories').doc(storyId)
    const storySnap = await storyRef.get()

    if (!storySnap.exists) {
      return res.status(404).json({ error: 'Story not found' })
    }

    // Delete all pages in batches of <= 500
    const pagesRef = storyRef.collection('pages')
    const pagesSnap = await pagesRef.get()

    let batch = firestore.batch()
    let counter = 0

    for (const docSnap of pagesSnap.docs) {
      batch.delete(docSnap.ref)
      counter++

      // Firestore only allows 500 operations per batch
      if (counter === 500) {
        await batch.commit()
        batch = firestore.batch()
        counter = 0
      }
    }

    // Commit any remaining deletes
    if (counter > 0) {
      await batch.commit()
    }

    // Delete audio file (ignore if missing)
    const audioFilePath = `audio/full/${uid}/${storyId}.mp3`
    const audioFile = bucket.file(audioFilePath)
    try {
      await audioFile.delete({ ignoreNotFound: true })
    } catch (audioErr) {
      console.error('Error deleting audio file (ignored):', {
        message: audioErr?.message,
        code: audioErr?.code,
        stack: audioErr?.stack,
      })
    }

    // Delete the story doc itself
    await storyRef.delete()

    return res.json({ success: true })
  } catch (error) {
    console.error('Error deleting story:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    })

    return res.status(500).json({
      error: error?.message || 'Failed to delete story',
      code: error?.code || null,
    })
  }
})

app.listen(4000, () => {
  console.log('Proxy running on http://localhost:4000')
})
