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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pageTranslations, setPageTranslations] = useState({})

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
        setCurrentIndex(0)
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

  useEffect(() => {
    setCurrentIndex(0)
  }, [pages.length])

  const pageText = pages[currentIndex]?.text

  useEffect(() => {
    if (!pageText || typeof pageText !== 'string') return

    const words = Array.from(
      new Set(
        pageText
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .split(/\s+/)
          .filter(Boolean)
      )
    )

    if (words.length === 0) return

    const controller = new AbortController()

    async function prefetch() {
      try {
        const response = await fetch('http://localhost:4000/api/prefetchTranslations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languageCode: language || 'es', // TODO: replace with real language code
            targetLang: 'en',
            words,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          console.error('Failed to prefetch translations', await response.text())
          return
        }

        const data = await response.json()
        setPageTranslations(data.translations || {})
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error prefetching translations', error)
        }
      }
    }

    prefetch()

    return () => {
      controller.abort()
    }
  }, [language, pageText])

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex + 2 < pages.length
  const visiblePages = pages.slice(currentIndex, currentIndex + 2)

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
            <div
              className="section"
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'space-between',
              }}
            >
              {visiblePages.map((page) => (
                <div
                  key={page.id || page.index}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div className="section-header">
                    <span className="pill">Page {(page.index ?? pages.indexOf(page)) + 1}</span>
                  </div>
                  <p>{page.text}</p>
                </div>
              ))}
            </div>
            <div className="section" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button
                className="button ghost"
                disabled={!hasPrevious}
                onClick={() => setCurrentIndex((prev) => Math.max(prev - 2, 0))}
              >
                Previous pages
              </button>
              <button
                className="button ghost"
                disabled={!hasNext}
                onClick={() => setCurrentIndex((prev) => Math.min(prev + 2, pages.length - (pages.length % 2 ? 1 : 2)))}
              >
                Next pages
              </button>
            </div>
          </div>
        ) : (
          <p className="muted">Story {id} is ready to read soon.</p>
        )}
      </div>
    </div>
  )
}

export default Reader
