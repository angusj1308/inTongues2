import express from 'express'
import dotenv from 'dotenv'
import multer from 'multer'
import os from 'os'
import fs from 'fs/promises'
import pdfParse from 'pdf-parse'
import admin from 'firebase-admin'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { EPub } = require('epub2')
const serviceAccount = require('./serviceAccountKey.json')
dotenv.config()
import OpenAI from 'openai'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'intongues2',
    storageBucket: 'intongues2.appspot.com',
  })
}

export const bucket = admin.storage().bucket()
const firestore = admin.firestore()

const LANGUAGE_NAME_TO_CODE = {
  English: 'en',
  Spanish: 'es',
  Mandarin: 'zh',
  French: 'fr',
  German: 'de',
  Japanese: 'ja',
  Korean: 'ko',
  Italian: 'it',
  Portuguese: 'pt',
  Russian: 'ru',
  Arabic: 'ar',
  Hindi: 'hi',
  Turkish: 'tr',
  Dutch: 'nl',
  Swedish: 'sv',
  Norwegian: 'no',
  Danish: 'da',
  Finnish: 'fi',
  Polish: 'pl',
  Greek: 'el',
  Hebrew: 'he',
  Thai: 'th',
  Vietnamese: 'vi',
  Indonesian: 'id',
  Czech: 'cs',
  Hungarian: 'hu',
  Romanian: 'ro',
  Ukrainian: 'uk',
  Swahili: 'sw',
  Zulu: 'zu',
  Malay: 'ms',
  Filipino: 'fil',
}

function resolveTargetCode(targetLang) {
  if (!targetLang) return 'en'
  if (LANGUAGE_NAME_TO_CODE[targetLang]) return LANGUAGE_NAME_TO_CODE[targetLang]
  return targetLang // assume it's already a code
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

async function translateWords(words, sourceLang, targetLang) {
  const translations = {}
  if (!Array.isArray(words) || words.length === 0) return translations

  const uniqueWords = Array.from(new Set(words))
  const sourceLabel = sourceLang || 'auto-detected'
  const targetLabel = targetLang || 'English'

  try {
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: `Translate each word from ${sourceLabel} to ${targetLabel}. Return a JSON object where each key is the exact source word and each value is a concise translation of that word. Do not include any extra fields. Source words: ${JSON.stringify(uniqueWords)} Do NOT use markdown code fences or any extra text. Return only raw JSON.`,
    })

    const jsonContent = response?.output?.[0]?.content?.[0]?.json
    let parsed = {}

    if (jsonContent && typeof jsonContent === 'object') {
      parsed = jsonContent
    } else {
      const outputText = response.output_text?.trim() || ''
      const lines = outputText.trim().split('\n')
      if (lines[0]?.startsWith('```')) {
        lines.shift()
      }
      if (lines[lines.length - 1]?.startsWith('```')) {
        lines.pop()
      }
      const cleanedText = lines.join('\n')
      try {
        parsed = JSON.parse(cleanedText)
      } catch (parseErr) {
        console.error('Error parsing translation JSON:', parseErr)
      }
    }

    uniqueWords.forEach((word) => {
      const translated = parsed?.[word]
      translations[word] = typeof translated === 'string' && translated.trim() ? translated.trim() : word
    })

    return translations
  } catch (err) {
    console.error('Error translating words with OpenAI:', err)
    uniqueWords.forEach((w) => {
      translations[w] = w
    })
    return translations
  }
}

app.post('/api/generate', async (req, res) => {
  try {
    const { level, genre, length, description, language, pageCount } = req.body
    const totalPages = Math.max(1, Number(pageCount || length || 1) || 1)
    const trimmedDescription = description?.trim() || 'Use your creativity to craft the plot.'

    const pages = []

    for (let index = 0; index < totalPages; index += 1) {
      const pageNumber = index + 1
      const response = await client.responses.create({
        model: "gpt-4.1",
        input: `You are writing page ${pageNumber} of ${totalPages} of a ${genre} story in ${language} at ${level} level. Each page must be approximately 300 words (between 280 and 320 words). Continue the same story from any previous pages, keeping characters and tone consistent. Story description: ${trimmedDescription}. Provide only the full text for page ${pageNumber} with no headings, titles, or page labels.`
      })

      pages.push(response.output_text.trim())
    }

    res.json({ pages })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "OpenAI generation failed" })
  }
})

app.post('/api/prefetchTranslations', async (req, res) => {
  try {
    const { languageCode, targetLang, words } = req.body || {}

    if (!Array.isArray(words) || words.length === 0 || !words.every(word => typeof word === 'string')) {
      return res.status(400).json({ error: 'Invalid words array' })
    }

    if (!targetLang) {
      return res.status(400).json({ error: 'targetLang is required' })
    }

    const translations = await translateWords(words, languageCode, targetLang)

    res.json({ languageCode, translations })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/api/translatePhrase', async (req, res) => {
  try {
    const { phrase, sourceLang, targetLang } = req.body || {}

    if (!phrase || typeof phrase !== 'string') {
      return res.status(400).json({ error: 'phrase is required' })
    }

    if (!targetLang) {
      return res.status(400).json({ error: 'targetLang is required' })
    }

    const sourceLabel = sourceLang || 'auto-detected'
    const targetLabel = targetLang || 'English'

    const prompt = `
Translate the following phrase from ${sourceLabel} to ${targetLabel}.
Return only the translated phrase, with no extra commentary.

${phrase}
`.trim()

    let translation = phrase

    try {
      const response = await client.responses.create({
        model: 'gpt-4o-mini',
        input: prompt,
      })
      translation = response.output_text?.trim() || translation
    } catch (innerErr) {
      console.error('Error translating phrase with OpenAI:', innerErr)
    }

    return res.json({ phrase, translation })
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

    const combinedText = pagesSnap.docs
      .map((doc) => {
        const data = doc.data() || {}
        return data.adaptedText || data.originalText || data.text || ''
      })
      .filter(Boolean)
      .join('\n\n')

    if (!combinedText.trim()) {
      await storyRef.update({
        audioStatus: 'error',
        hasFullAudio: false,
        fullAudioUrl: null,
      })
      return res.status(400).json({ error: 'Story pages have no text content' })
    }

    if (combinedText.length > 60000) {
      await storyRef.update({
        audioStatus: 'error',
        hasFullAudio: false,
        fullAudioUrl: null,
      })
      return res.status(400).json({ error: 'TEXT_TOO_LONG_FOR_TTS' })
    }

    const audioResponse = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: combinedText,
      format: 'mp3',
    })

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

    const filePath = `audio/full/${uid}/${storyId}.mp3`
    const file = bucket.file(filePath)

    await file.save(audioBuffer, { contentType: 'audio/mpeg' })
    await file.makePublic()

    const publicUrl = file.publicUrl()

    await storyRef.update({
      hasFullAudio: true,
      audioStatus: 'ready',
      fullAudioUrl: publicUrl,
    })

    return res.json({ success: true, audioStatus: 'ready', fullAudioUrl: publicUrl })
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
