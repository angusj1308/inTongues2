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
import ytdl from '@distube/ytdl-core'
import { existsSync } from 'fs'
import OpenAI from 'openai'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { generateBible, generateChapterWithValidation, buildPreviousContext } from './novelGenerator.js'
import { WebSocketServer } from 'ws'
import http from 'http'

// Non-import statements must come after all imports
const require = createRequire(import.meta.url)
const { EPub } = require('epub2')
dotenv.config()

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

// Initialize Firebase Admin conditionally
let bucket = null
let firestore = null
const serviceAccountPath = new URL('./serviceAccountKey.json', import.meta.url).pathname
if (existsSync(serviceAccountPath)) {
  const serviceAccount = require('./serviceAccountKey.json')
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'intongues2.firebasestorage.app',
    })
  }
  bucket = admin.storage().bucket()
  firestore = admin.firestore()
} else {
  console.warn('Warning: serviceAccountKey.json not found. Firebase Admin features disabled.')
}

export { bucket }

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
  if (!targetLang || targetLang === 'auto') return null  // Let Whisper auto-detect

  // Case-insensitive lookup for language names
  const lowered = targetLang.toLowerCase()
  for (const [name, code] of Object.entries(LANGUAGE_NAME_TO_CODE)) {
    if (name.toLowerCase() === lowered) {
      return code
    }
  }

  // Check if it's already a valid language code
  if (SUPPORTED_LANGUAGE_CODES.has(targetLang)) return targetLang
  if (SUPPORTED_LANGUAGE_CODES.has(lowered)) return lowered

  return null  // Unknown language - let Whisper auto-detect
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

let client = null
if (process.env.OPENAI_API_KEY) {
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
} else {
  console.warn('Warning: OPENAI_API_KEY not set. OpenAI features disabled.')
}

const ADAPTATION_SYSTEM_PROMPT = `
You are adapting a book for language learners. Write only in the requested target language.

LEVELS:
- Native: Faithful translation. Preserve the author's style, sentence structure, and vocabulary complexity. No simplification.
- Intermediate: Simplify vocabulary and clarify implicit meaning. Keep most structure but may split complex sentences. Natural, clear prose.
- Beginner: Short sentences, common words, explicit meaning. Freely restructure and split complex ideas.

FREEDOMS:
- Use any vocabulary that conveys the same meaning
- Restructure sentences, split clauses, reorder ideas
- Not bound by the author's syntax or word choices
- Only bound by meaning and appropriate grading

NEVER:
- Skip sentences or omit concepts from the original
- Summarize multiple sentences into one
- Remove dialogue, descriptions, events, or character actions
- Add content not present in the original
- Omit names, places, or plot-critical details

ALWAYS:
- Represent every concept from the source
- Preserve all proper nouns exactly as written
- Maintain the same narrative beats
- Use natural punctuation and full sentences
- Return only adapted text with no commentary or markup
`

// Map legacy CEFR levels to new simplified levels
function mapLevelToSimplified(level) {
  const normalized = (level || '').toUpperCase().trim()
  if (['A1', 'A2'].includes(normalized) || normalized === 'BEGINNER') return 'Beginner'
  if (['B1', 'B2'].includes(normalized) || normalized === 'INTERMEDIATE') return 'Intermediate'
  if (['C1', 'C2'].includes(normalized) || normalized === 'NATIVE') return 'Native'
  // Default to Intermediate if unrecognized
  return 'Intermediate'
}

const app = express()
app.use(express.json({ limit: '50mb' }))

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

// Default voice IDs for imported content (YouTube, Spotify, etc.)
// Uses male voice as default per language
const DEFAULT_IMPORT_VOICE_IDS = {
  english: 'NFG5qt843uXKj4pFvR7C',
  spanish: 'kulszILr6ees0ArU8miO',
  french: 'UBXZKOKbt62aLQHhc1Jm',
  italian: 'W71zT1VwIFFx3mMGH2uZ',
}

// Normalize word for use in Firestore document keys
function normalizeWordForKey(word) {
  if (!word || typeof word !== 'string') return ''
  return word
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

// Generate key for pronunciation document
function getPronunciationKey(word, targetLanguage, voiceId) {
  const normalizedWord = normalizeWordForKey(word)
  const normalizedLang = (targetLanguage || '').toLowerCase().trim()
  return `${normalizedLang}_${voiceId}_${normalizedWord}`
}

// Generate key for translation document
function getTranslationKey(word, targetLanguage, nativeLanguage) {
  const normalizedWord = normalizeWordForKey(word)
  const normalizedTargetLang = (targetLanguage || '').toLowerCase().trim()
  const normalizedNativeLang = (nativeLanguage || '').toLowerCase().trim()
  return `${normalizedTargetLang}_${normalizedNativeLang}_${normalizedWord}`
}

// Get pronunciation from cache
async function getPronunciation(word, targetLanguage, voiceId) {
  const key = getPronunciationKey(word, targetLanguage, voiceId)
  if (!key) return null

  try {
    const docRef = firestore.collection('pronunciations').doc(key)
    const docSnap = await docRef.get()
    if (!docSnap.exists) return null
    return docSnap.data()
  } catch (err) {
    console.error('Error fetching pronunciation:', err)
    return null
  }
}

// Get translation from cache
async function getTranslation(word, targetLanguage, nativeLanguage) {
  const key = getTranslationKey(word, targetLanguage, nativeLanguage)
  if (!key) return null

  try {
    const docRef = firestore.collection('translations').doc(key)
    const docSnap = await docRef.get()
    if (!docSnap.exists) return null
    return docSnap.data()
  } catch (err) {
    console.error('Error fetching translation:', err)
    return null
  }
}

// Save pronunciation to Firestore + Cloud Storage
async function savePronunciation(word, targetLanguage, voiceId, audioBuffer) {
  const key = getPronunciationKey(word, targetLanguage, voiceId)
  if (!key || !audioBuffer) return null

  try {
    // Upload to Cloud Storage
    const storagePath = `pronunciations/${key}.mp3`
    const file = bucket.file(storagePath)
    await file.save(audioBuffer, {
      contentType: 'audio/mpeg',
      metadata: { cacheControl: 'public, max-age=31536000' },
    })
    await file.makePublic()
    const audioUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`

    // Save reference to Firestore
    const docRef = firestore.collection('pronunciations').doc(key)
    await docRef.set({
      word: word.trim().toLowerCase(),
      targetLanguage: targetLanguage.toLowerCase().trim(),
      voiceId,
      audioUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return audioUrl
  } catch (err) {
    console.error('Error saving pronunciation:', err)
    return null
  }
}

// Save translation to Firestore
async function saveTranslation(word, targetLanguage, nativeLanguage, translationText) {
  const key = getTranslationKey(word, targetLanguage, nativeLanguage)
  if (!key || !translationText) return false

  try {
    const docRef = firestore.collection('translations').doc(key)
    await docRef.set({
      word: word.trim().toLowerCase(),
      targetLanguage: targetLanguage.toLowerCase().trim(),
      nativeLanguage: nativeLanguage.toLowerCase().trim(),
      translation: translationText,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return true
  } catch (err) {
    console.error('Error saving translation:', err)
    return false
  }
}

// Batch check which pronunciations are missing from cache
async function getMissingPronunciations(words, targetLanguage, voiceId) {
  if (!words || !words.length) return []

  const missing = []
  const batchSize = 10

  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize)
    const checks = await Promise.all(
      batch.map(async (word) => {
        const exists = await getPronunciation(word, targetLanguage, voiceId)
        return { word, exists: !!exists }
      })
    )
    checks.forEach(({ word, exists }) => {
      if (!exists) missing.push(word)
    })
  }

  return missing
}

// Batch check which translations are missing from cache
async function getMissingTranslations(words, targetLanguage, nativeLanguage) {
  if (!words || !words.length) return []

  const missing = []
  const batchSize = 10

  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize)
    const checks = await Promise.all(
      batch.map(async (word) => {
        const exists = await getTranslation(word, targetLanguage, nativeLanguage)
        return { word, exists: !!exists }
      })
    )
    checks.forEach(({ word, exists }) => {
      if (!exists) missing.push(word)
    })
  }

  return missing
}

// Batch fetch pronunciations from cache
async function batchGetPronunciations(words, targetLanguage, voiceId) {
  if (!words || !words.length) return {}

  const results = {}
  const batchSize = 10

  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize)
    const fetched = await Promise.all(
      batch.map(async (word) => {
        const data = await getPronunciation(word, targetLanguage, voiceId)
        return { word: word.trim().toLowerCase(), data }
      })
    )
    fetched.forEach(({ word, data }) => {
      // Return just the audioUrl string, not the full object
      if (data && data.audioUrl) results[word] = data.audioUrl
    })
  }

  return results
}

// Batch fetch translations from cache
async function batchGetTranslations(words, targetLanguage, nativeLanguage) {
  if (!words || !words.length) return {}

  const results = {}
  const batchSize = 10

  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize)
    const fetched = await Promise.all(
      batch.map(async (word) => {
        const data = await getTranslation(word, targetLanguage, nativeLanguage)
        return { word: word.trim().toLowerCase(), data }
      })
    )
    fetched.forEach(({ word, data }) => {
      // Return just the translation string, not the full object
      if (data && data.translation) results[word] = data.translation
    })
  }

  return results
}

// =====================================================
// EXPRESSION DETECTION SYSTEM
// Identifies idiomatic expressions in content
// =====================================================

// Generate a key for expression storage: language_normalized_expression
function getExpressionKey(expression, language) {
  if (!expression || !language) return null
  const normalizedExpr = expression.trim().toLowerCase().replace(/\s+/g, '_')
  const normalizedLang = language.trim().toLowerCase()
  return `${normalizedLang}_${normalizedExpr}`
}

// Get expression from cache
async function getExpression(expression, language) {
  const key = getExpressionKey(expression, language)
  if (!key) return null

  try {
    const docRef = firestore.collection('expressions').doc(key)
    const docSnap = await docRef.get()
    if (!docSnap.exists) return null
    return docSnap.data()
  } catch (err) {
    console.error('Error fetching expression:', err)
    return null
  }
}

// Save expression to Firestore
async function saveExpression(expression, language, meaning, literal = null) {
  const key = getExpressionKey(expression, language)
  if (!key || !meaning) return false

  try {
    const docRef = firestore.collection('expressions').doc(key)
    await docRef.set({
      text: expression.trim().toLowerCase(),
      language: language.toLowerCase().trim(),
      meaning: meaning,
      literal: literal,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    return true
  } catch (err) {
    console.error('Error saving expression:', err)
    return false
  }
}

// Get all expressions for a language
async function getExpressionsForLanguage(language) {
  if (!language) return []

  try {
    const normalizedLang = language.trim().toLowerCase()
    const snapshot = await firestore.collection('expressions')
      .where('language', '==', normalizedLang)
      .get()

    return snapshot.docs.map(doc => doc.data())
  } catch (err) {
    console.error('Error fetching expressions for language:', err)
    return []
  }
}

// Batch fetch expressions that appear in text
async function getExpressionsInText(text, language) {
  if (!text || !language) return []

  const expressions = await getExpressionsForLanguage(language)
  const normalizedText = text.toLowerCase()

  return expressions.filter(expr =>
    normalizedText.includes(expr.text.toLowerCase())
  )
}

// LLM-powered expression detection
async function detectExpressionsWithLLM(text, language, nativeLanguage = 'english') {
  if (!text || !language) return []

  try {
    const prompt = `Analyze this ${language} text and identify ALL multi-word combinations where the meaning differs from the literal sum of the individual words.

A learner might know each word separately but still not understand the combination. Find these.

TEXT:
${text}

For each expression found, provide:
1. The exact expression as it appears in the text (lowercase)
2. Its actual meaning in ${nativeLanguage}
3. A literal word-by-word translation (to show the gap between literal and actual meaning)

Return a JSON array of objects with keys: "expression", "meaning", "literal"

Types to look for (works for any language):
- Idioms: ES "dar en el clavo" = "get it right", FR "coûter les yeux de la tête" = "cost a fortune"
- Phrasal verbs: EN "give up" = "surrender", "look after" = "care for"
- Verb + preposition: ES "pensar en" = "think about", IT "contare su" = "rely on"
- Verb + noun: ES "hacer caso" = "pay attention", FR "faire attention" = "be careful"
- Fixed phrases: ES "sin embargo" = "however", IT "a proposito" = "by the way"
- Collocations: ES "echar de menos" = "miss someone", FR "avoir envie de" = "want to"
- Any word combination where the meaning ≠ sum of literal parts

The key test: Would a learner who knows each word individually still fail to understand the combination?

Return an empty array [] if no such expressions are found.
Return ONLY valid JSON, no other text.`

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: prompt,
      text: { format: { type: 'json_object' } },
    })

    let expressions = []

    // Try to parse the response
    const contentBlocks = response?.output?.[0]?.content || []
    const jsonBlock = contentBlocks.find((block) =>
      block?.type === 'output_json' || block?.type === 'json'
    )

    let payload = jsonBlock?.output_json || jsonBlock?.json

    if (!payload) {
      const textBlock = contentBlocks.find((block) => typeof block?.text === 'string')
      const candidateText = textBlock?.text || response?.output_text
      if (candidateText) {
        try {
          payload = JSON.parse(candidateText)
        } catch (err) {
          console.error('Failed to parse expression detection response:', err)
          return []
        }
      }
    }

    // Handle both array and object with expressions key
    if (Array.isArray(payload)) {
      expressions = payload
    } else if (payload && Array.isArray(payload.expressions)) {
      expressions = payload.expressions
    }

    // Validate and normalize
    return expressions
      .filter(e => e && e.expression && e.meaning)
      .map(e => ({
        expression: e.expression.trim().toLowerCase(),
        meaning: e.meaning.trim(),
        literal: e.literal ? e.literal.trim() : null,
      }))
  } catch (err) {
    console.error('Error detecting expressions with LLM:', err)
    return []
  }
}

// Detect and save expressions from text content
async function detectAndSaveExpressions(text, language, nativeLanguage = 'english') {
  if (!text || !language) return []

  console.log(`Detecting expressions in ${language} text (${text.length} chars)...`)

  // Detect expressions using LLM
  const detectedExpressions = await detectExpressionsWithLLM(text, language, nativeLanguage)

  console.log(`Found ${detectedExpressions.length} expressions`)

  // Save each expression to the database
  const savedExpressions = []
  for (const expr of detectedExpressions) {
    const saved = await saveExpression(expr.expression, language, expr.meaning, expr.literal)
    if (saved) {
      savedExpressions.push(expr.expression)
    }
  }

  return savedExpressions
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

      const result = {
        start,
        end: end > start ? end : start,
        text: (segment.text || '').trim(),
      }

      // Preserve word-level timing if present
      if (Array.isArray(segment.words) && segment.words.length > 0) {
        result.words = segment.words.map((w) => ({
          text: (w.text || '').trim(),
          start: Number(w.start) || start,
          end: Number(w.end) || end,
        }))
      }

      return result
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

    // Trigger content preparation (pronunciation caching) if we have lyrics and language
    const transcriptLang = basePayload.transcriptLanguage || basePayload.language
    const normalizedLang = transcriptLang ? normalizeLanguageLabel(transcriptLang)?.toLowerCase() : null
    const hasContent = basePayload.transcriptStatus === 'ready' || lyricsPages.length > 0

    if (hasContent && normalizedLang && DEFAULT_IMPORT_VOICE_IDS[normalizedLang]) {
      try {
        // Set initial preparation status
        await itemRef.update({
          preparationStatus: 'pending',
          preparationProgress: 0,
        })

        // Trigger preparation asynchronously (don't await)
        prepareContentPronunciations(uid, spotifyId, 'spotify', normalizedLang, null)
          .catch((prepErr) => {
            console.error('Background Spotify preparation failed:', prepErr)
          })
      } catch (prepInitError) {
        console.error('Failed to initialize Spotify preparation:', prepInitError)
      }
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
  // Fetch the YouTube video page directly to get caption data
  const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`
  console.log('Fetching YouTube page for captions:', videoId)

  const pageResponse = await fetch(videoPageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  if (!pageResponse.ok) {
    throw new Error(`Failed to fetch YouTube page: ${pageResponse.status}`)
  }

  const pageHtml = await pageResponse.text()

  // Extract ytInitialPlayerResponse from the page - need greedy match for full JSON
  const startMarker = 'ytInitialPlayerResponse = '
  const startIndex = pageHtml.indexOf(startMarker)
  if (startIndex === -1) {
    throw new Error('Could not find player response in YouTube page')
  }

  // Find the JSON object by matching braces
  const jsonStart = startIndex + startMarker.length
  let braceCount = 0
  let jsonEnd = jsonStart
  let inString = false
  let escapeNext = false

  for (let i = jsonStart; i < pageHtml.length; i++) {
    const char = pageHtml[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"' && !escapeNext) {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') braceCount++
      if (char === '}') {
        braceCount--
        if (braceCount === 0) {
          jsonEnd = i + 1
          break
        }
      }
    }
  }

  const jsonStr = pageHtml.substring(jsonStart, jsonEnd)

  let playerResponse
  try {
    playerResponse = JSON.parse(jsonStr)
  } catch (e) {
    console.error('JSON parse error at position:', e.message)
    throw new Error('Failed to parse player response JSON')
  }

  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
  console.log('Found', tracks.length, 'caption tracks')

  if (!tracks.length) return []

  // Convert language name to code
  const requestedLang = (languageCode || '').trim().toLowerCase()
  let langCode = null
  for (const [name, code] of Object.entries(LANGUAGE_NAME_TO_CODE)) {
    if (name.toLowerCase() === requestedLang) {
      langCode = code
      break
    }
  }
  langCode = langCode || requestedLang

  console.log('REQUESTED LANGUAGE:', languageCode, '→ CODE:', langCode)

  // Find best matching track
  const manualTrackForLang = tracks.find((track) =>
    track.languageCode?.toLowerCase() === langCode && track.kind !== 'asr'
  )
  const matchByLangCode = tracks.find((track) => track.languageCode?.toLowerCase() === langCode)
  const asrTrackForLang = tracks.find((track) =>
    track.languageCode?.toLowerCase() === langCode && track.kind === 'asr'
  )
  const anyAsrTrack = tracks.find((track) => track.kind === 'asr')
  const fallbackTrack = tracks[0]

  const selectedTrack = manualTrackForLang || matchByLangCode || asrTrackForLang || anyAsrTrack || fallbackTrack

  console.log('SELECTED TRACK:', selectedTrack?.languageCode, selectedTrack?.kind)

  if (!selectedTrack?.baseUrl) return []

  // Fetch the caption XML with full browser headers
  const trackUrl = selectedTrack.baseUrl
  console.log('Fetching caption URL:', trackUrl.substring(0, 100) + '...')

  const captionResponse = await fetch(trackUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.youtube.com/',
    },
  })

  console.log('Caption response status:', captionResponse.status, captionResponse.statusText)

  if (!captionResponse.ok) {
    throw new Error(`Failed to fetch captions: ${captionResponse.status}`)
  }

  const captionXml = await captionResponse.text()
  console.log('Caption response length:', captionXml.length, 'First 200 chars:', captionXml.substring(0, 200))

  if (!captionXml || captionXml.length === 0) {
    throw new Error('Empty caption response')
  }

  // Parse XML: <text start="0" dur="2.5">Hello world</text>
  const segments = []
  const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([^<]*)<\/text>/g
  let match

  while ((match = textRegex.exec(captionXml)) !== null) {
    const start = parseFloat(match[1])
    const duration = parseFloat(match[2])
    const text = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim()

    if (text) {
      segments.push({
        start,
        end: start + duration,
        text,
        words: [{ text, start, end: start + duration }],
      })
    }
  }

  console.log('Parsed', segments.length, 'caption segments')
  return segments
}

// Use yt-dlp to download subtitles directly (doesn't require ffmpeg)
async function downloadYoutubeSubtitles(videoId, languageCode = 'en') {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const tempBase = path.join(os.tmpdir(), `yt-subs-${videoId}-${Date.now()}`)

  console.log('Downloading YouTube subtitles via yt-dlp:', videoId)

  return new Promise((resolve, reject) => {
    const ytProcess = spawn('yt-dlp', [
      '--write-auto-subs',
      '--write-subs',
      '--sub-langs', languageCode,
      '--skip-download',
      '-o', tempBase,
      videoUrl
    ])

    let stderr = ''
    ytProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ytProcess.on('error', (err) => {
      console.error('yt-dlp subtitle spawn error:', err)
      reject(err)
    })

    ytProcess.on('close', async (code) => {
      // yt-dlp returns 0 even if no subs found, so we check for file existence
      try {
        const downloadDir = path.dirname(tempBase)
        const baseName = path.basename(tempBase)
        const entries = await fs.readdir(downloadDir)

        // Look for .vtt or .srt files
        const subFiles = entries.filter((name) =>
          name.startsWith(baseName) && (name.endsWith('.vtt') || name.endsWith('.srt'))
        )

        if (subFiles.length === 0) {
          console.log('No subtitle files found for video')
          return resolve([])
        }

        const subPath = path.join(downloadDir, subFiles[0])
        console.log('Found subtitle file:', subPath)

        const subContent = await fs.readFile(subPath, 'utf-8')

        // Clean up
        await fs.unlink(subPath).catch(() => {})

        // Parse VTT/SRT format
        const segments = parseSubtitleFile(subContent)
        console.log('Parsed', segments.length, 'subtitle segments from yt-dlp')

        resolve(segments)
      } catch (fileError) {
        console.error('Subtitle file error:', fileError)
        resolve([])
      }
    })
  })
}

function parseSubtitleFile(content) {
  const segments = []

  // VTT format: 00:00:00.000 --> 00:00:02.500
  // SRT format: 00:00:00,000 --> 00:00:02,500
  const timeRegex = /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/g
  const lines = content.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/)

    if (timeMatch) {
      const start = parseTimestamp(timeMatch[1])
      const end = parseTimestamp(timeMatch[2])

      // Collect text lines until empty line or next timestamp
      const textLines = []
      i++
      while (i < lines.length && lines[i].trim() && !lines[i].match(/^\d{2}:\d{2}:\d{2}/)) {
        // Skip VTT positioning tags like <c> or alignment tags
        const cleanedLine = lines[i]
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
        if (cleanedLine) {
          textLines.push(cleanedLine)
        }
        i++
      }

      const text = textLines.join(' ').trim()
      if (text) {
        segments.push({
          start,
          end,
          text,
          words: [{ text, start, end }]
        })
      }
    } else {
      i++
    }
  }

  return segments
}

