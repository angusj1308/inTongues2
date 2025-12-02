import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import YouTubePlayer from '../components/YouTubePlayer'

const extractVideoId = (video) => {
  if (!video) return ''
  if (video.videoId) return video.videoId

  if (video.youtubeUrl) {
    try {
      const parsed = new URL(video.youtubeUrl)
      if (parsed.searchParams.get('v')) {
        return parsed.searchParams.get('v')
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
  const [playbackStatus, setPlaybackStatus] = useState({ currentTime: 0, duration: 0, isPlaying: false })

  const playerRef = useRef(null)

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

  const videoId = useMemo(() => extractVideoId(video), [video])

  const formatTime = (seconds) => {
    if (!seconds || Number.isNaN(seconds)) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

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

            {videoId ? (
              <div className="video-frame" style={{ position: 'relative', paddingTop: '56.25%' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                  <YouTubePlayer
                    ref={playerRef}
                    videoId={videoId}
                    onStatus={(status) => setPlaybackStatus(status)}
                  />
                </div>
              </div>
            ) : (
              <p className="error">This video cannot be embedded.</p>
            )}

            <div
              className="card"
              style={{
                marginTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="button" onClick={() => playerRef.current?.playVideo?.()}>
                  Play
                </button>
                <button className="button ghost" onClick={() => playerRef.current?.pauseVideo?.()}>
                  Pause
                </button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {formatTime(playbackStatus.currentTime)} / {formatTime(playbackStatus.duration)}
              </p>
            </div>

            <div className="card" style={{ marginTop: '1rem' }}>
              <h4>Subtitles</h4>
              <p className="muted small">
                Subtitles will appear here once they are available for this YouTube video.
              </p>
              <p className="muted small">
                Current time: {playbackStatus.currentTime.toFixed(1)}s / {playbackStatus.duration.toFixed(1)}s —{' '}
                {playbackStatus.isPlaying ? 'Playing' : 'Paused'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default IntonguesCinema
