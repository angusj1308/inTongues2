import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { extractYouTubeId } from '../../utils/youtube'

const ImportYouTubePanel = ({ layout = 'card', onSuccess, onCancel, language }) => {
  const { user, profile } = useAuth()

  // Use passed language prop, or fall back to profile's lastUsedLanguage
  const targetLanguage = language || profile?.lastUsedLanguage || ''

  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  const isInline = layout === 'inline'

  return (
    <form className={isInline ? 'form' : 'preview-card'} onSubmit={handleSubmit}>
      {!isInline && (
        <div className="section-header">
          <h3>Import from YouTube</h3>
          <p className="muted small">Add a YouTube video to your listening library.</p>
        </div>
      )}

      <label className="ui-text">
        Title
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="My favorite talk"
          required
        />
      </label>

      <label className="ui-text">
        YouTube URL
        <input
          type="url"
          value={youtubeUrl}
          onChange={(event) => setYoutubeUrl(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=example"
          required
        />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="action-row">
        {onCancel && (
          <button className="button ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? 'Importing…' : 'Import'}
        </button>
      </div>
    </form>
  )
}

export default ImportYouTubePanel
