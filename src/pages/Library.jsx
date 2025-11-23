import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const Library = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return undefined

    const libraryRef = collection(db, 'users', user.uid, 'library')
    const libraryQuery = query(libraryRef, orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      libraryQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setItems(nextItems)
        setLoading(false)
      },
      () => {
        setError('Unable to load your library right now.')
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
            <h1>Your library</h1>
            <p className="muted small">Stories you have generated will show here.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
        </div>

        {loading ? (
          <p className="muted">Loading library...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : items.length ? (
          <div className="library-list">
            {items.map((item) => (
              <div className="preview-card" key={item.id}>
                <div className="section-header">
                  <div className="pill-row">
                    <span className="pill primary">in{item.language}</span>
                    {item.level && <span className="pill">Level {item.level}</span>}
                    {item.genre && <span className="pill">{item.genre}</span>}
                    {item.length && (
                      <span className="pill">{item.length} page{item.length === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  <button
                    className="button ghost"
                    onClick={() => navigate(`/reader/${item.id}`, { state: { content: item.content } })}
                  >
                    Read
                  </button>
                </div>
                <p className="muted small">{item.description || 'No description provided.'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No stories yet. Generate one to get started!</p>
        )}
      </div>
    </div>
  )
}

export default Library
