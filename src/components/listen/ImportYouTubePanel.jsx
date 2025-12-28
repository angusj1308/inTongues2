import { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { extractYouTubeId } from '../../utils/youtube'

const ImportYouTubePanel = ({ headingLevel = 'h3', layout = 'card', onSuccess, language }) => {
  const { user, profile } = useAuth()

  // Use passed language prop, or fall back to profile's lastUsedLanguage
  const targetLanguage = language || profile?.lastUsedLanguage || ''

  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const HeadingTag = useMemo(() => headingLevel || 'h3', [headingLevel])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!user) {
      setError('You need to be signed in to import content.')
      return
    }

    const trimmedTitle = title.trim()
    const trimmedUrl = youtubeUrl.trim()

    if (!trimmedTitle || !trimmedUrl) {
      setError('Please provide both a title and a YouTube link.')
      return
    }

    const videoId = extractYouTubeId(trimmedUrl)
    if (!videoId) {
      setError('Please enter a valid YouTube URL.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('http://localhost:4000/api/youtube/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          youtubeUrl: trimmedUrl,
          uid: user.uid,
          language: targetLanguage,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Failed to import YouTube video')
      }

      setTitle('')
      setYoutubeUrl('')
      onSuccess?.()
    } catch (submissionError) {
      console.error('Failed to import YouTube video', submissionError)
      setError('Unable to import this video right now.')
    } finally {
      setSubmitting(false)
    }
  }

  const wrapperClass = layout === 'card' ? 'preview-card' : 'section'

  return (
    <form className={wrapperClass} onSubmit={handleSubmit}>
      <div className="section-header">
        <HeadingTag>Import from YouTube</HeadingTag>
        <p className="muted small">Add a YouTube video to your listening library.</p>
      </div>

      <div className="form-grid">
        <label className="form-field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="My favorite talk"
            required
          />
        </label>

        <label className="form-field">
          <span>YouTube URL</span>
          <input
            type="url"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=example"
            required
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Importing…' : 'Import to library'}
        </button>
      </div>
    </form>
  )
}

export default ImportYouTubePanel
