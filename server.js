import express from 'express'
import dotenv from 'dotenv'
dotenv.config()
import OpenAI from 'openai'

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

  for (const word of words) {
    translations[word] = `DUMMY_${word}`
  }

  return translations
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

app.listen(4000, () => {
  console.log('Proxy running on http://localhost:4000')
})