function parseTimestamp(ts) {
  // Handle both 00:00:00.000 (VTT) and 00:00:00,000 (SRT)
  const normalized = ts.replace(',', '.')
  const parts = normalized.split(':')
  const hours = parseInt(parts[0], 10)
  const minutes = parseInt(parts[1], 10)
  const secondsParts = parts[2].split('.')
  const seconds = parseInt(secondsParts[0], 10)
  const ms = parseInt(secondsParts[1], 10)

  return hours * 3600 + minutes * 60 + seconds + ms / 1000
}

async function downloadYoutubeAudio(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const tempBase = path.join(os.tmpdir(), `yt-audio-${videoId}-${Date.now()}`)
  const downloadPath = `${tempBase}.mp3`
  const compressedPath = `${tempBase}-compressed.mp3`

  console.log('Downloading YouTube audio:', videoId, '→', downloadPath)

  // Step 1: Download audio with yt-dlp
  await new Promise((resolve, reject) => {
    const ytProcess = spawn('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '-o', downloadPath,
      videoUrl
    ])

    let stderr = ''
    ytProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ytProcess.on('error', (err) => {
      console.error('yt-dlp spawn error:', err)
      reject(err)
    })

    ytProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('yt-dlp stderr:', stderr)
        return reject(new Error(`yt-dlp exited with code ${code}`))
      }
      resolve()
    })
  })

  // Step 2: Check file size
  const stat = await fs.stat(downloadPath)
  console.log('Downloaded audio:', `${(stat.size / 1024 / 1024).toFixed(1)}MB`)

  // Step 3: If over 24MB, compress with ffmpeg for Whisper's 25MB limit
  const MAX_SIZE = 24 * 1024 * 1024 // 24MB
  if (stat.size > MAX_SIZE) {
    console.log('File too large for Whisper API, compressing...')

    await new Promise((resolve, reject) => {
      // Compress to 16kbps mono 16kHz - optimized for speech, ensures under 25MB
      const ffmpeg = spawn('ffmpeg', [
        '-i', downloadPath,
        '-ac', '1',           // mono
        '-ar', '16000',       // 16kHz sample rate
        '-b:a', '16k',        // 16kbps bitrate (halved for long videos)
        '-y',                 // overwrite output
        compressedPath
      ])

      ffmpeg.on('error', reject)
      ffmpeg.on('close', (code) => {
        if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}`))
        else resolve()
      })
    })

    const compressedStat = await fs.stat(compressedPath)
    console.log('Compressed audio:', `${(compressedStat.size / 1024 / 1024).toFixed(1)}MB`)

    // Clean up original, return compressed
    await fs.unlink(downloadPath).catch(() => {})
    return compressedPath
  }

  return downloadPath
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

const MIN_SEGMENT_WORDS = 10
const MAX_SEGMENT_WORDS = 25

function countWords(text) {
  if (!text?.trim()) return 0
  return text.trim().split(/\s+/).length
}

/**
 * Split a long sentence at natural break points (commas, semicolons, conjunctions)
 */
function splitLongSentence(text, minWords, maxWords) {
  const words = text.split(/\s+/)
  if (words.length <= maxWords) return [text]

  const result = []
  let current = []

  for (let i = 0; i < words.length; i++) {
    current.push(words[i])

    // Check if we're at a natural break point and have enough words
    const isNaturalBreak = /[,;:]$/.test(words[i]) ||
      /^(and|but|or|so|yet|because|although|while|when|if|then|however|therefore|moreover|furthermore|additionally|consequently|thus|hence|meanwhile|otherwise|instead|rather|indeed|y|pero|o|porque|aunque|cuando|si|entonces|sin embargo|por lo tanto|además|por consiguiente|mientras|de lo contrario|en cambio|de hecho)$/i.test(words[i + 1] || '')

    if (current.length >= minWords && (current.length >= maxWords || (isNaturalBreak && current.length >= minWords))) {
      result.push(current.join(' '))
      current = []
    }
  }

  // Handle remaining words
  if (current.length > 0) {
    if (result.length > 0 && current.length < minWords) {
      // Combine with previous if too short
      result[result.length - 1] = `${result[result.length - 1]} ${current.join(' ')}`
    } else {
      result.push(current.join(' '))
    }
  }

  return result
}

/**
 * Split text into sentences with min/max word constraints
 * - Minimum 10 words: if a sentence is too short, combine with next
 * - Maximum 25 words: if a sentence is too long, split at natural breaks
 */
function splitIntoSentences(text) {
  if (!text?.trim()) return []

  // First, split on sentence-ending punctuation followed by space or end
  const rawSentences = (text || '')
    .split(/(?<=[.!?¡¿…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const result = []
  let buffer = ''

  for (let i = 0; i < rawSentences.length; i++) {
    const sentence = rawSentences[i]
    const combined = buffer ? `${buffer} ${sentence}` : sentence
    const wordCount = countWords(combined)

    if (wordCount <= MAX_SEGMENT_WORDS) {
      // Combined is within max limit
      if (wordCount >= MIN_SEGMENT_WORDS) {
        // Meets minimum, add to result
        result.push(combined)
        buffer = ''
      } else {
        // Still under minimum, keep buffering
        buffer = combined
      }
    } else {
      // Combined exceeds max
      if (buffer) {
        // First, flush the buffer if it meets minimum
        if (countWords(buffer) >= MIN_SEGMENT_WORDS) {
          result.push(buffer)
          buffer = ''
        }
      }

      // Now handle the current sentence
      const currentWords = countWords(buffer ? `${buffer} ${sentence}` : sentence)
      if (currentWords > MAX_SEGMENT_WORDS) {
        // Need to split this sentence
        const textToSplit = buffer ? `${buffer} ${sentence}` : sentence
        const splitParts = splitLongSentence(textToSplit, MIN_SEGMENT_WORDS, MAX_SEGMENT_WORDS)
        result.push(...splitParts)
        buffer = ''
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence
      }
    }
  }

  // Handle remaining buffer
  if (buffer) {
    if (result.length > 0 && countWords(buffer) < MIN_SEGMENT_WORDS) {
      // Combine with last result if buffer is too short
      const lastWordCount = countWords(result[result.length - 1])
      if (lastWordCount + countWords(buffer) <= MAX_SEGMENT_WORDS) {
        result[result.length - 1] = `${result[result.length - 1]} ${buffer}`
      } else {
        // Just add it even if short - last sentence exception
        result.push(buffer)
      }
    } else {
      result.push(buffer)
    }
  }

  return result
}

// Check if text has adequate punctuation for sentence splitting
function hasAdequatePunctuation(text) {
  if (!text || text.length < 100) return true
  const punctuationCount = (text.match(/[.!?]/g) || []).length
  const wordCount = text.split(/\s+/).length
  // Expect roughly 1 sentence-ending punctuation per 15-25 words
  const expectedPunctuation = wordCount / 20
  return punctuationCount >= expectedPunctuation * 0.5
}

// Use AI to segment unpunctuated transcript into proper sentences
async function segmentWithAI(text) {
  if (!text || text.length < 50) return [text]

  // Check if already has adequate punctuation - if so, use standard splitting
  if (hasAdequatePunctuation(text)) {
    console.log('Text already has adequate punctuation, using standard split')
    return splitIntoSentences(text)
  }

  console.log('Segmenting with AI for', text.length, 'characters')

  // Process in chunks if text is very long (GPT has token limits)
  const MAX_CHUNK = 8000 // characters per chunk
  const chunks = []
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK))
  }

  const allSentences = []

  for (const chunk of chunks) {
    try {
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: `Segment this transcript into individual sentences. Output ONE SENTENCE PER LINE.

Rules:
- Each line should be a complete, natural sentence
- Aim for sentences of 10-25 words each
- Keep the exact same words, just add line breaks between sentences
- Add periods at the end of each sentence

Transcript:
${chunk}

Output each sentence on its own line:`,
      })

      const segmentedText = response.output_text?.trim()
      if (segmentedText) {
        const sentences = segmentedText
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0)
        allSentences.push(...sentences)
        console.log(`AI segmented chunk into ${sentences.length} sentences`)
      }
    } catch (error) {
      console.error('AI segmentation error:', error.message)
      // Fallback: split by length
      const fallbackSentences = splitByLength(chunk, 150)
      allSentences.push(...fallbackSentences)
    }
  }

  return allSentences.length > 0 ? allSentences : [text]
}

// Fallback: split long text by word count
function splitByLength(text, maxWords = 150) {
  const words = text.split(/\s+/)
  const sentences = []

  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(' ')
    if (chunk.trim()) {
      sentences.push(chunk.trim() + (chunk.endsWith('.') ? '' : '.'))
    }
  }

  return sentences
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
  const chunkPaths = []

  try {
    if (videoId) {
      audioPath = await downloadYoutubeAudio(videoId)
    } else if (audioUrl) {
      audioPath = await downloadAudioUrlToTempFile(audioUrl)
    }

    if (!audioPath) {
      throw new Error('No audio source provided for Whisper transcription')
    }

    // Get audio duration
    const duration = await getAudioDuration(audioPath)
    console.log(`Audio duration: ${(duration / 60).toFixed(1)} minutes`)

    // Convert language name to code for Whisper
    const whisperLanguage = resolveTargetCode(languageCode)
    console.log('WHISPER LANGUAGE:', languageCode, '→', whisperLanguage || 'auto-detect')

    const CHUNK_DURATION = 20 * 60 // 20 minutes in seconds
    let allSegments = []
    let fullText = ''

    if (duration > CHUNK_DURATION) {
      // Split into chunks for long audio
      const numChunks = Math.ceil(duration / CHUNK_DURATION)
      console.log(`Splitting into ${numChunks} chunks of ~20 minutes each`)

      for (let i = 0; i < numChunks; i++) {
        const startTime = i * CHUNK_DURATION
        const chunkPath = audioPath.replace('.mp3', `-chunk${i}.mp3`)
        chunkPaths.push(chunkPath)

        // Extract chunk with ffmpeg
        await new Promise((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-i', audioPath,
            '-ss', String(startTime),
            '-t', String(CHUNK_DURATION),
            '-c', 'copy',
            '-y',
            chunkPath
          ])
          ffmpeg.on('error', reject)
          ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg chunk failed`)))
        })

        console.log(`Transcribing chunk ${i + 1}/${numChunks}...`)

        const transcription = await client.audio.transcriptions.create({
          file: createReadStream(chunkPath),
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['word'],
          ...(whisperLanguage ? { language: whisperLanguage } : {}),
        })

        // Adjust timestamps for chunk offset
        const chunkSegments = buildSentencesFromWords(transcription?.words || [], transcription?.text || '')
        const offsetSegments = chunkSegments.map(seg => ({
          ...seg,
          start: seg.start + startTime,
          end: seg.end + startTime
        }))

        allSegments.push(...offsetSegments)
        fullText += (fullText ? ' ' : '') + (transcription?.text || '')

        console.log(`Chunk ${i + 1} complete: ${chunkSegments.length} segments`)
      }
    } else {
      // Single transcription for short audio
      console.log('Sending audio to Whisper API:', audioPath)

      const transcription = await client.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
        ...(whisperLanguage ? { language: whisperLanguage } : {}),
      })

      // Debug: log Whisper response structure
      console.log('Whisper response keys:', Object.keys(transcription || {}))
      console.log('Whisper words count:', transcription?.words?.length || 0)
      if (transcription?.words?.length > 0) {
        console.log('Sample word:', JSON.stringify(transcription.words[0]))
      }

      allSegments = buildSentencesFromWords(transcription?.words || [], transcription?.text || '')
      fullText = transcription?.text || ''

      // Debug: check if segments have words
      if (allSegments.length > 0) {
        console.log('Sample segment words count:', allSegments[0]?.words?.length || 0)
      }
    }

    console.log('Total segments:', allSegments.length)
    return { text: fullText, segments: allSegments, sentenceSegments: allSegments }
  } catch (error) {
    console.error('Whisper API error:', error.message)
    console.error('Whisper API error details:', JSON.stringify(error, null, 2))
    throw error
  } finally {
    // Clean up all temp files
    const filesToClean = [audioPath, ...chunkPaths].filter(Boolean)
    for (const filePath of filesToClean) {
      try {
        await fs.unlink(filePath)
      } catch (e) {
        if (e?.code !== 'ENOENT') console.error('Cleanup error:', e)
      }
    }
  }
}

// Get audio duration in seconds using ffprobe
async function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ])

    let output = ''
    ffprobe.stdout.on('data', (data) => { output += data.toString() })
    ffprobe.on('error', reject)
    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(parseFloat(output.trim()) || 0)
      } else {
        reject(new Error('ffprobe failed'))
      }
    })
  })
}

