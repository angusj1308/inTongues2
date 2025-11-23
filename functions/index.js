import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'

const app = express()
const corsHandler = cors({ origin: true })

app.use(express.json())
app.use((req, res, next) => corsHandler(req, res, next))

app.post('/api/generate', async (req, res) => {
  const { level, genre, length, description, language } = req.body || {}

  if (!req.body) {
    return res.status(400).json({ error: 'Request body is required.' })
  }

  if (!language) {
    return res.status(400).json({ error: 'Language is required.' })
  }

  const summaryParts = [
    `Language: ${language}`,
    level ? `Level: ${level}` : null,
    genre ? `Genre: ${genre}` : null,
    length ? `Length: ${length}` : null,
    description ? `Description: ${description}` : null,
  ].filter(Boolean)

  const content =
    'This is a generated story. ' +
    (summaryParts.length ? `Details -> ${summaryParts.join(' | ')}.` : '')

  return res.status(200).json({ content })
})

app.all('/api/generate', (req, res) => {
  res.set('Allow', 'POST')
  return res.status(405).json({ error: 'Method Not Allowed' })
})

export const generateStory = onRequest({ region: 'us-central1' }, app)
