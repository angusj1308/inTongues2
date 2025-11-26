import express from 'express'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(express.json())

app.post('/api/generate', (req, res) => {
  console.log('Request body:', req.body)
  res.json({ ok: true, received: req.body })
})

app.listen(4000, () => {
  console.log('Proxy running on http://localhost:4000')
})
