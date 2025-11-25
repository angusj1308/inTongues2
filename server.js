import express from 'express'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(express.json())

app.post('/api/generate', (req, res) => {
  res.json({ ok: true })
})

app.listen(4000, () => {
  console.log('Proxy running on http://localhost:4000')
})
