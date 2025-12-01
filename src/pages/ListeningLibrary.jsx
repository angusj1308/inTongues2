import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const ListeningLibrary = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
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
      setLoading(false)
      return undefined
    }

    setError('')
    setLoading(true)

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
        setLoading(false)
      },
      (err) => {
        console.error('Listening library load error:', err)
        setError('Unable to load your audiobooks right now.')
        setLoading(false)
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
            <p className="muted small">All audiobooks ready for listening.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
        </div>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : items.length === 0 ? (
          <p className="muted">No audiobooks available</p>
        ) : (
          <div className="library-list">
            {items.map((item) => (
              <div className="preview-card" key={item.id}>
                <div className="section-header">
                  <h3>{item.title || 'Untitled story'}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="pill" style={{ background: '#dcfce7', color: '#166534' }}>
                      Audio Ready
                    </span>
                    <button
                      className="button ghost"
                      style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                      onClick={() => handleDeleteStory(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="pill-row">
                  {item.language && <span className="pill primary">in{item.language}</span>}
                  {item.level && <span className="pill">Level {item.level}</span>}
                </div>
                {item.fullAudioUrl ? (
                  <audio controls src={item.fullAudioUrl} style={{ width: '100%', marginTop: '0.75rem' }} />
                ) : (
                  <p className="muted small">No audio available.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ListeningLibrary
