import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const buildEmbedUrl = (video) => {
  if (!video) return ''
  if (video.videoId) return `https://www.youtube.com/embed/${video.videoId}?rel=0`

  if (video.youtubeUrl) {
    try {
      const parsed = new URL(video.youtubeUrl)
      if (parsed.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${parsed.searchParams.get('v')}?rel=0`
      }
    } catch (err) {
      return ''
    }
  }

  return ''
}

const IntonguesCinema = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [video, setVideo] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !id) {
      setError('Unable to load this video right now.')
      setLoading(false)
      return
    }

    const loadVideo = async () => {
      setLoading(true)
      try {
        const videoRef = doc(db, 'users', user.uid, 'youtubeVideos', id)
        const videoSnap = await getDoc(videoRef)

        if (!videoSnap.exists()) {
          setError('This YouTube video was not found in your library.')
          setVideo(null)
          return
        }

        setVideo({ id: videoSnap.id, ...videoSnap.data() })
        setError('')
      } catch (err) {
        console.error('Failed to load YouTube video', err)
        setError('Unable to load this video right now.')
      } finally {
        setLoading(false)
      }
    }

    loadVideo()
  }, [id, user])

  const embedUrl = useMemo(() => buildEmbedUrl(video), [video])

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>inTongues Cinema</h1>
            <p className="muted small">Watch your imported YouTube videos with subtitles.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/listening')}>
            Back to listening library
          </button>
        </div>

        {loading ? (
          <p className="muted">Loading video…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : !video ? (
          <p className="muted">Video unavailable.</p>
        ) : (
          <div className="section">
            <div className="section-header">
              <div>
                <h3>{video.title || 'Untitled video'}</h3>
                <p className="muted small">Sourced from YouTube</p>
              </div>
              {video.youtubeUrl && (
                <a className="button ghost" href={video.youtubeUrl} target="_blank" rel="noreferrer">
                  Open on YouTube
                </a>
              )}
            </div>

            {embedUrl ? (
              <div className="video-frame" style={{ position: 'relative', paddingTop: '56.25%' }}>
                <iframe
                  src={embedUrl}
                  title={video.title || 'YouTube video player'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                />
              </div>
            ) : (
              <p className="error">This video cannot be embedded.</p>
            )}

            <div className="card" style={{ marginTop: '1rem' }}>
              <h4>Subtitles</h4>
              <p className="muted small">
                Subtitles will appear here once they are available for this YouTube video.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default IntonguesCinema
