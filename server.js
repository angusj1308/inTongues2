import express from 'express'
import dotenv from 'dotenv'
dotenv.config()
import OpenAI from 'openai'

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

const app = express()
app.use(express.json())

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
      input: `Translate each word from ${sourceLabel} to ${targetLabel}. Return a JSON object where each key is the exact source word and each value is a concise translation of that word. Do not include any extra fields. Source words: ${JSON.stringify(uniqueWords)}`,
      response_format: { type: 'json_object' },
    })

    const jsonContent = response?.output?.[0]?.content?.[0]?.json
    let parsed = {}

    if (jsonContent && typeof jsonContent === 'object') {
      parsed = jsonContent
    } else {
      const outputText = response.output_text?.trim() || ''
      try {
        parsed = JSON.parse(outputText)
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

app.listen(4000, () => {
  console.log('Proxy running on http://localhost:4000')
})