// Align punctuation from full text to word-level timestamps
// Whisper's words[] don't include punctuation, but text does
function alignPunctuationToWords(fullText = '', words = []) {
  if (!words.length || !fullText) return words

  const enrichedWords = []
  let textPos = 0

  for (const word of words) {
    const rawWord = word.word || ''

    // Skip whitespace and leading punctuation in text
    let leadingPunct = ''
    while (textPos < fullText.length && /[\s¿¡"'«([—]/.test(fullText[textPos])) {
      const char = fullText[textPos]
      // Only add non-whitespace, and avoid duplicates of ¿ or ¡
      if (!/\s/.test(char)) {
        if ((char === '¿' || char === '¡') && leadingPunct.includes(char)) {
          // Skip duplicate opening punctuation
        } else {
          leadingPunct += char
        }
      }
      textPos++
    }

    // Find the word in text (case-insensitive match)
    const wordStart = fullText.toLowerCase().indexOf(rawWord.toLowerCase(), textPos)
    if (wordStart !== -1 && wordStart - textPos < 10) {
      textPos = wordStart + rawWord.length
    } else {
      textPos += rawWord.length
    }

    // Capture trailing punctuation
    let trailingPunct = ''
    while (textPos < fullText.length && /[.,;:!?)"'\]»—]/.test(fullText[textPos])) {
      trailingPunct += fullText[textPos]
      textPos++
    }

    // Clean up any duplicate opening punctuation (¿¿ → ¿, ¡¡ → ¡)
    const cleanedWord = (leadingPunct + rawWord + trailingPunct)
      .replace(/¿+/g, '¿')
      .replace(/¡+/g, '¡')

    enrichedWords.push({
      ...word,
      word: cleanedWord,
    })
  }

  return enrichedWords
}

// Build sentences from Whisper word-level timestamps
// Sentence breaks only on punctuation (. ? !)
function buildSentencesFromWords(words = [], fullText = '') {
  if (!words.length) return []

  // Enrich words with punctuation from full text
  const enrichedWords = alignPunctuationToWords(fullText, words)

  const sentences = []
  let currentWords = []

  for (let i = 0; i < enrichedWords.length; i++) {
    const word = enrichedWords[i]
    const nextWord = enrichedWords[i + 1]

    // Add word to current sentence
    currentWords.push({
      text: word.word || '',
      start: word.start || 0,
      end: word.end || 0,
    })

    // Check for sentence break conditions - only punctuation based
    const hasSentenceEnd = /[.?!]$/.test(word.word || '')

    // Break only on: sentence end punctuation or end of text
    const shouldBreak = hasSentenceEnd || !nextWord

    if (shouldBreak && currentWords.length > 0) {
      const text = currentWords.map(w => w.text).join(' ')
      sentences.push({
        start: currentWords[0].start,
        end: currentWords[currentWords.length - 1].end,
        text,
        words: currentWords,
      })
      currentWords = []
    }
  }

  return sentences
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

    // Trigger content preparation (pronunciation caching) for known languages
    const normalizedLang = normalizeLanguageLabel(languageCode)?.toLowerCase()
    if (normalizedLang && DEFAULT_IMPORT_VOICE_IDS[normalizedLang]) {
      try {
        // Set initial preparation status
        await videoRef.update({
          preparationStatus: 'pending',
          preparationProgress: 0,
          language: normalizedLang,
        })

        // Trigger preparation asynchronously (don't await)
        prepareContentPronunciations(uid, videoDocId, 'youtube', normalizedLang, null)
          .catch((prepErr) => {
            console.error('Background YouTube preparation failed:', prepErr)
          })
      } catch (prepInitError) {
        console.error('Failed to initialize YouTube preparation:', prepInitError)
      }
    }

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

// Lightweight transcript endpoint for Translation Practice feature
// Returns transcript without requiring user authentication or Firestore storage
app.post('/api/transcribe', async (req, res) => {
  const { url } = req.body || {}

  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  const videoId = extractYouTubeId(url)
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' })
  }

  try {
    // Get video info for title
    let title = null
    try {
      const info = await ytdl.getInfo(videoId)
      title = info?.videoDetails?.title || null
    } catch (infoErr) {
      console.error('Failed to fetch video info for title:', infoErr.message)
    }

    // Try YouTube captions first
    let transcriptResult = { text: '', segments: [] }

    try {
      const captionSegments = await fetchYoutubeCaptionSegments(videoId, 'en')
      if (captionSegments.length > 0) {
        transcriptResult = {
          text: captionSegments.map((seg) => seg.text).join(' '),
          segments: captionSegments,
        }
      }
    } catch (captionError) {
      console.error('Failed to fetch YouTube captions, will attempt Whisper fallback:', captionError.message)
    }

    // Fallback to Whisper if no captions
    if (!transcriptResult.segments || transcriptResult.segments.length === 0) {
      try {
        const whisperResult = await transcribeWithWhisper({ videoId, languageCode: 'en' })
        transcriptResult = {
          text: whisperResult?.text || '',
          segments: Array.isArray(whisperResult?.segments) ? whisperResult.segments : [],
        }
      } catch (whisperError) {
        console.error('Failed to transcribe with Whisper:', whisperError.message)
        return res.status(500).json({ error: 'Failed to fetch transcript from video' })
      }
    }

    if (!transcriptResult.segments || transcriptResult.segments.length === 0) {
      return res.status(500).json({ error: 'No transcript available for this video' })
    }

    return res.json({
      text: transcriptResult.text,
      segments: transcriptResult.segments,
      title,
    })
  } catch (error) {
    console.error('Transcribe endpoint error:', error)
    return res.status(500).json({ error: 'Failed to process video' })
  }
})

// Background transcript processing for Translation Practice YouTube imports
// Creates lesson immediately, then fetches transcript and updates the lesson
app.post('/api/transcribe/background', async (req, res) => {
  const { url, lessonId, uid } = req.body || {}

  if (!url || !lessonId || !uid) {
    return res.status(400).json({ error: 'url, lessonId, and uid are required' })
  }

  const videoId = extractYouTubeId(url)
  if (!videoId) {
    // Update lesson to failed status
    try {
      await firestore.collection('users').doc(uid).collection('practiceLessons').doc(lessonId).update({
        status: 'import_failed',
        importError: 'Invalid YouTube URL',
      })
    } catch (e) {
      console.error('Failed to update lesson status:', e)
    }
    return res.status(400).json({ error: 'Invalid YouTube URL' })
  }

  // Respond immediately - processing happens in background
  res.json({ status: 'processing', lessonId })

  // Background processing
  const lessonRef = firestore.collection('users').doc(uid).collection('practiceLessons').doc(lessonId)

  try {
    console.log(`Background import starting for lesson ${lessonId}, video ${videoId}`)

    // Use Whisper for transcription (returns punctuated text - fast and accurate)
    let segments = []
    try {
      console.log('Starting Whisper transcription...')
      const whisperResult = await transcribeWithWhisper({ videoId, languageCode: 'en' })
      segments = Array.isArray(whisperResult?.segments) ? whisperResult.segments : []
      console.log(`Whisper transcription complete: ${segments.length} segments`)
    } catch (whisperError) {
      console.error('Whisper transcription failed:', whisperError.message)
      await lessonRef.update({
        status: 'import_failed',
        importError: `Transcription failed: ${whisperError.message}. Ensure ffmpeg is installed.`,
      })
      return
    }

    if (segments.length === 0) {
      await lessonRef.update({
        status: 'import_failed',
        importError: 'No transcript available for this video',
      })
      return
    }

    // Combine all segment text into full transcript
    const fullTranscript = segments
      .map((seg) => seg.text?.trim())
      .filter((s) => s && s.length > 0)
      .join(' ')

    // Whisper returns punctuated text - use standard sentence splitting (instant)
    const sentenceTexts = splitIntoSentences(fullTranscript)
    const sentences = sentenceTexts.map((text, index) => ({
      index,
      text,
      status: 'pending',
    }))

    // Generate context summary for tutor feedback (AI analyzes and extracts relevant context)
    let contextSummary = ''
    try {
      console.log('Generating context summary...')
      const summaryResponse = await client.responses.create({
        model: 'gpt-4o-mini',
        input: `Analyze this transcript and write a brief context summary (150-200 words) that would help a language tutor provide accurate translations. The tutor needs to understand the context to give appropriate feedback.

Extract and describe whatever you find relevant - this might include:
- What type of content this is and the setting
- Who is speaking and who they're addressing
- The subject matter and any specialized terminology
- Time periods, cultural references, or proper nouns mentioned
- The tone and register being used
- Any other contextually important details

Transcript (first 8000 characters):
${fullTranscript.slice(0, 8000)}

Write the summary in a natural paragraph format:`,
      })
      contextSummary = summaryResponse.output_text?.trim() || ''
      console.log('Context summary generated:', contextSummary.slice(0, 100) + '...')
    } catch (summaryError) {
      console.error('Failed to generate context summary:', summaryError.message)
    }

    // Update the lesson with sentences, fullTranscript, contextSummary, and change status
    await lessonRef.update({
      sentences,
      fullTranscript,
      contextSummary,
      status: 'in_progress',
      importError: null,
    })

    console.log(`Background import complete for lesson ${lessonId}: ${sentences.length} sentences`)
  } catch (error) {
    console.error('Background transcript processing error:', error)
    try {
      await lessonRef.update({
        status: 'import_failed',
        importError: error.message || 'Failed to process video',
      })
    } catch (e) {
      console.error('Failed to update lesson status:', e)
    }
  }
})

// Background processor for YouTube transcript generation
// Called from import to prepare video before user opens it
async function processYouTubeTranscript(uid, videoDocId, videoId, languageCode = 'auto') {
  const videoRef = firestore.collection('users').doc(uid).collection('youtubeVideos').doc(videoDocId)

  try {
    const transcriptRef = videoRef.collection('transcripts').doc(languageCode.toLowerCase())

    let transcriptResult = { text: '', segments: [], sentenceSegments: [] }

    // Try YouTube captions first
    try {
      const captionSegments = await fetchYoutubeCaptionSegments(videoId, languageCode)
      transcriptResult = { text: captionSegments.map((seg) => seg.text).join(' '), segments: captionSegments }
    } catch (captionError) {
      console.error('Failed to fetch YouTube captions, will attempt Whisper fallback', captionError)
    }

    // Fall back to Whisper if no captions
    if (!transcriptResult.segments || transcriptResult.segments.length === 0) {
      const whisperResult = await transcribeWithWhisper({ videoId, languageCode })
      transcriptResult = {
        text: whisperResult?.text || '',
        segments: Array.isArray(whisperResult?.segments) ? whisperResult.segments : [],
        sentenceSegments: Array.isArray(whisperResult?.sentenceSegments) ? whisperResult.sentenceSegments : [],
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
      language: languageCode.toLowerCase(),
      segments: normalisedSegments,
      text: transcriptText,
      sentenceSegments: resolvedSentenceSegments,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    await transcriptRef.set(transcriptPayload, { merge: true })

    // Trigger pronunciation preparation if language supports it
    const normalizedLang = normalizeLanguageLabel(languageCode)?.toLowerCase()
    if (normalizedLang && DEFAULT_IMPORT_VOICE_IDS[normalizedLang]) {
      await videoRef.update({
        preparationStatus: 'pending',
        preparationProgress: 0,
        language: normalizedLang,
      })

      prepareContentPronunciations(uid, videoDocId, 'youtube', normalizedLang, null)
        .catch((prepErr) => {
          console.error('Background YouTube preparation failed:', prepErr)
        })
    }

    // Mark video as ready
    await videoRef.update({ status: 'ready' })
  } catch (error) {
    console.error('processYouTubeTranscript failed:', error)
    // Mark as failed so user knows something went wrong
    await videoRef.update({ status: 'failed' }).catch(() => {})
    throw error
  }
}

app.post('/api/youtube/import', async (req, res) => {
  const { title, youtubeUrl, uid, language } = req.body || {}
  const trimmedTitle = (title || '').trim()
  const trimmedUrl = (youtubeUrl || '').trim()
  const trimmedLanguage = (language || '').trim()

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
    ...(trimmedLanguage && { language: trimmedLanguage }),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'youtube',
    status: 'importing',
  }

  try {
    const videoRef = await firestore
      .collection('users')
      .doc(uid)
      .collection('youtubeVideos')
      .add(payload)

    const videoDocId = videoRef.id

    // Trigger background transcription (don't await - let it run async)
    processYouTubeTranscript(uid, videoDocId, videoId, trimmedLanguage || 'auto')
      .then(() => {
        console.log(`YouTube import ready: ${videoDocId}`)
      })
      .catch((err) => {
        console.error(`YouTube import failed: ${videoDocId}`, err)
      })

    return res.json({ id: videoDocId, ...payload })
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
    const { phrase, sourceLang, targetLang, ttsLanguage, skipAudio, voiceGender, unknownWords, voiceId: requestedVoiceId, context } = req.body || {}

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
    const normalizedSourceLang = sourceLang.toLowerCase().trim()
    const normalizedTargetLang = targetLang.toLowerCase().trim()

    // Resolve voice ID early for cache lookups
    const resolvedGender = voiceGender || 'male'
    let voiceId = requestedVoiceId
    if (!voiceId) {
      try {
        const resolved = resolveElevenLabsVoiceId(sourceLang, resolvedGender)
        voiceId = resolved.voiceId
      } catch (voiceErr) {
        console.error('Error resolving ElevenLabs voice:', voiceErr)
      }
    }

    // Check if this is a single word (for cache lookup)
    const isSingleWord = !phrase.includes(' ') && phrase.length < 50

    // Build prompt - if unknownWords provided, ask for word pairs too
    const hasUnknownWords = Array.isArray(unknownWords) && unknownWords.length > 0

    // Try to get cached translation for single words (skip cache if context provided for disambiguation)
    let cachedTranslation = null
    if (isSingleWord && !hasUnknownWords && !context) {
      cachedTranslation = await getTranslation(phrase, normalizedSourceLang, normalizedTargetLang)
    }

    // Try to get cached pronunciation for single words
    let cachedPronunciation = null
    if (isSingleWord && !skipAudio && voiceId) {
      cachedPronunciation = await getPronunciation(phrase, normalizedSourceLang, voiceId)
    }

    // If we have both cached, return immediately
    if (cachedTranslation && (skipAudio || cachedPronunciation)) {
      return res.json({
        phrase,
        translation: cachedTranslation.translation,
        targetText: cachedTranslation.translation,
        audioBase64: null,
        audioUrl: cachedPronunciation?.audioUrl || null,
        wordPairs: []
      })
    }

    // Build translation prompt
    let prompt
    if (hasUnknownWords) {
      prompt = `
Translate the following sentence from ${sourceLabel} to ${targetLabel}.
Also provide translations for these specific words: ${unknownWords.join(', ')}

Return JSON in this exact format:
{
  "translation": "the full sentence translation",
  "wordPairs": [
    {"source": "word1", "target": "translation1"},
    {"source": "word2", "target": "translation2"}
  ]
}

Sentence: ${phrase}
`.trim()
    } else {
      // If context provided, use it for disambiguation (e.g., "haya" as verb vs noun)
      const contextHint = context
        ? `\nCONTEXT: This word appears in the following context: "${context}"\nUse this context to determine the correct meaning if the word has multiple meanings.`
        : ''
      prompt = `
Translate the following phrase from ${sourceLabel} to ${targetLabel}.
Return only the translated phrase, with no extra commentary.${contextHint}

${phrase}
`.trim()
    }

    // Get translation (from cache or API)
    let translation = cachedTranslation?.translation || phrase
    let targetText = translation
    let wordPairs = []

    if (!cachedTranslation) {
      try {
        const response = await client.responses.create({
          model: 'gpt-4o-mini',
          input: prompt,
        })

        if (hasUnknownWords) {
          try {
            const jsonStr = response.output_text?.trim() || '{}'
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, jsonStr]
            const parsed = JSON.parse(jsonMatch[1] || jsonStr)
            translation = parsed.translation || translation
            targetText = translation
            wordPairs = parsed.wordPairs || []
          } catch (parseErr) {
            console.error('Error parsing word pairs JSON:', parseErr)
            translation = response.output_text?.trim() || translation
            targetText = translation
          }
        } else {
          translation = response.output_text?.trim() || translation
          targetText = translation
        }

        // Cache the translation for single words
        if (isSingleWord && !hasUnknownWords && translation !== phrase) {
          saveTranslation(phrase, normalizedSourceLang, normalizedTargetLang, translation).catch((err) => {
            console.error('Failed to cache translation:', err)
          })
        }
      } catch (innerErr) {
        console.error('Error translating phrase with OpenAI:', innerErr)
      }
    }

    // Skip audio generation if requested
    if (skipAudio) {
      return res.json({ phrase, translation, targetText, audioBase64: null, wordPairs })
    }

    // Get pronunciation (from cache or API)
    let audioBase64 = null
    let audioUrl = cachedPronunciation?.audioUrl || null

    const phraseForAudio = phrase?.trim() || targetText?.trim() || translation?.trim()
    if (phraseForAudio && voiceId && !cachedPronunciation) {
      const phraseForAudioSafe = phraseForAudio.length > 600 ? phraseForAudio.slice(0, 600) : phraseForAudio
      try {
        const audioBuffer = await requestElevenLabsTts(phraseForAudioSafe, voiceId)
        audioBase64 = audioBuffer.toString('base64')

        // Cache pronunciation for single words
        if (isSingleWord) {
          savePronunciation(phrase, normalizedSourceLang, voiceId, audioBuffer)
            .then((url) => {
              if (url) console.log(`Cached pronunciation for "${phrase}"`)
            })
            .catch((err) => {
              console.error('Failed to cache pronunciation:', err)
            })
        }
      } catch (ttsError) {
        console.error('Error generating pronunciation audio (ElevenLabs):', ttsError)
      }
    }

    // Generate audio for each word pair (check cache first)
    const wordPairsWithAudio = []
    if (wordPairs && wordPairs.length > 0 && voiceId) {
      for (const pair of wordPairs) {
        let wordAudio = null
        let wordAudioUrl = null

        // Check cache first
        const cachedWordPronunciation = await getPronunciation(pair.source, normalizedSourceLang, voiceId)
        if (cachedWordPronunciation?.audioUrl) {
          wordAudioUrl = cachedWordPronunciation.audioUrl
        } else {
          // Fetch from ElevenLabs and cache
          try {
            const audioBuffer = await requestElevenLabsTts(pair.source, voiceId)
            wordAudio = audioBuffer.toString('base64')
            // Cache in background
            savePronunciation(pair.source, normalizedSourceLang, voiceId, audioBuffer).catch((err) => {
              console.error(`Failed to cache pronunciation for "${pair.source}":`, err)
            })
          } catch (wordTtsErr) {
            console.error(`Error generating audio for word "${pair.source}":`, wordTtsErr)
          }
        }

        // Also cache the translation for word pairs
        if (pair.source && pair.target) {
          saveTranslation(pair.source, normalizedSourceLang, normalizedTargetLang, pair.target).catch((err) => {
            console.error(`Failed to cache translation for "${pair.source}":`, err)
          })
        }

        wordPairsWithAudio.push({
          source: pair.source,
          target: pair.target,
          audioBase64: wordAudio,
          audioUrl: wordAudioUrl
        })
      }
    } else if (wordPairs && wordPairs.length > 0) {
      wordPairs.forEach(pair => {
        wordPairsWithAudio.push({ source: pair.source, target: pair.target, audioBase64: null, audioUrl: null })
      })
    }

    return res.json({
      phrase,
      translation,
      targetText,
      audioBase64,
      audioUrl,
      wordPairs: wordPairsWithAudio.length > 0 ? wordPairsWithAudio : wordPairs
    })
  } catch (error) {
    console.error('Error translating phrase:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Batch prefetch translations for multiple words (no audio, text only)
app.post('/api/prefetchTranslations', async (req, res) => {
  try {
    const { languageCode, targetLang, words } = req.body || {}

    if (!Array.isArray(words) || words.length === 0) {
      return res.json({ translations: {} })
    }

    if (!targetLang) {
      return res.status(400).json({ error: 'targetLang is required' })
    }

    const sourceLabel = languageCode || 'auto-detected'
    const targetLabel = targetLang || 'English'

    // Deduplicate and limit words to prevent token overflow
    const uniqueWords = [...new Set(words.map(w => w.toLowerCase().trim()).filter(Boolean))]
    const maxWords = 200 // Limit batch size
    const wordsToTranslate = uniqueWords.slice(0, maxWords)

    if (wordsToTranslate.length === 0) {
      return res.json({ translations: {} })
    }

    const prompt = `
Translate the following words from ${sourceLabel} to ${targetLabel}.
Return a JSON object where each key is the original word (lowercase) and the value is its translation.
Only return the JSON object, no other text.

Words: ${wordsToTranslate.join(', ')}
`.trim()

    let translations = {}

    try {
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: prompt,
      })

      const outputText = response.output_text?.trim() || '{}'
      // Extract JSON from markdown code blocks if present
      const jsonMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, outputText]
      const parsed = JSON.parse(jsonMatch[1] || outputText)

      // Convert to expected format: { word: { translation: "..." } }
      for (const [word, translation] of Object.entries(parsed)) {
        if (typeof translation === 'string') {
          translations[word.toLowerCase()] = { translation }
        } else if (translation && typeof translation === 'object') {
          translations[word.toLowerCase()] = translation
        }
      }
    } catch (parseErr) {
      console.error('Error parsing prefetch translations:', parseErr)
    }

    return res.json({ translations })
  } catch (error) {
    console.error('Error prefetching translations:', error)
    return res.status(500).json({ error: 'Internal server error', translations: {} })
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
  voiceGender,
}) {
  if (!userId) {
    throw new Error('userId is required to import a book')
  }

  // Resolve voice ID for the imported book
  let voiceId = null
  let resolvedVoiceGender = voiceGender || 'male'
  try {
    const voiceResult = resolveElevenLabsVoiceId(outputLanguage, resolvedVoiceGender)
    voiceId = voiceResult.voiceId
    resolvedVoiceGender = voiceResult.voiceGender
  } catch (voiceErr) {
    console.error('Failed to resolve voice ID for imported book:', voiceErr.message)
    // Fall back to default import voice
    const normalizedLang = normalizeLanguageLabel(outputLanguage)?.toLowerCase()
    voiceId = normalizedLang ? DEFAULT_IMPORT_VOICE_IDS[normalizedLang] : null
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
    voiceId,
    voiceGender: resolvedVoiceGender,
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
  const targetLabel = outputLanguage || 'target language'
  const simplifiedLevel = mapLevelToSimplified(level)

  // For literal translation mode, use Native level (no simplification)
  const effectiveLevel = translationMode === 'graded' ? simplifiedLevel : 'Native'

  const response = await client.responses.create({
    model: 'gpt-4o-mini',
    input: [
      {
        role: 'system',
        content: ADAPTATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Adapt the following text to ${effectiveLevel} level in ${targetLabel}:\n\n${originalText}`,
      },
    ],
  })

  const adapted = response?.output?.[0]?.content?.[0]?.text?.trim() || response.output_text?.trim() || ''
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
      voiceGender,
      generateAudio,
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
      voiceGender,
      generateAudio,
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
      voiceGender,
    })
    console.log('Stub extracted pages count:', pages.length)

    // Fire-and-forget adaptation trigger
    const adaptPayload = {
      uid: userId,
      storyId: bookId,
      targetLanguage: outputLanguage,
      level,
      generateAudio: generateAudio === 'true',
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
    const { uid, storyId, targetLanguage, level, generateAudio } = req.body || {}

    if (!uid || !storyId) {
      return res.status(400).json({ error: 'uid and storyId are required' })
    }

    // Map legacy CEFR levels to simplified levels
    const simplifiedLevel = mapLevelToSimplified(level)

    console.log('Received adapt-imported-book request:', { uid, storyId, targetLanguage, level, simplifiedLevel, generateAudio })

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
              content: `Adapt the following text to ${simplifiedLevel} level in ${resolvedTargetLanguage}:\n\n${sourceText}`
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

    // Only trigger audio generation if explicitly requested
    if (generateAudio) {
      fetch('http://localhost:4000/api/generate-audio-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, storyId }),
      }).catch((err) => {
        console.error('Auto audio generation trigger failed:', err)
      })
    }

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

      // Trigger content preparation (pronunciation caching) - runs in background
      try {
        // Set initial preparation status
        await storyRef.update({
          preparationStatus: 'pending',
          preparationProgress: 0,
        })

        // Trigger preparation asynchronously (don't await)
        prepareContentPronunciations(uid, storyId, 'story', storyLanguage, storyVoiceId)
          .catch((prepErr) => {
            console.error('Background preparation failed:', prepErr)
          })
      } catch (prepInitError) {
        console.error('Failed to initialize preparation:', prepInitError)
        // Don't fail the whole request if preparation init fails
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

// Extract unique words from text content
function extractUniqueWords(text) {
  if (!text || typeof text !== 'string') return []
  const words = text.match(/[\p{L}]+/gu) || []
  const uniqueWords = [...new Set(words.map((w) => w.toLowerCase().trim()).filter((w) => w.length > 0))]
  return uniqueWords
}

// Internal function to prepare content pronunciations AND translations (can be called from other endpoints)
async function prepareContentPronunciations(uid, contentId, contentType, targetLanguage, voiceId) {
  const normalizedLang = targetLanguage.toLowerCase().trim()

  // Get user's native language from their profile (default to english)
  let nativeLanguage = 'english'
  try {
    const userDoc = await firestore.collection('users').doc(uid).get()
    if (userDoc.exists) {
      const userData = userDoc.data() || {}
      nativeLanguage = (userData.nativeLanguage || 'english').toLowerCase().trim()
    }
  } catch (err) {
    console.error('Failed to fetch user native language, defaulting to english:', err)
  }

  // Determine voice ID if not provided
  let finalVoiceId = voiceId
  if (!finalVoiceId) {
    finalVoiceId = DEFAULT_IMPORT_VOICE_IDS[normalizedLang]
    if (!finalVoiceId) {
      throw new Error(`No default voice available for language: ${targetLanguage}`)
    }
  }

  // Get content reference based on type
  let contentRef
  if (contentType === 'story') {
    contentRef = firestore.collection('users').doc(uid).collection('stories').doc(contentId)
  } else if (contentType === 'youtube') {
    contentRef = firestore.collection('users').doc(uid).collection('youtubeVideos').doc(contentId)
  } else if (contentType === 'spotify') {
    contentRef = firestore.collection('users').doc(uid).collection('spotifyItems').doc(contentId)
  } else {
    throw new Error(`Unknown content type: ${contentType}`)
  }

  // Check content exists
  const contentSnap = await contentRef.get()
  if (!contentSnap.exists) {
    throw new Error('Content not found')
  }

  // Update status to preparing
  await contentRef.update({
    preparationStatus: 'preparing',
    preparationProgress: 0,
  })

  // Extract all text from content
  let allText = ''

  if (contentType === 'story') {
    const pagesSnap = await contentRef.collection('pages').get()
    pagesSnap.docs.forEach((doc) => {
      const data = doc.data() || {}
      allText += ' ' + (data.text || data.originalText || data.adaptedText || '')
    })
  } else if (contentType === 'youtube') {
    const transcriptsSnap = await contentRef.collection('transcripts').get()
    transcriptsSnap.docs.forEach((doc) => {
      const data = doc.data() || {}
      allText += ' ' + (data.text || '')
      if (Array.isArray(data.segments)) {
        data.segments.forEach((seg) => {
          allText += ' ' + (seg.text || '')
        })
      }
    })
  } else if (contentType === 'spotify') {
    const contentData = contentSnap.data() || {}
    if (Array.isArray(contentData.transcriptSegments)) {
      contentData.transcriptSegments.forEach((seg) => {
        allText += ' ' + (seg.text || seg.words || '')
      })
    }
    const pagesSnap = await contentRef.collection('pages').get()
    pagesSnap.docs.forEach((doc) => {
      const data = doc.data() || {}
      allText += ' ' + (data.text || data.originalText || '')
    })
  }

  // Detect and save expressions from the text
  let detectedExpressions = []
  try {
    console.log(`Detecting expressions for ${contentType} ${contentId}...`)
    detectedExpressions = await detectAndSaveExpressions(allText, normalizedLang, nativeLanguage)
    console.log(`Detected ${detectedExpressions.length} expressions`)

    // Save expressions list on content document
    if (detectedExpressions.length > 0) {
      await contentRef.update({
        expressions: detectedExpressions,
      })
    }
  } catch (exprError) {
    console.error('Error detecting expressions:', exprError)
    // Continue - expression detection failures shouldn't block content preparation
  }

  // Extract unique words
  const uniqueWords = extractUniqueWords(allText)

  if (uniqueWords.length === 0) {
    await contentRef.update({
      preparationStatus: 'ready',
      preparationProgress: 100,
      voiceId: finalVoiceId,
    })
    return { success: true, wordsProcessed: 0, wordsFetched: 0 }
  }

  // Load user's vocab to identify non-KNOWN words
  const vocabSnap = await firestore
    .collection('users')
    .doc(uid)
    .collection('vocab')
    .where('language', '==', normalizedLang)
    .get()

  const knownWords = new Set()
  vocabSnap.docs.forEach((doc) => {
    const data = doc.data() || {}
    if (data.status === 'known') {
      knownWords.add((data.text || '').toLowerCase().trim())
    }
  })

  // Filter to non-KNOWN words (new, unknown, recognised, familiar)
  const wordsToProcess = uniqueWords.filter((word) => !knownWords.has(word))

  if (wordsToProcess.length === 0) {
    await contentRef.update({
      preparationStatus: 'ready',
      preparationProgress: 100,
      voiceId: finalVoiceId,
    })
    return { success: true, wordsProcessed: 0, wordsFetched: 0 }
  }

  // Check which pronunciations and translations are missing
  const [missingPronunciations, missingTranslations] = await Promise.all([
    getMissingPronunciations(wordsToProcess, normalizedLang, finalVoiceId),
    getMissingTranslations(wordsToProcess, normalizedLang, nativeLanguage),
  ])

  // Also check for missing expression pronunciations
  const missingExpressionPronunciations = await getMissingPronunciations(
    detectedExpressions,
    normalizedLang,
    finalVoiceId
  )

  // Combine into unique set of words that need fetching
  const allMissingWords = [...new Set([...missingPronunciations, ...missingTranslations])]
  const missingPronunciationsSet = new Set([...missingPronunciations, ...missingExpressionPronunciations])
  const missingTranslationsSet = new Set(missingTranslations)

  // Add expressions to the processing queue (for pronunciations only)
  const allMissingItems = [...new Set([...allMissingWords, ...missingExpressionPronunciations])]

  if (allMissingItems.length === 0) {
    await contentRef.update({
      preparationStatus: 'ready',
      preparationProgress: 100,
      voiceId: finalVoiceId,
    })
    return { success: true, wordsProcessed: wordsToProcess.length, expressionsDetected: detectedExpressions.length, pronunciationsFetched: 0, translationsFetched: 0 }
  }

  // Fetch missing pronunciations AND translations (with rate limiting)
  let pronunciationsFetched = 0
  let translationsFetched = 0
  const concurrencyLimit = 3
  const totalMissing = allMissingItems.length

  for (let i = 0; i < allMissingItems.length; i += concurrencyLimit) {
    const batch = allMissingItems.slice(i, i + concurrencyLimit)

    await Promise.all(
      batch.map(async (word) => {
        // Fetch pronunciation if missing
        if (missingPronunciationsSet.has(word)) {
          try {
            const audioBuffer = await requestElevenLabsTts(word, finalVoiceId)
            if (audioBuffer) {
              await savePronunciation(word, normalizedLang, finalVoiceId, audioBuffer)
              pronunciationsFetched++
            }
          } catch (ttsError) {
            console.error(`Failed to fetch pronunciation for "${word}":`, ttsError.message)
            // Continue - pronunciation failures shouldn't block content
          }
        }

        // Fetch translation if missing
        if (missingTranslationsSet.has(word)) {
          try {
            const prompt = `Translate the following word from ${normalizedLang} to ${nativeLanguage}. Return only the translated word or short phrase, with no extra commentary.\n\n${word}`
            const response = await client.responses.create({
              model: 'gpt-4o-mini',
              input: prompt,
            })
            const translation = response.output_text?.trim()
            if (translation && translation !== word) {
              await saveTranslation(word, normalizedLang, nativeLanguage, translation)
              translationsFetched++
            }
          } catch (translateError) {
            console.error(`Failed to fetch translation for "${word}":`, translateError.message)
            // Continue - translation failures shouldn't block content
          }
        }
      })
    )

    // Update progress
    const progress = Math.round(((i + batch.length) / totalMissing) * 100)
    await contentRef.update({ preparationProgress: progress })

    // Small delay between batches to avoid rate limiting
    if (i + concurrencyLimit < allMissingWords.length) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  // Mark as ready
  await contentRef.update({
    preparationStatus: 'ready',
    preparationProgress: 100,
    voiceId: finalVoiceId,
  })

  return {
    success: true,
    wordsProcessed: wordsToProcess.length,
    expressionsDetected: detectedExpressions.length,
    pronunciationsFetched,
    translationsFetched,
    totalMissing: allMissingItems.length,
  }
}

// Prepare content pronunciations - API endpoint wrapper
app.post('/api/prepare-content', async (req, res) => {
  const { uid, contentId, contentType, targetLanguage, voiceId } = req.body || {}

  if (!uid || !contentId || !contentType || !targetLanguage) {
    return res.status(400).json({
      error: 'uid, contentId, contentType, and targetLanguage are required',
    })
  }

  try {
    const result = await prepareContentPronunciations(uid, contentId, contentType, targetLanguage, voiceId)
    return res.json(result)
  } catch (error) {
    console.error('Error preparing content:', error)
    return res.status(500).json({ error: error.message || 'Failed to prepare content' })
  }
})

// Get all expressions for a language
app.get('/api/expressions/:language', async (req, res) => {
  const { language } = req.params

  if (!language) {
    return res.status(400).json({ error: 'language is required' })
  }

  try {
    const expressions = await getExpressionsForLanguage(language)
    return res.json({ expressions })
  } catch (error) {
    console.error('Error fetching expressions:', error)
    return res.status(500).json({ error: 'Failed to fetch expressions' })
  }
})

// Get expressions for specific content
app.post('/api/content/expressions', async (req, res) => {
  const { uid, contentId, contentType, language } = req.body || {}

  if (!uid || !contentId || !contentType) {
    return res.status(400).json({ error: 'uid, contentId, and contentType are required' })
  }

  try {
    // Get content reference based on type
    let contentRef
    if (contentType === 'story') {
      contentRef = firestore.collection('users').doc(uid).collection('stories').doc(contentId)
    } else if (contentType === 'youtube') {
      contentRef = firestore.collection('users').doc(uid).collection('youtubeVideos').doc(contentId)
    } else if (contentType === 'spotify') {
      contentRef = firestore.collection('users').doc(uid).collection('spotifyItems').doc(contentId)
    } else {
      return res.status(400).json({ error: `Unknown content type: ${contentType}` })
    }

    const contentSnap = await contentRef.get()
    if (!contentSnap.exists) {
      return res.status(404).json({ error: 'Content not found' })
    }

    const contentData = contentSnap.data() || {}
    const expressionsList = contentData.expressions || []

    // Fetch full expression data for each expression in the content
    const normalizedLang = (language || contentData.language || contentData.outputLanguage || '').toLowerCase().trim()

    const expressionDetails = await Promise.all(
      expressionsList.map(async (exprText) => {
        const expr = await getExpression(exprText, normalizedLang)
        return expr || { text: exprText, meaning: null, literal: null }
      })
    )

    return res.json({ expressions: expressionDetails })
  } catch (error) {
    console.error('Error fetching content expressions:', error)
    return res.status(500).json({ error: 'Failed to fetch content expressions' })
  }
})

// Preload cached translations and pronunciations for content
app.post('/api/content/preload', async (req, res) => {
  const { uid, contentId, contentType, targetLanguage, nativeLanguage, voiceId: requestedVoiceId } = req.body || {}

  if (!uid || !contentId || !contentType || !targetLanguage) {
    return res.status(400).json({
      error: 'uid, contentId, contentType, and targetLanguage are required',
    })
  }

  const normalizedTargetLang = targetLanguage.toLowerCase().trim()
  const normalizedNativeLang = (nativeLanguage || 'english').toLowerCase().trim()

  // Use provided voiceId or default for the language
  const voiceId = requestedVoiceId || DEFAULT_IMPORT_VOICE_IDS[normalizedTargetLang]
  if (!voiceId) {
    // No voice available, return translations only (no pronunciations)
    console.log(`No voice ID available for language ${targetLanguage}, returning translations only`)
  }

  try {
    // Get content reference based on type
    let contentRef
    if (contentType === 'story') {
      contentRef = firestore.collection('users').doc(uid).collection('stories').doc(contentId)
    } else if (contentType === 'youtube') {
      contentRef = firestore.collection('users').doc(uid).collection('youtubeVideos').doc(contentId)
    } else if (contentType === 'spotify') {
      contentRef = firestore.collection('users').doc(uid).collection('spotifyItems').doc(contentId)
    } else {
      return res.status(400).json({ error: `Unknown content type: ${contentType}` })
    }

    // Extract all text from content (same as prepare-content)
    let allText = ''
    const contentSnap = await contentRef.get()
    if (!contentSnap.exists) {
      return res.status(404).json({ error: 'Content not found' })
    }

    if (contentType === 'story') {
      const pagesSnap = await contentRef.collection('pages').get()
      pagesSnap.docs.forEach((doc) => {
        const data = doc.data() || {}
        allText += ' ' + (data.text || data.originalText || data.adaptedText || '')
      })
    } else if (contentType === 'youtube') {
      const transcriptsSnap = await contentRef.collection('transcripts').get()
      transcriptsSnap.docs.forEach((doc) => {
        const data = doc.data() || {}
        allText += ' ' + (data.text || '')
        if (Array.isArray(data.segments)) {
          data.segments.forEach((seg) => {
            allText += ' ' + (seg.text || '')
          })
        }
      })
    } else if (contentType === 'spotify') {
      const contentData = contentSnap.data() || {}
      if (Array.isArray(contentData.transcriptSegments)) {
        contentData.transcriptSegments.forEach((seg) => {
          allText += ' ' + (seg.text || seg.words || '')
        })
      }
      const pagesSnap = await contentRef.collection('pages').get()
      pagesSnap.docs.forEach((doc) => {
        const data = doc.data() || {}
        allText += ' ' + (data.text || data.originalText || '')
      })
    }

    // Extract unique words
    const uniqueWords = extractUniqueWords(allText)

    if (uniqueWords.length === 0) {
      return res.json({ translations: {}, pronunciations: {} })
    }

    // Batch fetch cached data
    const [translations, pronunciations] = await Promise.all([
      batchGetTranslations(uniqueWords, normalizedTargetLang, normalizedNativeLang),
      voiceId ? batchGetPronunciations(uniqueWords, normalizedTargetLang, voiceId) : Promise.resolve({}),
    ])

    return res.json({ translations, pronunciations })
  } catch (error) {
    console.error('Error preloading content data:', error)
    return res.status(500).json({ error: 'Failed to preload content data' })
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

// Practice Mode: Get AI feedback on user's translation attempt
app.post('/api/practice/feedback', async (req, res) => {
  try {
    const { nativeSentence, userAttempt, targetLanguage, sourceLanguage, adaptationLevel, contextSummary, feedbackInTarget } = req.body || {}

    if (!nativeSentence || !userAttempt || !targetLanguage) {
      return res.status(400).json({ error: 'nativeSentence, userAttempt, and targetLanguage are required' })
    }

    const sourceLang = sourceLanguage || 'English'
    const level = adaptationLevel || 'native'
    const feedbackLang = feedbackInTarget ? targetLanguage : sourceLang

    // Build context section if context summary is available
    const contextSection = contextSummary
      ? `
IMPORTANT CONTEXT:
${contextSummary}

Your feedback and model sentence MUST be consistent with this context.
`
      : ''

    // Check if user has words in parentheses (asking for help with unknown words)
    const parenthesesPattern = /\(([^)]+)\)/g
    const unknownWords = [...userAttempt.matchAll(parenthesesPattern)].map(m => m[1])
    const hasUnknownWords = unknownWords.length > 0

    // Build unknown words section for the prompt
    const unknownWordsSection = hasUnknownWords
      ? `
IMPORTANT - Unknown Words:
The student has indicated they don't know how to express certain words/phrases by putting them in parentheses in ${sourceLang}. These are: ${unknownWords.map(w => `"${w}"`).join(', ')}.
In your feedback explanation, provide the ${targetLanguage} translations for each of these words/phrases.
In the model sentence, replace these parenthetical expressions with the correct ${targetLanguage} translations.
`
      : ''

    // Build the prompt for the tutor
    const prompt = `You are a strict but fair ${targetLanguage} language tutor. Analyze the student's translation attempt.
${contextSection}${unknownWordsSection}
Original sentence (${sourceLang}): "${nativeSentence}"
Student's attempt (${targetLanguage}): "${userAttempt}"
Adaptation level: ${level}

YOUR TASK: Find ALL errors in the student's attempt. Be thorough but fair.

WHAT TO FLAG AS ERRORS (you MUST catch these):
1. SPELLING ERRORS - Wrong letters, missing/extra letters, missing accents
   Examples: "difficil" → "difícil", "extramadamente" → "extremadamente", "esta" → "está" (when verb)
2. GRAMMAR ERRORS - Wrong verb conjugation, wrong gender/number agreement, wrong word order that breaks grammar
   Examples: "la problema" → "el problema", "ellos tiene" → "ellos tienen"
3. ACCURACY ERRORS - Wrong word that changes the meaning, missing key information
   Examples: Using "always" when original said "never"

WHAT IS NOT AN ERROR (do NOT flag these):
- Valid synonyms: "necesitar" vs "deber", "muy" vs "bastante"
- Valid alternatives: "¿no?" vs "¿verdad?", "es que" vs "porque"
- Style preferences: Different but grammatically correct word order
- If you would say "more natural" or "I prefer" - it's NOT an error, don't flag it

Return JSON:
{
  "modelSentence": "A natural ${targetLanguage} translation (as exemplar, not the only correct answer)",
  "feedback": {
    "correctness": <1-5, where 5 = no errors>,
    "accuracy": <1-5, where 5 = meaning fully preserved>,
    "corrections": [
      {
        "category": "spelling" | "grammar" | "accuracy",
        "original": "exact text from student's attempt",
        "correction": "corrected text",
        "explanation": "Brief explanation in ${feedbackLang}"
      }
    ]${hasUnknownWords ? `,
    "unknownWordTranslations": { "word": "translation", ... }` : ''}
  }
}

CRITICAL RULES:
- "original" must contain ONLY the specific word(s) with errors, NOT surrounding correct words
- "original" must EXACTLY match text in student's attempt (for highlighting)
- Flag EVERY spelling error including missing accents (á, é, í, ó, ú, ñ, ü)
- Flag EVERY grammar error (conjugation, agreement, syntax)
- Do NOT flag valid alternative phrasings
- Empty corrections [] only if attempt has zero errors

Return ONLY valid JSON.`

    const response = await client.responses.create({
      model: 'gpt-4o',
      input: prompt,
    })

    let result
    try {
      // Extract JSON from the response
      const text = response.output_text || ''
      console.log('AI response:', text.slice(0, 500))

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
        console.log('Parsed feedback:', JSON.stringify(result.feedback, null, 2))

        // Calculate positions for each correction
        if (result.feedback?.corrections) {
          result.feedback.corrections = result.feedback.corrections.map(correction => {
            const startIndex = userAttempt.indexOf(correction.original)
            if (startIndex !== -1) {
              return {
                ...correction,
                startIndex,
                endIndex: startIndex + correction.original.length
              }
            }
            // If exact match not found, try case-insensitive search
            const lowerAttempt = userAttempt.toLowerCase()
            const lowerOriginal = correction.original.toLowerCase()
            const caseInsensitiveStart = lowerAttempt.indexOf(lowerOriginal)
            if (caseInsensitiveStart !== -1) {
              return {
                ...correction,
                original: userAttempt.slice(caseInsensitiveStart, caseInsensitiveStart + correction.original.length),
                startIndex: caseInsensitiveStart,
                endIndex: caseInsensitiveStart + correction.original.length
              }
            }
            // Return without position if not found
            return correction
          })
        }
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseErr) {
      console.error('Parse error:', parseErr)
      // Return a basic response if parsing fails
      result = {
        modelSentence: userAttempt,
        feedback: {
          naturalness: 3,
          accuracy: 3,
          correctness: 3,
          corrections: [],
        },
      }
    }

    return res.json(result)
  } catch (error) {
    console.error('Practice feedback error:', error)
    return res.status(500).json({ error: 'Failed to get feedback' })
  }
})

// Practice Mode: Handle follow-up questions from the user
app.post('/api/practice/followup', async (req, res) => {
  try {
    const { question, context } = req.body || {}

    if (!question) {
      return res.status(400).json({ error: 'question is required' })
    }

    const { sourceSentence, userAttempt, modelSentence, feedback, targetLanguage, sourceLanguage, contextSummary, currentCorrections, fullDocument } = context || {}

    // Detect if user is clarifying their intent (e.g., "no, I meant X", "I was trying to say Y")
    const clarificationPatterns = [
      /no,?\s*(i|I)\s*(was|meant|wanted|tried)/i,
      /actually,?\s*(i|I)\s*(was|meant|wanted|tried)/i,
      /(i|I)\s*(was|meant|wanted|tried)\s*to\s*say/i,
      /what\s*(i|I)\s*(meant|wanted)/i,
      /i\s*didn'?t\s*mean/i,
    ]
    const isClarification = clarificationPatterns.some(p => p.test(question))

    // Build context section if context summary is available
    const contextSection = contextSummary
      ? `
Context: ${contextSummary}
`
      : ''

    let prompt
    let returnUpdatedFeedback = false

    if (isClarification && currentCorrections?.length > 0) {
      // User is clarifying what they meant - re-analyze with this info
      returnUpdatedFeedback = true
      prompt = `You are a language tutor helping a student learn ${targetLanguage || 'the target language'}.

The student wrote: "${userAttempt || fullDocument || 'N/A'}"

Your previous corrections were:
${currentCorrections.map(c => `- "${c.original}" → "${c.correction}" (${c.category})`).join('\n')}

The student is now clarifying: "${question}"

Based on this clarification, you need to:
1. Understand what the student actually meant to express
2. Provide the correct way to say it in ${targetLanguage}
3. Update any corrections that were based on misunderstanding their intent

Return JSON:
{
  "response": "Your helpful response acknowledging their clarification and teaching them the correct expression",
  "updatedCorrections": [
    {
      "originalText": "the text that was incorrectly corrected",
      "newCategory": "spelling" | "grammar" | "accuracy" | "naturalness",
      "newCorrection": "the correct form based on what they meant",
      "newExplanation": "explanation of the correct form",
      "exampleSentence": "example sentence using the correct form"
    }
  ],
  "removedCorrections": ["original text of any corrections that should be removed"]
}

Only include updatedCorrections for corrections that need to change based on the clarification.
Only include removedCorrections for corrections that were wrong and should be removed entirely.`

      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: prompt,
        text: { format: { type: 'json_object' } },
      })

      let result
      try {
        let text = response.output_text || ''
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        result = JSON.parse(text)
      } catch (parseErr) {
        console.error('Failed to parse clarification response:', parseErr)
        return res.json({ response: response.output_text || 'I understand. Let me help you with that.' })
      }

      return res.json({
        response: result.response || 'I understand what you meant now.',
        updatedCorrections: result.updatedCorrections || [],
        removedCorrections: result.removedCorrections || [],
      })
    }

    // Regular follow-up question (not a clarification)
    prompt = `You are a language tutor helping a student learn ${targetLanguage || 'the target language'}. The student has a follow-up question.
${contextSection}
Current exercise context:
- Source sentence (${sourceLanguage || 'source language'}): "${sourceSentence || 'N/A'}"
- Student's attempt: "${userAttempt || 'N/A'}"
- Model sentence: "${modelSentence || 'N/A'}"
- Previous feedback: ${feedback?.explanation || 'N/A'}

Student's question: "${question}"

Provide a helpful, encouraging response in ${sourceLanguage || 'English'}. Be concise but thorough. If they're asking about grammar, vocabulary, or cultural aspects, explain clearly with examples.`

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: prompt,
    })

    return res.json({ response: response.output_text || 'I couldn\'t generate a response.' })
  } catch (error) {
    console.error('Practice follow-up error:', error)
    return res.status(500).json({ error: 'Failed to process follow-up question' })
  }
})

// Practice Save Beacon - for saving draft on page unload
app.post('/api/practice/save-beacon', async (req, res) => {
  try {
    const { userId, lessonId, sentenceIndex, userText, status } = req.body || {}

    if (!userId || !lessonId || sentenceIndex === undefined) {
      return res.status(400).json({ error: 'userId, lessonId, and sentenceIndex are required' })
    }

    // Get the lesson and update or add the attempt
    const lessonRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('practiceLessons')
      .doc(lessonId)

    const lessonDoc = await lessonRef.get()
    if (!lessonDoc.exists) {
      return res.status(404).json({ error: 'Lesson not found' })
    }

    const lessonData = lessonDoc.data()
    let attempts = lessonData.attempts || []

    // Find existing attempt for this sentence
    const existingIndex = attempts.findIndex(a => a.sentenceIndex === sentenceIndex)
    const attemptData = {
      sentenceIndex,
      userText: userText || '',
      status: status || 'draft',
      updatedAt: new Date().toISOString(),
    }

    if (existingIndex >= 0) {
      // Preserve existing feedback/modelSentence if just saving draft
      attempts[existingIndex] = {
        ...attempts[existingIndex],
        ...attemptData,
      }
    } else {
      attempts.push(attemptData)
    }

    await lessonRef.update({
      attempts,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Practice save beacon error:', error)
    return res.status(500).json({ error: 'Failed to save' })
  }
})

// Free Writing Save Beacon - for saving on page unload
app.post('/api/freewriting/save-beacon', async (req, res) => {
  try {
    const { userId, lessonId, content, wordCount, corrections } = req.body || {}

    console.log('=== BEACON SAVE REQUEST ===')
    console.log('User ID:', userId)
    console.log('Lesson ID:', lessonId)
    console.log('Content length:', content?.length || 0, 'chars')
    console.log('Word count:', wordCount)
    console.log('Corrections:', corrections?.length || 0)

    if (!userId || !lessonId) {
      console.error('Beacon save failed: missing userId or lessonId')
      return res.status(400).json({ error: 'userId and lessonId are required' })
    }

    // Update the lesson in Firestore
    const lessonRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('freeWritingLessons')
      .doc(lessonId)

    await lessonRef.update({
      content: content || '',
      wordCount: wordCount || 0,
      corrections: corrections || [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    console.log('Beacon save successful for lesson:', lessonId)
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Save beacon error:', error)
    return res.status(500).json({ error: 'Failed to save' })
  }
})

// Free Writing Feedback Endpoint
// =============================================================================
// NOVEL GENERATOR API
// =============================================================================

// OpenAI wrapper with retry, timeout, and streaming support
// Per planning doc Section 11.5: 3 attempts, exponential backoff (2s, 4s, 8s), 90s timeout
async function callOpenAIWithRetry(options, { maxRetries = 3, timeoutMs = 90000, stream = false } = {}) {
  const delays = [2000, 4000, 8000]
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        if (stream) {
          // Streaming mode for chapter generation
          const response = await client.chat.completions.create({
            ...options,
            stream: true,
          })
          clearTimeout(timeoutId)
          return response
        } else {
          // Non-streaming mode for bible phases
          const response = await client.chat.completions.create({
            ...options,
            stream: false,
          })
          clearTimeout(timeoutId)
          return response
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      lastError = error
      console.error(`OpenAI call attempt ${attempt + 1} failed:`, error.message)

      // Don't retry on abort (timeout)
      if (error.name === 'AbortError') {
        throw new Error(`OpenAI call timed out after ${timeoutMs}ms`)
      }

      // Wait before retrying (unless last attempt)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]))
      }
    }
  }

  throw lastError || new Error('OpenAI call failed after all retries')
}

// Parse JSON from LLM response, with retry instruction if parsing fails
function parseJSONResponse(content) {
  try {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()
    return { success: true, data: JSON.parse(jsonStr) }
  } catch (error) {
    return { success: false, error: error.message, raw: content }
  }
}

// Validate coherence check fields are non-empty
function validateCoherenceCheck(coherenceCheck, requiredFields) {
  if (!coherenceCheck) return { valid: false, missing: requiredFields }
  const missing = requiredFields.filter(field => !coherenceCheck[field] || coherenceCheck[field].trim() === '')
  return { valid: missing.length === 0, missing }
}

// POST /api/generate/bible - Generate complete story bible (Phases 1-8)
app.post('/api/generate/bible', async (req, res) => {
  try {
    const { uid, concept, level, lengthPreset, language, generateAudio = false } = req.body

    // Validate required fields
    if (!uid) return res.status(400).json({ error: 'uid is required' })
    if (!concept) return res.status(400).json({ error: 'concept is required' })
    if (!level) return res.status(400).json({ error: 'level is required' })
    if (!lengthPreset) return res.status(400).json({ error: 'lengthPreset is required' })
    if (!language) return res.status(400).json({ error: 'language is required' })

    // Validate level
    const validLevels = ['Beginner', 'Intermediate', 'Native']
    if (!validLevels.includes(level)) {
      return res.status(400).json({ error: `level must be one of: ${validLevels.join(', ')}` })
    }

    // Validate lengthPreset
    const validLengths = ['novella', 'novel']
    if (!validLengths.includes(lengthPreset)) {
      return res.status(400).json({ error: `lengthPreset must be one of: ${validLengths.join(', ')}` })
    }

    // Create initial book document
    const bookRef = firestore.collection('users').doc(uid).collection('generatedBooks').doc()
    const bookId = bookRef.id

    await bookRef.set({
      concept,
      language,
      level,
      genre: 'Romance', // Pilot genre
      lengthPreset,
      chapterCount: lengthPreset === 'novella' ? 12 : 35,
      generateAudio,
      status: 'planning',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      bible: {} // Will be populated by phases
    })

    // Generate the complete bible using the 8-phase pipeline
    console.log(`Starting bible generation for book ${bookId}...`)
    const result = await generateBible(concept, level, lengthPreset, language)

    if (!result.success) {
      // Update book status to failed
      await bookRef.update({
        status: 'failed',
        error: result.error,
        bible: result.partialBible || {}
      })

      return res.status(500).json({
        success: false,
        bookId,
        error: result.error,
        partialBible: result.partialBible
      })
    }

    // Update book with completed bible
    const finalStatus = result.validationStatus === 'PASS' || result.validationStatus === 'CONDITIONAL_PASS'
      ? 'bible_complete'
      : 'bible_needs_review'

    await bookRef.update({
      bible: result.bible,
      status: finalStatus,
      validationStatus: result.validationStatus,
      validationAttempts: result.validationAttempts
    })

    return res.status(201).json({
      success: true,
      bookId,
      status: finalStatus,
      validationStatus: result.validationStatus,
      validationAttempts: result.validationAttempts,
      bible: result.bible
    })

  } catch (error) {
    console.error('Generate bible error:', error)
    return res.status(500).json({ error: 'Failed to generate bible', details: error.message })
  }
})

// POST /api/generate/chapter/:bookId/:chapterIndex - Generate single chapter
app.post('/api/generate/chapter/:bookId/:chapterIndex', async (req, res) => {
  try {
    const { bookId, chapterIndex } = req.params
    const { uid } = req.body

    // Validate required fields
    if (!uid) return res.status(400).json({ error: 'uid is required' })
    if (!bookId) return res.status(400).json({ error: 'bookId is required' })

    const chapterNum = parseInt(chapterIndex, 10)
    if (isNaN(chapterNum) || chapterNum < 1) {
      return res.status(400).json({ error: 'chapterIndex must be a positive integer' })
    }

    // Get book document
    const bookRef = firestore.collection('users').doc(uid).collection('generatedBooks').doc(bookId)
    const bookDoc = await bookRef.get()

    if (!bookDoc.exists) {
      return res.status(404).json({ error: 'Book not found' })
    }

    const bookData = bookDoc.data()

    // Validate chapter index
    if (chapterNum > bookData.chapterCount) {
      return res.status(400).json({
        error: `Chapter ${chapterNum} exceeds book chapter count (${bookData.chapterCount})`
      })
    }

    // Check if bible is complete
    const validBibleStatuses = ['bible_complete', 'in_progress', 'complete']
    if (!validBibleStatuses.includes(bookData.status)) {
      return res.status(400).json({
        error: 'Bible generation must be complete before generating chapters',
        currentStatus: bookData.status
      })
    }

    // Get previous chapter summaries for context
    const chaptersSnapshot = await bookRef.collection('chapters').orderBy('index').get()
    const previousSummaries = chaptersSnapshot.docs
      .filter(doc => doc.data().index < chapterNum)
      .map(doc => {
        const data = doc.data()
        return {
          number: data.index,
          pov: data.pov,
          summary: data.summary,
          compressedSummary: data.compressedSummary,
          ultraSummary: data.ultraSummary
        }
      })

    // Build context with appropriate compression
    console.log(`Building context for Chapter ${chapterNum}...`)
    const contextSummaries = await buildPreviousContext(chapterNum, previousSummaries)

    // Generate the chapter
    console.log(`Generating Chapter ${chapterNum}...`)
    const result = await generateChapterWithValidation(
      bookData.bible,
      chapterNum,
      contextSummaries,
      bookData.language
    )

    // Get chapter info from bible
    const bibleChapter = bookData.bible.chapters?.chapters?.[chapterNum - 1] || {}

    // Build chapter document
    const chapterDoc = {
      index: chapterNum,
      title: result.chapter?.chapter?.title || bibleChapter.title || `Chapter ${chapterNum}`,
      pov: bibleChapter.pov || 'Unknown',
      content: result.chapter?.chapter?.content || '',
      wordCount: result.chapter?.validation?.wordCount || 0,
      tensionRating: bibleChapter.tension_rating || 5,
      summary: result.chapter?.summary || {},
      compressedSummary: null,
      ultraSummary: null,
      audioUrl: null,
      audioStatus: 'none',
      validationPassed: result.success,
      regenerationCount: result.attempts - 1,
      needsReview: result.needsReview || false,
      generatedAt: admin.firestore.FieldValue.serverTimestamp()
    }

    // Save chapter to Firestore
    const chapterRef = bookRef.collection('chapters').doc(String(chapterNum))
    await chapterRef.set(chapterDoc)

    // Update book status
    if (bookData.status === 'bible_complete') {
      await bookRef.update({ status: 'in_progress' })
    }

    // Check if this is the last chapter
    if (chapterNum === bookData.chapterCount) {
      await bookRef.update({ status: 'complete' })
    }

    return res.status(201).json({
      success: result.success,
      bookId,
      chapterIndex: chapterNum,
      attempts: result.attempts,
      needsReview: result.needsReview || false,
      chapter: {
        ...chapterDoc,
        generatedAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Generate chapter error:', error)
    return res.status(500).json({ error: 'Failed to generate chapter', details: error.message })
  }
})

// GET /api/generate/book/:bookId - Get book status and bible
app.get('/api/generate/book/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params
    const { uid } = req.query

    // Validate required fields
    if (!uid) return res.status(400).json({ error: 'uid query parameter is required' })
    if (!bookId) return res.status(400).json({ error: 'bookId is required' })

    // Get book document
    const bookRef = firestore.collection('users').doc(uid).collection('generatedBooks').doc(bookId)
    const bookDoc = await bookRef.get()

    if (!bookDoc.exists) {
      return res.status(404).json({ error: 'Book not found' })
    }

    const bookData = bookDoc.data()

    // Get chapter summaries
    const chaptersSnapshot = await bookRef.collection('chapters').orderBy('index').get()
    const chapters = chaptersSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        index: data.index,
        title: data.title,
        pov: data.pov,
        wordCount: data.wordCount,
        validationPassed: data.validationPassed,
        generatedAt: data.generatedAt
      }
    })

    return res.json({
      success: true,
      book: {
        id: bookId,
        concept: bookData.concept,
        language: bookData.language,
        level: bookData.level,
        genre: bookData.genre,
        lengthPreset: bookData.lengthPreset,
        chapterCount: bookData.chapterCount,
        generateAudio: bookData.generateAudio,
        status: bookData.status,
        createdAt: bookData.createdAt,
        bible: bookData.bible
      },
      chapters,
      generatedChapterCount: chapters.length
    })

  } catch (error) {
    console.error('Get book error:', error)
    return res.status(500).json({ error: 'Failed to get book', details: error.message })
  }
})

// GET /api/generate/books - List all generated books for a user
app.get('/api/generate/books', async (req, res) => {
  try {
    const { uid } = req.query

    if (!uid) return res.status(400).json({ error: 'uid query parameter is required' })

    const booksSnapshot = await firestore
      .collection('users')
      .doc(uid)
      .collection('generatedBooks')
      .orderBy('createdAt', 'desc')
      .get()

    const books = booksSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        concept: data.concept,
        language: data.language,
        level: data.level,
        genre: data.genre,
        lengthPreset: data.lengthPreset,
        chapterCount: data.chapterCount,
        status: data.status,
        createdAt: data.createdAt
      }
    })

    return res.json({
      success: true,
      books,
      count: books.length
    })

  } catch (error) {
    console.error('List books error:', error)
    return res.status(500).json({ error: 'Failed to list books', details: error.message })
  }
})

// DELETE /api/generate/book/:bookId - Delete a generated book
app.delete('/api/generate/book/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params
    const { uid } = req.body

    if (!uid) return res.status(400).json({ error: 'uid is required' })
    if (!bookId) return res.status(400).json({ error: 'bookId is required' })

    const bookRef = firestore.collection('users').doc(uid).collection('generatedBooks').doc(bookId)
    const bookDoc = await bookRef.get()

    if (!bookDoc.exists) {
      return res.status(404).json({ error: 'Book not found' })
    }

    // Delete all chapters first
    const chaptersSnapshot = await bookRef.collection('chapters').get()
    const batch = firestore.batch()
    chaptersSnapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()

    // Delete the book document
    await bookRef.delete()

    return res.json({
      success: true,
      message: 'Book and all chapters deleted'
    })

  } catch (error) {
    console.error('Delete book error:', error)
    return res.status(500).json({ error: 'Failed to delete book', details: error.message })
  }
})

