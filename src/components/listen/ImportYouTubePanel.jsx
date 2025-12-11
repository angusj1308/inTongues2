import { useMemo, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'

export const extractYouTubeId = (url) => {
  if (!url) return ''

  try {
    const parsed = new URL(url)

    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.replace('/', '')
    }

    if (parsed.searchParams.get('v')) {
      return parsed.searchParams.get('v')
    }

    const paths = parsed.pathname.split('/')
    const embedIndex = paths.indexOf('embed')
    if (embedIndex !== -1 && paths[embedIndex + 1]) {
      return paths[embedIndex + 1]
    }
  } catch (err) {
    return ''
  }

  return ''
}

const ImportYouTubePanel = ({ headingLevel = 'h3', layout = 'card', onSuccess }) => {
  const { user } = useAuth()

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
      const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')

      await addDoc(videosRef, {
        title: trimmedTitle,
        youtubeUrl: trimmedUrl,
        videoId,
        createdAt: serverTimestamp(),
        source: 'youtube',
      })

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
