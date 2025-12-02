import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import useAuth from '../context/AuthContext'
import db from '../firebase'

const ListeningLibrary = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [audioLoading, setAudioLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(true)
  const [error, setError] = useState('')

  const handleDeleteStory = async (storyId) => {
    if (!user || !storyId) return

    const confirmed = window.confirm('Delete this audiobook and its pages permanently?')
    if (!confirmed) return

    try {
      const response = await fetch('http://localhost:4000/api/delete-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, storyId }),
      })

      if (!response.ok) {
        console.error('Delete story failed:', await response.text())
        window.alert('Unable to delete this audiobook right now.')
      }
    } catch (err) {
      console.error('Error deleting story:', err)
      window.alert('Unable to delete this audiobook right now.')
    }
  }

  useEffect(() => {
    if (!user) {
      setItems([])
      setAudioLoading(false)
      return undefined
    }

    setError('')
    setAudioLoading(true)

    const storiesRef = collection(db, 'users', user.uid, 'stories')
    const listeningQuery = query(
      storiesRef,
      where('hasFullAudio', '==', true),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      listeningQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setItems(nextItems)
        setAudioLoading(false)
      },
      (err) => {
        console.error('Listening library load error:', err)
        setError('Unable to load your audiobooks right now.')
        setAudioLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  useEffect(() => {
    if (!user) {
      setYoutubeVideos([])
      setVideoLoading(false)
      return undefined
    }

    setVideoLoading(true)

    const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')
    const videosQuery = query(videosRef, orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      videosQuery,
      (snapshot) => {
        const nextVideos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setYoutubeVideos(nextVideos)
        setVideoLoading(false)
      },
      (err) => {
        console.error('Listening library YouTube load error:', err)
        setError('Unable to load your YouTube videos right now.')
        setVideoLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Listening Library</h1>
            <p className="muted small">Audiobooks and YouTube videos ready for listening.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="button" onClick={() => navigate('/importaudio/video')}>
              Import audio or video
            </button>
            <button className="button ghost" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="section">
          <div className="section-header">
            <h3>Audiobooks</h3>
            <p className="muted small">Stories with generated audio ready to play.</p>
          </div>

          {audioLoading ? (
            <p className="muted">Loading audiobooks…</p>
          ) : items.length === 0 ? (
            <p className="muted">No audiobooks available</p>
          ) : (
            <div className="library-list">
              {items.map((item) => (
                <div
                  className="preview-card"
                  key={item.id}
                  onClick={() => navigate(`/audio/${item.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="section-header">
                    <h3>{item.title || 'Untitled story'}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="pill" style={{ background: '#dcfce7', color: '#166534' }}>
                        Audio Ready
                      </span>
                      <button
                        className="button ghost"
                        style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDeleteStory(item.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="pill-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {item.language && <span className="pill primary">in{item.language}</span>}
                      {item.level && <span className="pill">Level {item.level}</span>}
                    </div>
                    <span className="button ghost" style={{ padding: '0.25rem 0.75rem' }}>
                      Open audio player →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <h3>YouTube videos</h3>
            <p className="muted small">Imported videos that open inside inTongues Cinema.</p>
          </div>

          {videoLoading ? (
            <p className="muted">Loading videos…</p>
          ) : youtubeVideos.length === 0 ? (
            <p className="muted">No YouTube videos imported yet.</p>
          ) : (
            <div className="library-list">
              {youtubeVideos.map((video) => (
                <div
                  className="preview-card"
                  key={video.id}
                  onClick={() => navigate(`/cinema/${video.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="section-header">
                    <h3>{video.title || 'Untitled video'}</h3>
                    <span className="pill" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                      YouTube
                    </span>
                  </div>
                  <div className="pill-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="pill">Opens in inTongues Cinema</span>
                    </div>
                    <span className="button ghost" style={{ padding: '0.25rem 0.75rem' }}>
                      Watch video →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ListeningLibrary