// Free Writing Feedback Endpoint (line-by-line)
app.post('/api/freewriting/feedback', async (req, res) => {
  try {
    const { userText, targetLanguage, sourceLanguage, textType, previousLines, feedbackInTarget, helpExpressions, fullDocument } = req.body || {}

    if (!userText || !targetLanguage) {
      return res.status(400).json({ error: 'userText and targetLanguage are required' })
    }

    const sourceLang = sourceLanguage || 'English'
    const feedbackLang = feedbackInTarget ? targetLanguage : sourceLang
    const type = textType || 'general writing'

    // Check if user has bracketed expressions they need help with
    const hasHelpRequests = helpExpressions && helpExpressions.length > 0

    // Build context from full document or previous lines
    let contextSection = ''
    if (fullDocument && fullDocument.trim() !== userText.trim()) {
      contextSection = `
CONTEXT (from the student's document):
"${fullDocument.slice(0, 500)}${fullDocument.length > 500 ? '...' : ''}"

The student is writing a ${type}. Consider this context when providing feedback.
`
    } else if (previousLines?.length > 0) {
      contextSection = `
CONTEXT (previous sentences in this ${type}):
${previousLines.map((line, i) => `${i + 1}. ${line}`).join('\n')}

The student is continuing this ${type}. Consider the context when evaluating naturalness and coherence.
`
    }

    // Build special section for help expressions (bracketed text user needs help with)
    const helpSection = hasHelpRequests
      ? `
HELP REQUESTED: The student has placed text in brackets to indicate they don't know how to express these ideas in ${targetLanguage}:
${helpExpressions.map((expr) => `- "${expr}" (in ${sourceLang})`).join('\n')}

YOUR PRIMARY TASK: Show the student how to express these bracketed ideas naturally in ${targetLanguage}.
- Replace the bracketed ${sourceLang} text with natural ${targetLanguage} equivalents in modelSentence
- In your explanation, help them understand HOW to express each bracketed idea
- Use a warm, helpful tone like a tutor saying "Here's how you'd say that..."
`
      : ''

    const prompt = `You are a supportive ${targetLanguage} language tutor helping a student with free writing practice. The student is writing a ${type}.
${contextSection}
Student's text: "${userText}"
${helpSection}
YOUR TASK: ${hasHelpRequests ? 'Help the student express the bracketed ideas in ' + targetLanguage + ', and also check for any errors in the non-bracketed parts.' : 'Analyze the student\'s writing for errors and naturalness. Be encouraging but thorough.'}

WHAT TO FLAG AS ERRORS (in the non-bracketed parts):
1. SPELLING ERRORS - Wrong letters, missing letters, extra letters, OR missing/wrong accents
2. GRAMMAR ERRORS - ACTUAL MISTAKES like wrong verb conjugation, wrong gender/number agreement, incorrect word forms
3. PUNCTUATION - Missing or incorrect punctuation marks (commas, periods, question marks, etc.)
4. NATURALNESS - When the text is grammatically CORRECT but a native speaker would phrase it differently
   * Example: "caso hay" is grammatically valid but unnatural → should be "en caso de que haya" (category: "naturalness")
   * This is NOT a grammar error because nothing was conjugated/spelled wrong

IMPORTANT CATEGORY DISTINCTION:
- "grammar" = the student made a MISTAKE (wrong conjugation, wrong agreement, etc.)
- "naturalness" = the student wrote something grammatically CORRECT but UNNATURAL

Return JSON:
{
  "modelSentence": "${hasHelpRequests ? 'The complete sentence with bracketed expressions replaced by natural ' + targetLanguage : 'A more natural way to express this in ' + targetLanguage + ' (if needed, or the same sentence if perfect)'}",
  "feedback": {
    "correctness": <1-5, where 5 = no errors>,
    "naturalness": <1-5, where 5 = sounds completely native>,
    "explanation": "${hasHelpRequests ? 'A friendly explanation of how to express the bracketed ideas. Start with something like: Here\'s how you can say that in ' + targetLanguage + '... Then explain each expression naturally.' : 'Optional brief overall feedback'}",
    "corrections": [
      {
        "category": "spelling" | "grammar" | "punctuation" | "naturalness"${hasHelpRequests ? ' | "expression"' : ''},
        "severity": "minor" | "major",
        "original": "ONLY the specific word(s) with the error - NOT the entire sentence",
        "correction": "corrected version of ONLY those word(s)",
        "explanation": "Brief explanation in ${feedbackLang}",
        "exampleSentence": "A natural example sentence using the correction in context"
      }
    ]
  }
}

CRITICAL RULES:
- "original" must contain ONLY the specific word(s) with errors, NOT surrounding correct words. Example: if "hechu" is misspelled in "no hemos hechu nada", original should be "hechu" NOT the whole phrase
- "original" must EXACTLY match text in student's writing (for highlighting)
- SEVERITY IS IMPORTANT:
  * "minor": Missing/wrong ACCENTS ONLY (e.g., "pagina" → "página", "esta" → "está", "Todavia" → "Todavía"), punctuation errors, naturalness suggestions
  * "major": Wrong letters, missing letters, extra letters, grammar errors (conjugation, agreement, word order)
- If the ONLY issue is a missing accent mark, severity MUST be "minor"
${hasHelpRequests ? '- For each bracketed expression, add a correction with category "expression" showing the ' + targetLanguage + ' equivalent' : ''}
${hasHelpRequests ? '- The feedback.explanation should feel like a helpful tutor explaining how to express the ideas' : ''}
- If the sentence is perfect (and no help requests), return empty corrections array
- Be encouraging - acknowledge what they did well
- Only return valid JSON, no other text`

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: prompt,
      text: { format: { type: 'json_object' } },
    })

    let result
    try {
      let text = response.output_text || ''
      // Clean up markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      result = JSON.parse(text)
    } catch (parseErr) {
      console.error('Failed to parse feedback response:', parseErr)
      return res.status(500).json({ error: 'Failed to parse feedback response' })
    }

    // Add position indices for corrections and fix severity based on error type
    if (result.feedback?.corrections) {
      result.feedback.corrections = result.feedback.corrections.map(c => {
        const startIndex = userText.indexOf(c.original)

        // Determine severity based on actual error type, not just what the model says
        let severity = c.severity || 'major'
        if (c.original && c.correction) {
          const normalizeAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
          const originalNorm = normalizeAccents(c.original)
          const correctionNorm = normalizeAccents(c.correction)

          // If removing accents makes them equal, it's an accent-only error → minor
          if (originalNorm === correctionNorm) {
            severity = 'minor'
            console.log(`Accent-only error detected: "${c.original}" → "${c.correction}", setting severity to minor`)
          }
          // If they differ after removing accents AND it's spelling/grammar → major (real mistake)
          else if ((c.category === 'spelling' || c.category === 'grammar') && originalNorm !== correctionNorm) {
            severity = 'major'
            console.log(`Real spelling/grammar error: "${c.original}" → "${c.correction}", setting severity to major`)
          }
          // Punctuation stays as-is (usually minor)
          // Naturalness stays as-is (usually minor)
        }

        return {
          ...c,
          severity,
          startIndex: startIndex >= 0 ? startIndex : 0,
          endIndex: startIndex >= 0 ? startIndex + c.original.length : 0,
        }
      })
    }

    return res.json(result)
  } catch (error) {
    console.error('Free writing feedback error:', error)
    return res.status(500).json({ error: 'Failed to get feedback' })
  }
})

