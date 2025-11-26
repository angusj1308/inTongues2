import express from 'express'
import dotenv from 'dotenv'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
dotenv.config()

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

app.post('/api/generate', async (req, res) => {
  try {
    const { level, genre, length, description, language } = req.body

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: `Write a ${length}-sentence ${genre} story in ${language} at ${level} level. Description: ${description}`
    })

    const content = response.output_text
    res.json({ content })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "OpenAI generation failed" })
  }
})

app.listen(4000, () => {
  console.log('Proxy running on http://localhost:4000')
})
