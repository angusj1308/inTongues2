import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { extractYouTubeId } from '../../utils/youtube'
import { SUPPORTED_LANGUAGES_MVP, toLanguageCode, toLanguageLabel } from '../../constants/languages'
import { LANGUAGE_LABELS_BY_CODE } from '../../constants/languages'

const ImportYouTubePanel = ({ layout = 'card', onSuccess, onCancel, language }) => {
  const { user, profile } = useAuth()

  // Use passed language prop, or fall back to profile's lastUsedLanguage
  const targetLanguage = language || profile?.lastUsedLanguage || ''
  const targetLanguageCode = toLanguageCode(targetLanguage)

  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState(() => targetLanguageCode || 'auto')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isDubbingFlow =
    sourceLanguage !== 'auto' && sourceLanguage !== targetLanguageCode

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
      const endpoint = isDubbingFlow
        ? 'http://localhost:4000/api/youtube/dub'
        : 'http://localhost:4000/api/youtube/import'

      const body = isDubbingFlow
        ? {
            title: trimmedTitle,
            youtubeUrl: trimmedUrl,
            uid: user.uid,
            sourceLanguage,
            targetLanguage: targetLanguageCode,
          }
        : {
            title: trimmedTitle,
            youtubeUrl: trimmedUrl,
            uid: user.uid,
            language: targetLanguage,
          }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Failed to import YouTube video')
      }

      setTitle('')
      setYoutubeUrl('')
      setSourceLanguage(targetLanguageCode || 'auto')
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

      <label className="ui-text">
        Source Language
        <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}>
          <option value="auto">Auto-detect</option>
          {SUPPORTED_LANGUAGES_MVP.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_LABELS_BY_CODE[code]}
            </option>
          ))}
        </select>
      </label>

      <label className="ui-text">
        Output Language
        <input
          type="text"
          value={toLanguageLabel(targetLanguage) || 'Not set'}
          disabled
        />
      </label>

      {isDubbingFlow && (
        <p className="muted small">
          This video will be dubbed from {LANGUAGE_LABELS_BY_CODE[sourceLanguage]} to{' '}
          {toLanguageLabel(targetLanguage)}.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="action-row">
        {onCancel && (
          <button className="button ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting
            ? isDubbingFlow
              ? 'Dubbing…'
              : 'Importing…'
            : isDubbingFlow
              ? 'Import & Dub'
              : 'Import'}
        </button>
      </div>
    </form>
  )
}

export default ImportYouTubePanel