// Free Writing Document Feedback Endpoint (full document review)
app.post('/api/freewriting/document-feedback', async (req, res) => {
  try {
    const { document, targetLanguage, sourceLanguage, textType } = req.body || {}

    if (!document || !targetLanguage) {
      return res.status(400).json({ error: 'document and targetLanguage are required' })
    }

    const sourceLang = sourceLanguage || 'English'
    const type = textType || 'general writing'

    const prompt = `You are a supportive ${targetLanguage} language tutor reviewing a student's complete ${type}.

STUDENT'S DOCUMENT (${targetLanguage}):
"""
${document}
"""

YOUR TASK: Provide comprehensive feedback on the entire document.

Analyze:
1. Overall grammar and spelling accuracy
2. Vocabulary usage and variety
3. Sentence structure and flow
4. Coherence and organization
5. Naturalness - does it sound like a native speaker wrote it?

Return JSON:
{
  "overallFeedback": {
    "overallScore": <1-5, overall quality>,
    "grammarScore": <1-5>,
    "vocabularyScore": <1-5>,
    "coherenceScore": <1-5>,
    "naturalnessScore": <1-5>,
    "summary": "2-3 sentence summary of the writing quality in ${sourceLang}",
    "strengths": ["strength 1", "strength 2", ...],
    "suggestions": ["suggestion 1", "suggestion 2", ...]
  },
  "lineByLineFeedback": [
    {
      "lineIndex": 0,
      "original": "first sentence",
      "modelSentence": "improved version if needed",
      "feedback": {
        "corrections": [
          {
            "category": "spelling" | "grammar" | "naturalness",
            "original": "text",
            "correction": "fixed text",
            "explanation": "brief explanation"
          }
        ]
      }
    }
  ]
}

Be encouraging while being thorough. Highlight what the student did well.
Only return valid JSON, no other text.`

    const response = await client.responses.create({
      model: 'gpt-4o',
      input: prompt,
    })

    let result
    try {
      let text = response.output_text || ''
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      result = JSON.parse(text)
    } catch (parseErr) {
      console.error('Failed to parse document feedback response:', parseErr)
      return res.status(500).json({ error: 'Failed to parse feedback response' })
    }

    return res.json(result)
  } catch (error) {
    console.error('Document feedback error:', error)
    return res.status(500).json({ error: 'Failed to get document feedback' })
  }
})

