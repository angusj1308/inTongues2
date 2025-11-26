import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const Reader = () => {
  const navigate = useNavigate()
  const { id, language } = useParams()
  const { user } = useAuth()

  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || !id) {
      setPages([])
      setLoading(false)
      return undefined
    }

    const loadPages = async () => {
      setLoading(true)
      try {
        const pagesRef = collection(db, 'users', user.uid, 'stories', id, 'pages')
        const pagesQuery = query(pagesRef, orderBy('index', 'asc'))
        const snapshot = await getDocs(pagesQuery)
        const nextPages = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setPages(nextPages)
        setError('')
      } catch (loadError) {
        console.error(loadError)
        setError('Unable to load story pages right now.')
      } finally {
        setLoading(false)
      }
    }

    loadPages()
    return undefined
  }, [id, language, user])

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Reader</h1>
            <p className="muted small">Review each generated page in order.</p>
          </div>
          <button
            className="button ghost"
            onClick={() => navigate(language ? `/library/${encodeURIComponent(language)}` : '/library')}
          >
            Back to library
          </button>
        </div>

        {loading ? (
          <p className="muted">Loading pages...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : pages.length ? (
          <div className="preview-card">
            <div className="section-header">
              <div className="pill-row">{language && <span className="pill primary">in{language}</span>}</div>
            </div>
            {pages.map((page) => (
              <div key={page.id || page.index} className="section">
                <div className="section-header">
                  <span className="pill">Page {(page.index ?? pages.indexOf(page)) + 1}</span>
                </div>
                <p>{page.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Story {id} is ready to read soon.</p>
        )}
      </div>
    </div>
  )
}

export default Reader
