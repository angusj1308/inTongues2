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
  const [openAudioId, setOpenAudioId] = useState('')

  const handleDeleteStory = async (storyId) => {
    if (!user || !storyId) return

    const confirmed = window.confirm('Delete this story and its audio permanently?')
    if (!confirmed) return

    try {
      const response = await fetch('http://localhost:4000/api/delete-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, storyId }),
      })

      if (!response.ok) {
        console.error('Delete story failed:', await response.text())
        window.alert('Unable to delete this story right now.')
      }

      // No manual state update needed: onSnapshot will refresh list.
    } catch (err) {
      console.error('Error deleting story:', err)
      window.alert('Unable to delete this story right now.')
    }
  }

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

  const getStoryTitle = (item) => item.title?.trim() || 'Untitled Story'

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
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="button ghost"
                      onClick={() => navigate(`/reader/${encodeURIComponent(activeLanguage)}/${item.id}`)}
                    >
                      Read
                    </button>
                    <button
                      className="button ghost"
                      style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                      onClick={() => handleDeleteStory(item.id)}
                    >
                    Delete
                    </button>
                  </div>
                </div>
                <h4 style={{ margin: '0.25rem 0' }}>{getStoryTitle(item)}</h4>
                <p className="muted small">{getPreviewSnippet(item)}</p>
                <div className="pill-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    className="pill"
                    style={{
                      background:
                        item.audioStatus === 'ready'
                          ? '#dcfce7'
                          : item.audioStatus === 'processing'
                            ? '#fef9c3'
                            : '#e2e8f0',
                      color:
                        item.audioStatus === 'ready'
                          ? '#166534'
                          : item.audioStatus === 'processing'
                            ? '#854d0e'
                            : '#0f172a',
                    }}
                  >
                    {item.audioStatus === 'ready'
                      ? 'Audio Ready'
                      : item.audioStatus === 'processing'
                        ? 'Audio Processing…'
                        : 'No Audio'}
                  </span>
                  {item.audioStatus === 'ready' && item.fullAudioUrl && (
                    <button
                      className="button ghost"
                      onClick={() =>
                        setOpenAudioId((current) => (current === item.id ? '' : item.id))
                      }
                    >
                      ► Listen
                    </button>
                  )}
                </div>
                {openAudioId === item.id && item.audioStatus === 'ready' && item.fullAudioUrl && (
                  <audio
                    controls
                    style={{ width: '100%', marginTop: '0.75rem' }}
                    src={item.fullAudioUrl}
                  />
                )}
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