// ============================================
// TUTOR CHAT API
// ============================================

/**
 * Start a new tutor conversation or continue existing
 */
app.post('/api/tutor/start', async (req, res) => {
  try {
    const { targetLanguage, sourceLanguage, memory } = req.body || {}

    if (!targetLanguage) {
      return res.status(400).json({ error: 'targetLanguage is required' })
    }

    const sourceLang = sourceLanguage || 'English'
    const isReturning = memory && (memory.userFacts?.length > 0 || memory.lastConversationSummary)

    // Build memory context for returning users
    let memoryContext = ''
    if (isReturning) {
      const facts = memory.userFacts?.slice(-5).join(', ') || ''
      const lastSummary = memory.lastConversationSummary || ''
      const mistakes = memory.recurringMistakes?.slice(-3).join(', ') || ''

      memoryContext = `
WHAT YOU REMEMBER ABOUT THIS PERSON:
${facts ? `- Facts: ${facts}` : ''}
${lastSummary ? `- Last conversation: ${lastSummary}` : ''}
${mistakes ? `- Common mistakes they make: ${mistakes}` : ''}
`
    }

    const systemPrompt = `You are a friendly language tutor chatting naturally with a student learning ${targetLanguage}.
Their native language is ${sourceLang}.
${memoryContext}
HOW TO BE:
- Talk like a real person texting a friend
- Be warm, curious, genuine
- ${isReturning ? 'Reference something from your past conversations naturally' : 'Introduce yourself briefly and ask something to get to know them'}
- Keep it short and conversational (1-3 sentences max)
- Write primarily in ${targetLanguage}, with occasional ${sourceLang} if helpful
- Match your vocabulary to their level (${memory?.observedLevel || 'beginner'})

Generate a natural, friendly opening message to start or continue the conversation.`

    const response = await client.responses.create({
      model: 'gpt-4o',
      input: systemPrompt,
    })

    const greeting = response.output_text?.trim() || `¡Hola! ¿Cómo estás hoy?`

    return res.json({
      greeting,
      isReturningUser: isReturning,
    })
  } catch (error) {
    console.error('Tutor start error:', error)
    return res.status(500).json({ error: 'Failed to start tutor conversation' })
  }
})

/**
 * Send a message to the tutor and get a response
 */
app.post('/api/tutor/message', async (req, res) => {
  try {
    const { message, targetLanguage, sourceLanguage, conversationHistory, memory } = req.body || {}

    if (!message || !targetLanguage) {
      return res.status(400).json({ error: 'message and targetLanguage are required' })
    }

    const sourceLang = sourceLanguage || 'English'

    // Build memory context
    let memoryContext = ''
    if (memory) {
      const facts = memory.userFacts?.slice(-5).join(', ') || ''
      const mistakes = memory.recurringMistakes?.slice(-3).join(', ') || ''

      if (facts || mistakes) {
        memoryContext = `
WHAT YOU KNOW ABOUT THIS PERSON:
${facts ? `- Facts: ${facts}` : ''}
${mistakes ? `- Mistakes they often make: ${mistakes}` : ''}
`
      }
    }

    // Build conversation history
    const historyMessages = (conversationHistory || []).map((m) => ({
      role: m.role === 'tutor' ? 'assistant' : 'user',
      content: m.content,
    }))

    const systemPrompt = `You are a friendly language tutor chatting naturally with a student learning ${targetLanguage}.
Their native language is ${sourceLang}.
${memoryContext}
HOW TO BE:
- Talk like a real person texting a friend
- Be warm, curious, genuine
- Ask about their life, remember details they share
- Keep the conversation flowing naturally
- Correct mistakes NATURALLY within your response - don't make it a lesson
- Write primarily in ${targetLanguage}, with ${sourceLang} only when explaining corrections
- Keep responses conversational length (1-4 sentences typically)
- Match vocabulary to their level (${memory?.observedLevel || 'beginner'})
- Don't be overly encouraging or teacherly - just be real

VOICE MESSAGES:
- Students can send you voice messages which are automatically transcribed to text
- You CAN hear/understand their voice messages - they appear as text in the conversation
- Never say you can't listen to audio - their speech is transcribed for you
- If they ask you to listen to something, respond to what they said

CORRECTION STYLE:
When they make a mistake, work the correction into your natural response.
Example: If they say "Yo soy hambre", you might respond:
"Jaja yo también tengo hambre! (btw it's 'tengo hambre' not 'soy' - hunger uses tener in Spanish) ¿Qué vas a comer?"

NOT like this:
"Great try! Just a small correction: in Spanish we use 'tener' for hunger, so it should be 'tengo hambre'. Keep up the good work!"

Respond naturally to the student's message.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message },
    ]

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.8,
    })

    const tutorResponse = response.choices?.[0]?.message?.content?.trim() || 'Lo siento, no entendí. ¿Puedes repetir?'

    return res.json({
      response: tutorResponse,
    })
  } catch (error) {
    console.error('Tutor message error:', error)
    return res.status(500).json({ error: 'Failed to get tutor response' })
  }
})

/**
 * Generate TTS audio for tutor response
 */
app.post('/api/tutor/tts', async (req, res) => {
  try {
    const { text, language, voiceGender } = req.body || {}

    if (!text) {
      return res.status(400).json({ error: 'text is required' })
    }

    const lang = language || 'Spanish'
    const gender = voiceGender || 'male'

    // Resolve voice ID
    let voiceId
    try {
      const resolved = resolveElevenLabsVoiceId(lang, gender)
      voiceId = resolved.voiceId
    } catch (voiceErr) {
      console.error('Failed to resolve voice:', voiceErr)
      return res.status(400).json({ error: 'Unsupported language or voice' })
    }

    // Generate TTS audio
    const audioBuffer = await requestElevenLabsTts(text, voiceId)

    // Return audio as base64
    res.json({
      audioBase64: audioBuffer.toString('base64'),
      contentType: 'audio/mpeg'
    })
  } catch (error) {
    console.error('Tutor TTS error:', error)
    return res.status(500).json({ error: 'Failed to generate audio' })
  }
})

/**
 * Generate a chat title based on conversation content
 */
app.post('/api/tutor/generate-title', async (req, res) => {
  try {
    const { messages, language } = req.body || {}

    if (!messages || messages.length < 2) {
      return res.json({ title: null })
    }

    // Take first few messages for context
    const contextMessages = messages.slice(0, 4)
    const conversationText = contextMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Tutor'}: ${m.content}`)
      .join('\n')

    const prompt = `Generate a short, descriptive title (3-6 words) for this ${language || 'language learning'} conversation. The title should capture the main topic or theme.

CONVERSATION:
${conversationText}

Return ONLY the title, nothing else. No quotes, no punctuation at the end.`

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: prompt,
    })

    const title = (response.output_text || '').trim().replace(/^["']|["']$/g, '')

    res.json({ title: title || null })
  } catch (error) {
    console.error('Generate title error:', error)
    res.json({ title: null })
  }
})

/**
 * End a session and extract memory updates
 */
app.post('/api/tutor/end-session', async (req, res) => {
  try {
    const { conversationHistory, targetLanguage, sourceLanguage } = req.body || {}

    if (!conversationHistory || conversationHistory.length === 0) {
      return res.json({ memoryUpdates: null })
    }

    const conversationText = conversationHistory
      .map((m) => `${m.role === 'tutor' ? 'Tutor' : 'Student'}: ${m.content}`)
      .join('\n')

    const prompt = `Analyze this conversation between a language tutor and a student learning ${targetLanguage}.
Extract information to remember for future conversations.

CONVERSATION:
${conversationText}

Return JSON with:
{
  "userFacts": ["fact1", "fact2"], // New things learned about the student (interests, job, life events)
  "recurringMistakes": ["mistake1"], // Language mistakes they made (patterns, not one-offs)
  "topicsDiscussed": ["topic1", "topic2"], // Main topics in this conversation
  "summary": "2-3 sentence summary of what was discussed",
  "observedLevel": "beginner" | "intermediate" | "advanced" // Your assessment of their level
}

Only include facts that would be useful to remember. Return ONLY valid JSON.`

    const response = await client.responses.create({
      model: 'gpt-4o',
      input: prompt,
    })

    let memoryUpdates
    try {
      const text = response.output_text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        memoryUpdates = JSON.parse(jsonMatch[0])
      }
    } catch (parseErr) {
      console.error('Failed to parse memory updates:', parseErr)
      memoryUpdates = null
    }

    return res.json({ memoryUpdates })
  } catch (error) {
    console.error('Tutor end-session error:', error)
    return res.status(500).json({ error: 'Failed to extract memory updates' })
  }
})

// ============================================================================
// SPEECH ENDPOINTS
// ============================================================================

// Language code mapping for Whisper
const SPEECH_LANGUAGE_CODES = {
  'English': 'en',
  'Spanish': 'es',
  'French': 'fr',
  'Italian': 'it',
  'German': 'de',
  'Portuguese': 'pt',
  'Japanese': 'ja',
  'Chinese': 'zh',
  'Korean': 'ko'
}

/**
 * Simple audio transcription endpoint for tutor voice messages
 */
app.post('/api/speech/transcribe', upload.single('audio'), async (req, res) => {
  let tempFilePath = null
  try {
    const audioFile = req.file
    const language = req.body.language || 'en'

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' })
    }

    console.log('Transcribe request received:', {
      size: audioFile.size,
      mimetype: audioFile.mimetype,
      language: language
    })

    // Get language code
    const languageCode = SPEECH_LANGUAGE_CODES[language] || language.toLowerCase().slice(0, 2) || 'en'

    // Save buffer to temporary file (OpenAI SDK needs a file stream in Node.js)
    const tempDir = os.tmpdir()
    tempFilePath = path.join(tempDir, `tutor-audio-${Date.now()}.webm`)
    await fs.writeFile(tempFilePath, audioFile.buffer)

    console.log('Temp file saved:', tempFilePath, 'Size:', audioFile.buffer.length)

    // Transcribe using Whisper with file stream
    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(tempFilePath),
      model: 'whisper-1',
      language: languageCode
    })

    console.log('Transcription result:', transcription.text)

    res.json({
      text: transcription.text || '',
      language: languageCode
    })
  } catch (error) {
    console.error('Transcription error:', error)
    res.status(500).json({ error: 'Failed to transcribe audio' })
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath)
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
})

/**
 * Upload speech recording to Firebase Storage
 */
