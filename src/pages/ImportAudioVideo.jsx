import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const extractYouTubeId = (url) => {
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

const ImportAudioVideo = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

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
      const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')

      await addDoc(videosRef, {
        title: trimmedTitle,
        youtubeUrl: trimmedUrl,
        videoId,
        createdAt: serverTimestamp(),
        source: 'youtube',
      })

      navigate('/listening')
    } catch (submissionError) {
      console.error('Failed to import YouTube video', submissionError)
      setError('Unable to import this video right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Import audio or video</h1>
            <p className="muted small">
              Add a YouTube video to your listening library and access it inside inTongues Cinema.
            </p>
          </div>
          <button className="button ghost" onClick={() => navigate('/listening')}>
            Back to listening library
          </button>
        </div>

        <form className="section" onSubmit={handleSubmit}>
          <div className="section-header">
            <h3>Video details</h3>
            <p className="muted small">Provide the YouTube link and a title to save it in your library.</p>
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
      </div>
    </div>
  )
}

export default ImportAudioVideo
