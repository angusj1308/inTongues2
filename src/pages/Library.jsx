import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const Library = () => {
  const { user, profile, setLastUsedLanguage } = useAuth()
  const { language: languageParam } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const availableLanguages = profile?.myLanguages || []
  const invalidLanguageParam = languageParam && !availableLanguages.includes(languageParam)

  const activeLanguage = useMemo(() => {
    if (languageParam) {
      return availableLanguages.includes(languageParam) ? languageParam : ''
    }
    if (profile?.lastUsedLanguage && availableLanguages.includes(profile.lastUsedLanguage)) {
      return profile.lastUsedLanguage
    }
    if (availableLanguages.length) return availableLanguages[0]
    return ''
  }, [availableLanguages, languageParam, profile?.lastUsedLanguage])

  useEffect(() => {
    if (activeLanguage) {
      setLastUsedLanguage(activeLanguage)
    }
  }, [activeLanguage, setLastUsedLanguage])

  useEffect(() => {
    if (activeLanguage && !languageParam) {
      navigate(`/library/${encodeURIComponent(activeLanguage)}`, { replace: true })
    }
  }, [activeLanguage, languageParam, navigate])

  useEffect(() => {
    if (!user || !activeLanguage) {
      setItems([])
      setLoading(false)
      return undefined
    }

    setError('')
    setLoading(true)

    const storiesRef = collection(db, 'users', user.uid, 'stories')
    const languageLibraryQuery = query(
      storiesRef,
      where('language', '==', activeLanguage),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      languageLibraryQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setItems(nextItems)
        setLoading(false)
      },
      (err) => {
        console.error('Library load error:', err)
        setError('Unable to load your library right now.')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [activeLanguage, user])

  const handleLanguageChange = (language) => {
    if (!language) return
    navigate(`/library/${encodeURIComponent(language)}`)
  }

  const getDisplayText = (page) =>
    page?.adaptedText || page?.originalText || page?.text || ''

  const getPreviewSnippet = (item) => {
    const previewPage = item.previewPage || item.pagePreview || item.firstPage || item.pages?.[0]
    return getDisplayText(previewPage) || item.description || 'No description provided.'
  }

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Your library</h1>
            <p className="muted small">Stories are organized by the language you are learning.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
        </div>

        <div className="section">
          <div className="section-header">
            <h3>Language</h3>
            <p className="muted small">Only stories for this language will appear in the library.</p>
          </div>
          {availableLanguages.length ? (
            <div className="language-switcher">
              <span className="pill primary">in{activeLanguage || '...'}</span>
              <select
                className="language-select"
                value={activeLanguage}
                onChange={(event) => handleLanguageChange(event.target.value)}
              >
                {availableLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="muted">Add a language to start saving stories.</p>
          )}
          {invalidLanguageParam && (
            <p className="error small">
              {languageParam} is not in your language list. Choose another language to view its stories.
            </p>
          )}
        </div>

        {!activeLanguage ? (
          <p className="muted">Select a language to view its stories.</p>
        ) : loading ? (
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
                    {(item.pageCount || item.length) && (
                      <span className="pill">
                        {item.pageCount || item.length} page{(item.pageCount || item.length) === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <button
                    className="button ghost"
                    onClick={() => navigate(`/reader/${encodeURIComponent(activeLanguage)}/${item.id}`)}
                  >
                    Read
                  </button>
                </div>
                <p className="muted small">{getPreviewSnippet(item)}</p>
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