app.post('/api/speech/upload', upload.single('audio'), async (req, res) => {
  try {
    const { userId, language } = req.body
    const audioFile = req.file

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' })
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `speech_${timestamp}.webm`
    const storagePath = `audio/speech/${userId}/${filename}`

    // Upload to Firebase Storage
    const file = bucket.file(storagePath)
    await file.save(audioFile.buffer, {
      contentType: audioFile.mimetype || 'audio/webm',
      metadata: {
        cacheControl: 'public, max-age=31536000'
      }
    })
    await file.makePublic()

    const audioUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`

    res.json({ audioUrl, storagePath })
  } catch (error) {
    console.error('Speech upload error:', error)
    res.status(500).json({ error: 'Failed to upload recording' })
  }
})

/**
 * Convert audio from webm/ogg to wav format for Azure Speech Services
 * Uses ffmpeg for reliable conversion - 16kHz mono PCM required
 */
async function convertWebmToWav(audioBuffer) {
  const tmpDir = os.tmpdir()
  const inputPath = path.join(tmpDir, `input-${Date.now()}.webm`)
  const outputPath = path.join(tmpDir, `output-${Date.now()}.wav`)

  try {
    // Write input file
    await fs.writeFile(inputPath, audioBuffer)

    // Convert using ffmpeg - Azure requires 16kHz mono PCM
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-acodec pcm_s16le',
          '-ar 16000',
          '-ac 1'
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    // Read output file and return paths for cleanup
    const wavBuffer = await fs.readFile(outputPath)
    return { wavBuffer, wavPath: outputPath, inputPath }
  } catch (err) {
    // Cleanup on error
    try { await fs.unlink(inputPath) } catch {}
    try { await fs.unlink(outputPath) } catch {}
    throw err
  }
}

/**
 * Azure Speech Services Pronunciation Assessment
 * Provides real acoustic phoneme-level analysis
 */
async function assessPronunciationWithAzure(wavPath, referenceText, language) {
  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION

  if (!speechKey || !speechRegion) {
    throw new Error('Azure Speech credentials not configured')
  }

  // Map language names to Azure locale codes
  const localeMap = {
    'French': 'fr-FR',
    'Spanish': 'es-ES',
    'Italian': 'it-IT',
    'German': 'de-DE',
    'Portuguese': 'pt-BR',
    'Japanese': 'ja-JP',
    'Chinese': 'zh-CN',
    'Korean': 'ko-KR',
    'Russian': 'ru-RU',
    'English': 'en-US'
  }
  const locale = localeMap[language] || 'en-US'

  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion)
    speechConfig.speechRecognitionLanguage = locale

    // Configure pronunciation assessment with all metrics
    const pronConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true // Enable miscue detection
    )
    pronConfig.enableProsodyAssessment = true

    // Create audio config from file
    const audioConfig = sdk.AudioConfig.fromWavFileInput(
      require('fs').readFileSync(wavPath)
    )

    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
    pronConfig.applyTo(recognizer)

    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          const pronResult = sdk.PronunciationAssessmentResult.fromResult(result)

          // Extract detailed scores
          const detailedResult = {
            recognizedText: result.text,
            pronunciationScore: pronResult.pronunciationScore,
            accuracyScore: pronResult.accuracyScore,
            fluencyScore: pronResult.fluencyScore,
            completenessScore: pronResult.completenessScore,
            prosodyScore: pronResult.prosodyScore,
            words: []
          }

          // Get word-level and phoneme-level details from JSON
          const jsonResult = result.properties.getProperty(
            sdk.PropertyId.SpeechServiceResponse_JsonResult
          )

          if (jsonResult) {
            try {
              const parsed = JSON.parse(jsonResult)
              // Log raw structure to debug phoneme extraction
              console.log('Raw Azure JSON (first word):', JSON.stringify(parsed.NBest?.[0]?.Words?.[0], null, 2))
              const nBest = parsed.NBest?.[0]

              if (nBest?.Words) {
                detailedResult.words = nBest.Words.map(word => ({
                  word: word.Word,
                  accuracyScore: word.PronunciationAssessment?.AccuracyScore || 0,
                  errorType: word.PronunciationAssessment?.ErrorType || 'None',
                  phonemes: (word.Phonemes || []).map(p => ({
                    phoneme: p.Phoneme,
                    accuracyScore: p.PronunciationAssessment?.AccuracyScore || 0
                  }))
                }))
              }

              if (nBest?.PronunciationAssessment?.Prosody) {
                detailedResult.prosodyDetails = nBest.PronunciationAssessment.Prosody
              }
            } catch (parseErr) {
              console.error('Error parsing Azure JSON result:', parseErr)
            }
          }

          recognizer.close()
          resolve(detailedResult)
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          recognizer.close()
          reject(new Error('No speech could be recognized'))
        } else {
          recognizer.close()
          reject(new Error(`Recognition failed: ${result.reason}`))
        }
      },
      (err) => {
        recognizer.close()
        reject(err)
      }
    )
  })
}

/**
 * Generate accent analysis summary from Azure results
 */
function generateAccentAnalysis(result, language) {
  const score = result.pronunciationScore || 0
  const accuracy = result.accuracyScore || 0
  const fluency = result.fluencyScore || 0
  const prosody = result.prosodyScore || 0

  const errors = result.words?.filter(w => w.errorType !== 'None') || []

  let analysis = ''

  if (score >= 90) {
    analysis = `Excellent ${language} pronunciation. `
  } else if (score >= 80) {
    analysis = `Very good ${language} pronunciation with minor areas for improvement. `
  } else if (score >= 70) {
    analysis = `Good ${language} pronunciation. Clear accent but fully comprehensible. `
  } else if (score >= 60) {
    analysis = `Developing ${language} pronunciation. Some sounds need attention. `
  } else {
    analysis = `${language} pronunciation needs practice. Focus on individual sounds. `
  }

  if (accuracy < fluency - 10) {
    analysis += 'Individual sounds need more work than overall flow. '
  } else if (fluency < accuracy - 10) {
    analysis += 'Good sounds but work on smoother delivery. '
  }

  if (prosody && prosody < 70) {
    analysis += 'Pay attention to intonation and rhythm patterns. '
  }

  if (errors.length > 0) {
    const omissions = errors.filter(e => e.errorType === 'Omission').length
    const mispron = errors.filter(e => e.errorType === 'Mispronunciation').length
    if (omissions > 0) analysis += `${omissions} word(s) were missed. `
    if (mispron > 0) analysis += `${mispron} word(s) had pronunciation errors. `
  }

  return analysis.trim()
}

/**
 * Get articulatory advice for a phoneme
 */
function getPhonemeAdvice(phoneme, language) {
  // Language-specific detailed articulatory instructions
  const spanishPhonemes = {
    // Vowels - Spanish has pure monophthongs, English speakers add glides
    'a': {
      error: "You're using English 'ah' which drifts. Spanish /a/ is pure and front.",
      fix: "Open mouth wide, tongue low and forward, NO movement during the vowel. Hold steady."
    },
    'e': {
      error: "You're saying English 'ay' with a glide to 'ee'. Spanish /e/ is a pure monophthong.",
      fix: "Mid-front vowel, tongue halfway up. NO glide - freeze your tongue throughout."
    },
    'i': {
      error: "English 'ee' has tongue movement. Spanish /i/ is tense and pure.",
      fix: "Tongue high and front, touching side teeth. Keep it absolutely still. Short and crisp."
    },
    'o': {
      error: "You're saying English 'oh' which glides to 'oo'. Spanish /o/ is pure.",
      fix: "Mid-back rounded vowel. Lips rounded, tongue mid-height at back. NO movement."
    },
    'u': {
      error: "English 'oo' often starts with a 'y' sound. Spanish /u/ is pure.",
      fix: "Lips tightly rounded, tongue high and back. No glide. Start and stay back."
    },
    // The R sounds - biggest English speaker problem
    'ɾ': {
      error: "You're using English R (tongue curled back, never touches). Spanish uses alveolar tap.",
      fix: "Single quick flick: tongue tip taps ONCE against alveolar ridge (bump behind upper teeth). Like 't' in American 'butter'. Very fast touch-and-release."
    },
    'r': {
      error: "English R doesn't touch anything. Spanish trilled R requires tongue vibration.",
      fix: "Tongue tip loosely against alveolar ridge. Push air to make tongue flutter. Practice 'butter' fast, sustain the middle. Keep tongue relaxed, not tense."
    },
    // Dental vs alveolar consonants
    't': {
      error: "English T is alveolar with aspiration (puff of air). Spanish T is dental, no aspiration.",
      fix: "Tongue tip AGAINST back of upper front teeth (not the ridge). NO puff of air. Like T in 'stop'."
    },
    'd': {
      error: "English D is alveolar. Spanish D is dental, and becomes fricative between vowels.",
      fix: "Tongue tip touches back of upper front teeth. Between vowels, don't fully close - like 'th' in 'this'."
    },
    // Fricative allophones
    'β': {
      error: "Between vowels, Spanish B is a fricative - lips don't fully close.",
      fix: "Lips come CLOSE but don't touch. Air flows continuously. Like blowing gently while saying 'b'."
    },
    'ð': {
      error: "Between vowels, Spanish D becomes like 'th' in 'this'.",
      fix: "Tongue tip between teeth, light contact. Air flows around tongue. NOT a full stop."
    },
    'ɣ': {
      error: "Between vowels, Spanish G is a fricative - tongue doesn't touch.",
      fix: "Back tongue approaches soft palate but doesn't touch. Air flows through. Like gentle gargling."
    },
    'x': {
      error: "This is Spanish 'j' (jota). Not English 'h'.",
      fix: "Back of tongue close to soft palate, strong friction. Like Scottish 'loch'. Much more friction than English H."
    },
    'ɲ': {
      error: "This is 'ñ'. Not 'ny' as two sounds.",
      fix: "Middle of tongue presses flat against hard palate. Single sound. Like 'canyon' but one gesture."
    },
    's': {
      error: "Spanish S is crisp and high-frequency.",
      fix: "Tongue tip behind lower teeth, blade creates narrow channel at alveolar ridge. Crisp, sharp hiss."
    },
    'l': {
      error: "English has 'dark L' (back of tongue raised). Spanish L is always 'clear'.",
      fix: "Tongue tip at ridge, but keep BACK of tongue LOW. Never use dark L like in 'full'."
    },
    'p': {
      error: "English P has aspiration. Spanish P does not.",
      fix: "NO puff of air. Like P in 'spin' (after S), not P in 'pin'."
    },
    'k': {
      error: "English K has aspiration. Spanish K does not.",
      fix: "NO puff of air. Like K in 'skin', not 'kin'."
    }
  }

  const frenchPhonemes = {
    'ʁ': {
      error: "You're using tongue-tip R. French uses uvular R from throat.",
      fix: "Constrict back of throat where you'd gargle. Tongue tip stays DOWN. Friction from uvula/back tongue."
    },
    'y': {
      error: "This doesn't exist in English. It's /i/ lips with /u/ tongue position.",
      fix: "Say 'ee' (tongue high front), then round lips like 'oo' WITHOUT moving tongue. Keep tongue front."
    },
    'ø': {
      error: "English doesn't have this rounded front vowel.",
      fix: "Say 'ay', then round lips WITHOUT moving tongue back. 'Ay' through an 'o' lip shape."
    },
    'œ': {
      error: "Like /ø/ but more open.",
      fix: "Say 'eh', round your lips. Tongue front and low-mid. More open than /ø/."
    },
    'ɑ̃': {
      error: "This is nasal. Not 'ah' + 'n'.",
      fix: "Say 'ah' while lowering soft palate for air through nose. NO tongue contact for N."
    },
    'ɛ̃': {
      error: "Not 'eh' + 'n'. Single nasal vowel.",
      fix: "Say 'eh' with air through nose. Soft palate down. No N consonant."
    },
    'ɔ̃': {
      error: "Not 'oh' + 'n'. Single nasal vowel.",
      fix: "Say 'oh' with air through nose. No N closure."
    }
  }

  let tips = language === 'Spanish' ? spanishPhonemes : language === 'French' ? frenchPhonemes : {}
  const advice = tips[phoneme]
  if (advice) {
    return `ERROR: ${advice.error} → FIX: ${advice.fix}`
  }
  return `Phoneme /${phoneme}/ not matching target. Listen to native audio and match exact mouth position.`
}

/**
 * Pronunciation assessment endpoint
 * Uses Azure Speech Services for real acoustic phoneme-level analysis
 */
app.post('/api/speech/assess-pronunciation', async (req, res) => {
  let wavPath = null
  let inputPath = null

  try {
    const { audioBase64, referenceText, language } = req.body

    if (!audioBase64 || !referenceText) {
      return res.status(400).json({ error: 'Audio and reference text required' })
    }

    // Check Azure credentials
    if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
      console.error('Azure Speech credentials not found in environment')
      return res.status(500).json({ error: 'Speech service not configured' })
    }

    // Convert webm from browser to wav for Azure
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const conversion = await convertWebmToWav(audioBuffer)
    wavPath = conversion.wavPath
    inputPath = conversion.inputPath

    console.log('Converted audio to WAV:', conversion.wavBuffer.length, 'bytes')
    console.log('Assessing pronunciation with Azure Speech Services...')

    // Get Azure pronunciation assessment
    const azureResult = await assessPronunciationWithAzure(wavPath, referenceText, language)

    console.log('Azure assessment complete:', {
      pronunciation: azureResult.pronunciationScore,
      accuracy: azureResult.accuracyScore,
      fluency: azureResult.fluencyScore,
      completeness: azureResult.completenessScore,
      prosody: azureResult.prosodyScore
    })

    // Log detailed phoneme analysis to understand what Azure is assessing
    console.log('=== PHONEME BREAKDOWN ===')
    azureResult.words?.forEach(word => {
      console.log(`Word: "${word.word}" - Accuracy: ${word.accuracyScore}, Error: ${word.errorType}`)
      word.phonemes?.forEach(p => {
        console.log(`  Phoneme: /${p.phoneme}/ - Accuracy: ${p.accuracyScore}`)
      })
    })
    console.log('=========================')

    // BRUTAL SCORING: Your weakest phoneme defines your score
    // This is for advanced learners refining their accent - no mercy
    const brutalWordScores = azureResult.words?.map(w => {
      const phonemeScores = w.phonemes?.map(p => p.accuracyScore) || []
      const minPhoneme = phonemeScores.length > 0 ? Math.min(...phonemeScores) : w.accuracyScore
      const avgPhoneme = phonemeScores.length > 0
        ? phonemeScores.reduce((a, b) => a + b, 0) / phonemeScores.length
        : w.accuracyScore

      // Brutal score: 70% weight on worst phoneme, 30% on average
      let brutalScore = (minPhoneme * 0.7) + (avgPhoneme * 0.3)

      // Error type penalties
      if (w.errorType === 'Mispronunciation') {
        brutalScore = Math.min(brutalScore, 35) // Hard cap
      }
      if (w.errorType === 'Omission') {
        brutalScore = 0
      }

      console.log(`Brutal score for "${w.word}": ${Math.round(brutalScore)} (min phoneme: ${minPhoneme}, avg: ${Math.round(avgPhoneme)}, error: ${w.errorType})`)

      return { word: w.word, brutalScore, minPhoneme, avgPhoneme, errorType: w.errorType }
    }) || []

    const brutalOverall = brutalWordScores.length > 0
      ? brutalWordScores.reduce((a, b) => a + b.brutalScore, 0) / brutalWordScores.length
      : 0

    console.log(`BRUTAL OVERALL SCORE: ${Math.round(brutalOverall)} (Azure gave: ${Math.round(azureResult.pronunciationScore)})`)

    // Format response for frontend
    const response = {
      referenceText,
      transcription: azureResult.recognizedText,
      // Use brutal score, not Azure's lenient one
      pronunciationScore: Math.round(brutalOverall),
      accuracyScore: Math.round(brutalOverall), // Override with brutal
      fluencyScore: Math.round(azureResult.fluencyScore || 0),
      completenessScore: Math.round(azureResult.completenessScore || 0),
      prosodyScore: Math.round(azureResult.prosodyScore || 0),

      // Keep Azure's original for reference
      azureOriginalScore: Math.round(azureResult.pronunciationScore || 0),

      // Map to dimension scores format for UI - using brutal calculations
      dimensionScores: {
        segmental: {
          vowels: Math.round(brutalOverall * 0.2),
          consonants: Math.round(brutalOverall * 0.2),
          notes: brutalWordScores
            .filter(w => w.brutalScore < 60)
            .map(w => `"${w.word}": ${Math.round(w.brutalScore)}% (weakest phoneme: ${w.minPhoneme})`)
            .join(', ') || 'Good segmental accuracy'
        },
        prosody: {
          stress: Math.round((azureResult.prosodyScore || 50) * 0.12),
          rhythm: Math.round((azureResult.prosodyScore || 50) * 0.12),
          intonation: Math.round((azureResult.prosodyScore || 50) * 0.11),
          notes: `Prosody: ${Math.round(azureResult.prosodyScore || 0)}%`
        },
        connectedSpeech: {
          liaison: Math.round((azureResult.fluencyScore || 50) * 0.08),
          elision: Math.round((azureResult.fluencyScore || 50) * 0.07),
          notes: 'Based on fluency metrics'
        },
        fluency: {
          smoothness: Math.round((azureResult.fluencyScore || 50) * 0.05),
          pace: Math.round((azureResult.fluencyScore || 50) * 0.05),
          notes: `Fluency: ${Math.round(azureResult.fluencyScore || 0)}%`
        }
      },

      // Word-level details with brutal scores
      words: brutalWordScores.map(w => {
        const original = azureResult.words?.find(aw => aw.word === w.word)
        return {
          word: w.word,
          score: Math.round(w.brutalScore), // Brutal score
          accuracyScore: Math.round(w.brutalScore),
          minPhoneme: w.minPhoneme,
          errorType: w.errorType,
          phonemes: original?.phonemes?.map(p => ({
            phoneme: p.phoneme,
            accuracyScore: Math.round(p.accuracyScore || 0)
          })) || []
        }
      }),

      // Generate issues from brutal scoring - be harsh
      majorIssues: brutalWordScores
        .filter(w => w.brutalScore < 70) // Anything below 70 is an issue
        .map(w => {
          if (w.errorType === 'Omission') return `"${w.word}" - not pronounced`
          if (w.errorType === 'Mispronunciation') return `"${w.word}" - mispronounced (${Math.round(w.brutalScore)}%)`
          return `"${w.word}" - ${Math.round(w.brutalScore)}% (weakest: ${w.minPhoneme}%)`
        })
        .slice(0, 5),

      // Generate articulatory tips from low-scoring phonemes
      articulatoryTips: azureResult.words
        ?.flatMap(w =>
          (w.phonemes || [])
            .filter(p => p.accuracyScore < 70)
            .map(p => ({
              phoneme: p.phoneme,
              issue: `Low accuracy in "${w.word}"`,
              tip: getPhonemeAdvice(p.phoneme, language)
            }))
        )
        .slice(0, 4) || [],

      accentAnalysis: generateAccentAnalysis(azureResult, language)
    }

    res.json(response)

  } catch (error) {
    console.error('Pronunciation assessment error:', error)
    res.status(500).json({
      error: 'Failed to assess pronunciation',
      details: error.message
    })
  } finally {
    // Cleanup temp files
    if (wavPath) try { await fs.unlink(wavPath) } catch {}
    if (inputPath) try { await fs.unlink(inputPath) } catch {}
  }
})

/**
 * GPT-4o Audio Pronunciation Comparison
 * Compares user recording directly against native speaker recording
 * For advanced learners - brutal, specific articulatory feedback
 */
app.post('/api/speech/compare-pronunciation', async (req, res) => {
  let wavPath = null
  let inputPath = null

  try {
    const { userAudioBase64, targetAudioUrl, targetStart, targetEnd, referenceText, language } = req.body

    if (!userAudioBase64 || !targetAudioUrl || !referenceText) {
      return res.status(400).json({ error: 'User audio, target audio URL, and reference text required' })
    }

    console.log('Comparing pronunciation with GPT-4o audio...')
    console.log('Target:', targetAudioUrl, `${targetStart}s - ${targetEnd}s`)

    // Convert user's webm to wav (GPT-4o only accepts wav/mp3)
    const userAudioBuffer = Buffer.from(userAudioBase64, 'base64')
    const conversion = await convertWebmToWav(userAudioBuffer)
    wavPath = conversion.wavPath
    inputPath = conversion.inputPath
    const userWavBase64 = conversion.wavBuffer.toString('base64')
    console.log('Converted user audio to WAV:', conversion.wavBuffer.length, 'bytes')

    // Fetch target audio (already mp3)
    const targetResponse = await fetch(targetAudioUrl)
    const targetBuffer = Buffer.from(await targetResponse.arrayBuffer())
    const targetBase64 = targetBuffer.toString('base64')
    console.log('Fetched target audio:', targetBuffer.length, 'bytes')

    // The prompt - brutal and specific
    const comparisonPrompt = `You are an expert phonetician and pronunciation coach for advanced ${language} learners. You will hear TWO audio recordings:

1. FIRST: A native ${language} speaker saying: "${referenceText}"
2. SECOND: A learner attempting the same phrase

Your job is to be BRUTALLY SPECIFIC about pronunciation errors. This is for advanced learners refining their accent - they don't need encouragement, they need precision.

ANALYZE EACH WORD and identify:

For EACH error, you MUST specify:
1. THE WORD containing the error
2. THE SPECIFIC SOUND that's wrong (use IPA if helpful)
3. WHAT THE LEARNER IS DOING (e.g., "using English retroflex R", "diphthongizing the vowel", "aspirating the consonant")
4. EXACTLY HOW TO FIX IT with articulatory instructions (tongue position, lip shape, airflow)

FOCUS ON:
- Vowel quality (pure vs diphthongized, front/back position, rounding)
- Consonant place/manner (dental vs alveolar, tapped vs approximant R, aspiration)
- Prosody (stress placement, rhythm, intonation contour)
- Connected speech (liaison, elision, assimilation)

DO NOT say things like "try to match the native speaker" or "practice more". Give SPECIFIC PHYSICAL INSTRUCTIONS.

Example good feedback:
"WORD: 'pero' - Your /r/ is wrong. You're using an English approximant (tongue curled back, not touching anything). Spanish uses an alveolar tap: flick tongue tip ONCE against the ridge behind your upper teeth. Quick touch-and-release, like the 't' in American 'butter'."

Example bad feedback:
"Your R sounds a bit off. Try to make it more Spanish-like." (TOO VAGUE)

Give me a JSON response with this structure:
{
  "overallScore": <0-100, be harsh>,
  "errors": [
    {
      "word": "<the word>",
      "sound": "<the problematic sound>",
      "issue": "<what they're doing wrong>",
      "fix": "<specific articulatory instruction>"
    }
  ],
  "prosodyNotes": "<comments on stress, rhythm, intonation>",
  "summary": "<one sentence brutal summary>"
}`

    // Call GPT-4o with both audio files
    const response = await client.chat.completions.create({
      model: 'gpt-4o-audio-preview',
      modalities: ['text'],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: comparisonPrompt },
            {
              type: 'input_audio',
              input_audio: {
                data: targetBase64,
                format: 'mp3'
              }
            },
            { type: 'text', text: 'That was the native speaker. Now here is the learner:' },
            {
              type: 'input_audio',
              input_audio: {
                data: userWavBase64,
                format: 'wav'
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    })

    const responseText = response.choices[0]?.message?.content || ''
    console.log('GPT-4o comparison response:', responseText)

    // Parse JSON from response
    let result
    try {
      // Extract JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseErr) {
      console.error('Failed to parse GPT response:', parseErr)
      result = {
        overallScore: 50,
        errors: [{ word: 'unknown', sound: 'unknown', issue: responseText, fix: 'See full response' }],
        prosodyNotes: '',
        summary: 'Could not parse structured response'
      }
    }

    res.json({
      ...result,
      rawResponse: responseText
    })

  } catch (error) {
    console.error('GPT-4o comparison error:', error)
    res.status(500).json({
      error: 'Failed to compare pronunciation',
      details: error.message
    })
  } finally {
    // Cleanup temp files
    if (wavPath) try { await fs.unlink(wavPath) } catch {}
    if (inputPath) try { await fs.unlink(inputPath) } catch {}
  }
})

/**
 * Speaking Practice Assessment Endpoint
 * For translation practice: user sees native text, speaks target language translation
 * Transcribes audio, compares to exemplar, returns feedback
 */
app.post('/api/speech/speaking-practice', async (req, res) => {
  try {
    const { audioBase64, nativeSentence, targetLanguage, sourceLanguage, skipRecording, exemplar: preloadedExemplar } = req.body

    if (!nativeSentence) {
      return res.status(400).json({ error: 'Native sentence required' })
    }

    const targetLangCode = SPEECH_LANGUAGE_CODES[targetLanguage] || 'es'

    // If user skipped recording, just return the exemplar
    if (skipRecording) {
      // Generate exemplar translation
      const exemplarResponse = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a translation assistant. Translate the given ${sourceLanguage || 'English'} sentence into natural, conversational ${targetLanguage}. Return ONLY the translated sentence, nothing else.`
          },
          {
            role: 'user',
            content: nativeSentence
          }
        ],
        temperature: 0.3
      })

      const exemplar = exemplarResponse.choices[0]?.message?.content?.trim() || ''

      return res.json({
        exemplar,
        vocab: []
      })
    }

    // User recorded audio - transcribe and assess
    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio required when not skipping recording' })
    }

    // Transcribe the audio
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' })
    const audioFile = new File([audioBlob], 'speech.webm', { type: 'audio/webm' })

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: targetLangCode
    })

    const userTranscription = transcription.text || ''

    // Use preloaded exemplar if available, otherwise generate one
    let exemplar = preloadedExemplar
    if (!exemplar) {
      const exemplarResponse = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Translate this ${sourceLanguage || 'English'} sentence into natural ${targetLanguage}. Return ONLY the translation.`
          },
          { role: 'user', content: nativeSentence }
        ],
        temperature: 0.3
      })
      exemplar = exemplarResponse.choices[0]?.message?.content?.trim() || ''
    }

    // Detailed assessment - compare user transcription to exemplar with corrections
    const assessmentResponse = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a ${targetLanguage} language tutor assessing a spoken translation attempt.
Compare the student's translation to the expected translation and provide detailed feedback.

Return JSON with this exact structure:
{
  "corrections": [
    {
      "category": "grammar" | "spelling" | "accuracy" | "naturalness",
      "original": "what they said wrong",
      "correction": "what they should have said",
      "explanation": "brief explanation of the error",
      "severity": "major" | "minor"
    }
  ],
  "vocab": [
    {"text": "word in ${targetLanguage}", "translation": "${sourceLanguage} meaning"}
  ]
}

Categories:
- "grammar": verb conjugation, gender agreement, word order errors
- "spelling": pronunciation errors that would be spelling errors if written (wrong sound)
- "accuracy": wrong word choice, missing words, or incorrect meaning
- "naturalness": technically correct but sounds unnatural or awkward

Severity:
- "major": changes meaning or is clearly wrong
- "minor": slightly unnatural but understandable

Include 1-3 useful vocab items from the exemplar. Only include corrections for actual errors.
If the translation is perfect, return empty corrections array.`
        },
        {
          role: 'user',
          content: `Original (${sourceLanguage}): "${nativeSentence}"
Expected (${targetLanguage}): "${exemplar}"
Student said: "${userTranscription}"`
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const assessment = JSON.parse(assessmentResponse.choices[0]?.message?.content || '{}')
    const corrections = assessment.corrections || []

    // Calculate accuracy from corrections
    const majorErrors = corrections.filter(c => c.severity === 'major').length
    const minorErrors = corrections.filter(c => c.severity === 'minor').length
    const accuracy = Math.max(0, Math.min(100, 100 - (majorErrors * 20) - (minorErrors * 5)))

    res.json({
      feedback: {
        accuracy,
        corrections,
        userTranscription
      },
      exemplar,
      vocab: assessment.vocab || []
    })

  } catch (error) {
    console.error('Speaking practice error:', error)
    res.status(500).json({ error: 'Assessment failed', details: error.message })
  }
})

