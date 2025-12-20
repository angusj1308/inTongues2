import cors from 'cors'
import express from 'express'
import * as functions from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import OpenAI from 'openai'

console.log('OpenAI config:', functions.config().openai)

const app = express()
const corsHandler = cors({ origin: true })

app.use(express.json())
app.use((req, res, next) => corsHandler(req, res, next))

const openaiKey = functions.config()?.openai?.key
const openaiClient = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null

const SUPPORTED_LANGUAGES_MVP = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
}

const resolveSupportedLanguage = (language) => {
  const raw = String(language || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (SUPPORTED_LANGUAGES_MVP[lower]) return SUPPORTED_LANGUAGES_MVP[lower]
  const labelMatch = Object.values(SUPPORTED_LANGUAGES_MVP).find(
    (label) => label.toLowerCase() === lower,
  )
  return labelMatch || ''
}

const handleGenerate = async (req, res) => {
  const { level, genre, length, description, language } = req.body || {}

  if (!req.body) {
    return res.status(400).json({ error: 'Request body is required.' })
  }

  if (!language) {
    return res.status(400).json({ error: 'Language is required.' })
  }

  if (!openaiClient) {
    return res.status(500).json({ error: 'OpenAI API key is not configured.' })
  }

  const resolvedLanguage = resolveSupportedLanguage(language) || SUPPORTED_LANGUAGES_MVP.en

  const storyDetails = [
    level ? `reading level ${level}` : null,
    genre ? `${genre} genre` : null,
    length ? `${length} length` : null,
    description ? `details: ${description}` : null,
  ].filter(Boolean)

  const userPrompt = [
    `Write an engaging story in ${resolvedLanguage}.`,
    storyDetails.length ? `Include ${storyDetails.join(', ')}.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that crafts concise, coherent stories from user prompts.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
    })

    const content = completion.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return res.status(502).json({ error: 'Failed to generate story content.' })
    }

    return res.status(200).json({ content })
  } catch (error) {
    console.error('Error generating story:', error)
    return res.status(500).json({ error: 'Failed to generate story.' })
  }
}

app.post('/api/generate', handleGenerate)
app.post('/', handleGenerate)

app.all('/api/generate', (req, res) => {
  res.set('Allow', 'POST')
  return res.status(405).json({ error: 'Method Not Allowed' })
})

app.all('/', (req, res) => {
  res.set('Allow', 'POST')
  return res.status(405).json({ error: 'Method Not Allowed' })
})

export const generateStory = onRequest({ region: 'us-central1' }, app)