/**
 * Batch Exemplar Prefetch Endpoint
 * Fetches translations for multiple sentences at once
 */
app.post('/api/speech/exemplars', async (req, res) => {
  try {
    const { sentences, targetLanguage, sourceLanguage } = req.body

    if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
      return res.status(400).json({ error: 'Sentences array required' })
    }

    // Batch translate all sentences
    const translationResponse = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a translation assistant. Translate each ${sourceLanguage || 'English'} sentence into natural, conversational ${targetLanguage}.
Return a JSON array with translations in the same order:
{"translations": ["translation1", "translation2", ...]}`
        },
        {
          role: 'user',
          content: JSON.stringify(sentences)
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const result = JSON.parse(translationResponse.choices[0]?.message?.content || '{"translations":[]}')

    res.json({
      exemplars: result.translations || []
    })

  } catch (error) {
    console.error('Exemplar prefetch error:', error)
    res.status(500).json({ error: 'Failed to fetch exemplars', details: error.message })
  }
})

/**
 * Full speech analysis endpoint
 * Transcribes audio and provides comprehensive feedback on correctness, accuracy, fluency
 */
app.post('/api/speech/analyze', async (req, res) => {
  try {
    const { audioBase64, referenceText, language, nativeLanguage, type, topic } = req.body

    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio required' })
    }

    const languageCode = SPEECH_LANGUAGE_CODES[language] || 'en'

    // Convert base64 to buffer and transcribe
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' })
    const audioFile = new File([audioBlob], 'speech.webm', { type: 'audio/webm' })

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      language: languageCode
    })

    const spokenText = transcription.text || ''
    const segments = transcription.segments || []
    const duration = transcription.duration || 0

    // Calculate basic fluency metrics
    const wordCount = spokenText.split(/\s+/).filter(w => w.length > 0).length
    const wordsPerMinute = duration > 0 ? Math.round((wordCount / duration) * 60) : 0

    // Estimate pause count from segments
    let pauseCount = 0
    for (let i = 1; i < segments.length; i++) {
      const gap = segments[i].start - segments[i - 1].end
      if (gap > 0.5) pauseCount++
    }

    // Build analysis prompt based on type
    let analysisPrompt
    if (type === 'spontaneous') {
      analysisPrompt = `You are a ${language} language tutor analyzing spontaneous speech from a student whose native language is ${nativeLanguage || 'English'}.

${topic ? `TOPIC: ${topic}` : ''}

TRANSCRIPTION OF STUDENT'S SPEECH:
"${spokenText}"

DURATION: ${Math.round(duration)} seconds
WORDS PER MINUTE: ${wordsPerMinute}

Analyze their speech and provide comprehensive feedback. Return JSON:
{
  "scores": {
    "overall": 0-100,
    "correctness": 0-100,
    "accuracy": 0-100,
    "fluency": 0-100
  },
  "corrections": [
    {
      "type": "grammar" | "vocabulary" | "pronunciation",
      "original": "what they said",
      "corrected": "better way to say it",
      "explanation": "brief explanation"
    }
  ],
  "fluencyAnalysis": {
    "wordsPerMinute": ${wordsPerMinute},
    "pauseCount": ${pauseCount},
    "fillerWords": count of um/uh/etc,
    "notes": ["note about fluency"]
  },
  "suggestions": ["focus area 1", "focus area 2"],
  "encouragement": "encouraging message about their speaking"
}

Be constructive and encouraging. Focus on the most impactful improvements.
Return ONLY valid JSON.`
    } else {
      // Reading analysis
      analysisPrompt = `You are a ${language} language tutor analyzing a student reading aloud. Their native language is ${nativeLanguage || 'English'}.

REFERENCE TEXT (what they were reading):
"${referenceText || 'Not provided'}"

TRANSCRIPTION OF STUDENT'S READING:
"${spokenText}"

DURATION: ${Math.round(duration)} seconds
WORDS PER MINUTE: ${wordsPerMinute}

Analyze their reading and provide comprehensive feedback. Return JSON:
{
  "scores": {
    "overall": 0-100,
    "correctness": 0-100,
    "accuracy": 0-100,
    "fluency": 0-100
  },
  "corrections": [
    {
      "type": "grammar" | "vocabulary" | "pronunciation",
      "original": "what they said wrong",
      "corrected": "correct version",
      "explanation": "brief explanation"
    }
  ],
  "fluencyAnalysis": {
    "wordsPerMinute": ${wordsPerMinute},
    "pauseCount": ${pauseCount},
    "notes": ["note about reading fluency"]
  },
  "suggestions": ["focus area 1", "focus area 2"],
  "encouragement": "encouraging message"
}

Compare the transcription to the reference text. Note mispronunciations, skipped words, and added words.
Be constructive and encouraging.
Return ONLY valid JSON.`
    }

    const response = await client.responses.create({
      model: 'gpt-4o',
      input: analysisPrompt
    })

    let analysis
    try {
      const text = response.output_text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found')
      }
    } catch (parseErr) {
      console.error('Failed to parse speech analysis:', parseErr)
      analysis = {
        scores: {
          overall: 70,
          correctness: 70,
          accuracy: 70,
          fluency: 70
        },
        corrections: [],
        fluencyAnalysis: {
          wordsPerMinute,
          pauseCount,
          notes: []
        },
        suggestions: ['Keep practicing regularly'],
        encouragement: 'Good effort! Keep practicing to improve your fluency.'
      }
    }

    res.json({
      transcription: spokenText,
      duration,
      ...analysis
    })
  } catch (error) {
    console.error('Speech analysis error:', error)
    res.status(500).json({ error: 'Failed to analyze speech' })
  }
})

// Transcribe story audio with Whisper to get word-level timestamps
// Used for pronunciation practice to sync audio segments precisely
app.post('/api/story/transcribe', async (req, res) => {
  const { uid, storyId, sessionId } = req.body || {}

  if (!uid || !storyId) {
    return res.status(400).json({ error: 'uid and storyId are required' })
  }

  try {
    // Get story document
    const storyRef = firestore.collection('users').doc(uid).collection('stories').doc(storyId)
    const storyDoc = await storyRef.get()

    if (!storyDoc.exists) {
      return res.status(404).json({ error: 'Story not found' })
    }

    const storyData = storyDoc.data()
    const { fullAudioUrl, language, outputLanguage } = storyData

    if (!fullAudioUrl) {
      return res.status(400).json({ error: 'Story does not have audio generated yet' })
    }

    // Check if transcript already exists
    const transcriptLang = (outputLanguage || language || 'en').toLowerCase()
    const transcriptRef = storyRef.collection('transcripts').doc(transcriptLang)
    const existingTranscript = await transcriptRef.get()

    if (existingTranscript.exists) {
      const data = existingTranscript.data()
      if (data.sentenceSegments && data.sentenceSegments.length > 0) {
        console.log(`Story ${storyId} already has transcript, returning cached`)

        // Update session if provided
        if (sessionId) {
          await firestore.collection('users').doc(uid).collection('pronunciationSessions').doc(sessionId).update({
            status: 'ready',
            updatedAt: new Date()
          })
        }

        return res.json({
          status: 'ready',
          cached: true,
          segmentCount: data.sentenceSegments.length
        })
      }
    }

    // Update session status to processing if provided
    if (sessionId) {
      await firestore.collection('users').doc(uid).collection('pronunciationSessions').doc(sessionId).update({
        status: 'processing',
        updatedAt: new Date()
      })
    }

    console.log(`Starting Whisper transcription for story ${storyId}`)
    console.log(`Audio URL: ${fullAudioUrl}`)
    console.log(`Language: ${transcriptLang}`)

    // Transcribe with Whisper - this returns segments with word-level timestamps
    const result = await transcribeWithWhisper({
      audioUrl: fullAudioUrl,
      languageCode: transcriptLang
    })

    // Store transcript with word-level timestamps
    await transcriptRef.set({
      storyId,
      language: transcriptLang,
      text: result.text || '',
      sentenceSegments: result.sentenceSegments || result.segments || [],
      createdAt: new Date()
    })

    // Update story to indicate transcript is available
    await storyRef.update({
      hasWordTimestamps: true,
      transcriptLanguage: transcriptLang
    })

    // Update session status if provided
    if (sessionId) {
      await firestore.collection('users').doc(uid).collection('pronunciationSessions').doc(sessionId).update({
        status: 'ready',
        updatedAt: new Date()
      })
    }

    console.log(`Story ${storyId} transcription complete: ${(result.sentenceSegments || result.segments || []).length} segments`)

    res.json({
      status: 'ready',
      cached: false,
      segmentCount: (result.sentenceSegments || result.segments || []).length
    })
  } catch (error) {
    console.error('Story transcription error:', error)

    // Update session status to error if provided
    if (sessionId) {
      try {
        await firestore.collection('users').doc(uid).collection('pronunciationSessions').doc(sessionId).update({
          status: 'error',
          error: error.message,
          updatedAt: new Date()
        })
      } catch (e) {
        console.error('Failed to update session status:', e)
      }
    }

    res.status(500).json({ error: 'Failed to transcribe story audio' })
  }
})

// ============================================
// REAL-TIME TRANSCRIPTION WEBSOCKET SERVER
// ============================================
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/transcribe' })

wss.on('connection', (ws) => {
  console.log('WebSocket client connected for real-time transcription')

  let audioChunks = []
  let language = 'en'
  let transcriptionInterval = null
  let isProcessing = false
  let lastTranscription = ''

  // Process accumulated audio chunks every 1.5 seconds
  const processAudioChunks = async () => {
    if (isProcessing || audioChunks.length === 0) return

    isProcessing = true
    const chunksToProcess = [...audioChunks]

    try {
      // Combine audio chunks into a single buffer
      const totalLength = chunksToProcess.reduce((acc, chunk) => acc + chunk.length, 0)
      const combinedBuffer = Buffer.concat(chunksToProcess, totalLength)

      if (combinedBuffer.length < 1000) {
        // Too small, wait for more data
        isProcessing = false
        return
      }

      // Save to temp file
      const tempDir = os.tmpdir()
      const tempFilePath = path.join(tempDir, `realtime-audio-${Date.now()}.webm`)
      await fs.writeFile(tempFilePath, combinedBuffer)

      // Transcribe with Whisper
      const languageCode = SPEECH_LANGUAGE_CODES[language] || language.toLowerCase().slice(0, 2) || 'en'

      const transcription = await client.audio.transcriptions.create({
        file: createReadStream(tempFilePath),
        model: 'whisper-1',
        language: languageCode
      })

      // Clean up temp file
      await fs.unlink(tempFilePath).catch(() => {})

      const text = transcription.text || ''

      // Only send if transcription changed
      if (text && text !== lastTranscription) {
        lastTranscription = text
        ws.send(JSON.stringify({
          type: 'transcription',
          text: text,
          isFinal: false
        }))
      }
    } catch (error) {
      console.error('Real-time transcription error:', error.message)
    } finally {
      isProcessing = false
    }
  }

  ws.on('message', async (data) => {
    try {
      // Check if it's a control message (JSON) or audio data (binary)
      if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
        const message = JSON.parse(data.toString())

        if (message.type === 'config') {
          language = message.language || 'en'
          console.log('Transcription config set:', { language })
          ws.send(JSON.stringify({ type: 'ready' }))

          // Start periodic transcription
          transcriptionInterval = setInterval(processAudioChunks, 1500)
        }

        if (message.type === 'stop') {
          // Process any remaining audio and send final transcription
          if (transcriptionInterval) {
            clearInterval(transcriptionInterval)
            transcriptionInterval = null
          }

          // Final transcription with all audio
          if (audioChunks.length > 0) {
            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0)
            const combinedBuffer = Buffer.concat(audioChunks, totalLength)

            const tempDir = os.tmpdir()
            const tempFilePath = path.join(tempDir, `final-audio-${Date.now()}.webm`)
            await fs.writeFile(tempFilePath, combinedBuffer)

            const languageCode = SPEECH_LANGUAGE_CODES[language] || language.toLowerCase().slice(0, 2) || 'en'

            const transcription = await client.audio.transcriptions.create({
              file: createReadStream(tempFilePath),
              model: 'whisper-1',
              language: languageCode
            })

            await fs.unlink(tempFilePath).catch(() => {})

            ws.send(JSON.stringify({
              type: 'transcription',
              text: transcription.text || '',
              isFinal: true
            }))
          }

          audioChunks = []
          lastTranscription = ''
        }
      } else {
        // Binary audio data
        audioChunks.push(Buffer.from(data))
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  })

  ws.on('close', () => {
    console.log('WebSocket client disconnected')
    if (transcriptionInterval) {
      clearInterval(transcriptionInterval)
    }
    audioChunks = []
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
    if (transcriptionInterval) {
      clearInterval(transcriptionInterval)
    }
  })
})

server.listen(4000, () => {
  console.log('Server running on http://localhost:4000')
  console.log('WebSocket available at ws://localhost:4000/ws/transcribe')
})
