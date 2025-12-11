import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const BookshelfRow = ({ title, books, emptyMessage, cta, getStoryTitle }) => (
  <section className="bookshelf-section">
    <div className="bookshelf-header">
      <h3>{title}</h3>
      {cta ? <button className="bookshelf-cta">{cta}</button> : null}
    </div>
    {books && books.length ? (
      <div className="book-row-scroll">
        {books.map((book) => (
          <div key={book.id || book.title} className="book-card">
            <div className="book-card-cover" />
            <div className="book-card-title">{getStoryTitle(book)}</div>
            <div className="book-card-meta">
              {book.language || 'Unknown language'} ·{' '}
              {book.level ? `Level ${book.level}` : 'Level unknown'}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <p className="muted small">{emptyMessage}</p>
    )}
  </section>
)

const Library = () => {
  const { user, profile, setLastUsedLanguage } = useAuth()
  const { language: languageParam } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const getStoryTitle = (item) => item.title?.trim() || 'Untitled Story'

  const allBooks = items

  const inProgressBooks =
    items.filter((item) => Boolean(item.progress && item.progress > 0 && item.progress < 100)) ||
    [] // TODO: Track reading progress to power this shelf with real data.

  const generatedBooks =
    items.filter((item) => item.sourceType === 'generated' || item.storyType === 'generated') ||
    [] // TODO: Persist source type for generated stories.

  const adaptationBooks =
    items.filter((item) => item.sourceType === 'adaptation' || item.storyType === 'adaptation') ||
    [] // TODO: Persist source type for adaptations.

  const suggestedBooks = [
    { id: 'suggest-1', title: 'Short Stories A2', language: 'Spanish', level: 'A2' },
    { id: 'suggest-2', title: 'Everyday Dialogues B1', language: 'Spanish', level: 'B1' },
    { id: 'suggest-3', title: 'Cultural Notes A1', language: 'Spanish', level: 'A1' },
  ]

  const handleNavTabChange = (tab) => {
    if (tab === 'read') return

    if (tab === 'listen') {
      navigate('/listening')
      return
    }

    if (tab === 'review') {
      navigate('/review')
      return
    }

    navigate('/dashboard')
  }

  return (
    <DashboardLayout activeTab="read" onTabChange={handleNavTabChange}>
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
        ) : !items.length ? (
          <p className="muted">No stories yet. Generate one to get started!</p>
        ) : (
          <>
            <BookshelfRow
              title="In Progress"
              books={inProgressBooks}
              emptyMessage="You haven't started any books yet."
              cta={inProgressBooks.length ? 'View all' : null}
              getStoryTitle={getStoryTitle}
            />
            <BookshelfRow
              title="All Books"
              books={allBooks}
              emptyMessage="No books in your library yet."
              cta={allBooks.length ? 'View all' : null}
              getStoryTitle={getStoryTitle}
            />
            <BookshelfRow
              title="My Generated"
              books={generatedBooks}
              emptyMessage="You haven't generated any stories yet."
              cta={generatedBooks.length ? 'View all' : null}
              getStoryTitle={getStoryTitle}
            />
            <BookshelfRow
              title="My Adaptations"
              books={adaptationBooks}
              emptyMessage="You haven't imported or adapted any books yet."
              cta={adaptationBooks.length ? 'View all' : null}
              getStoryTitle={getStoryTitle}
            />
            <BookshelfRow
              title="Suggested for you"
              books={suggestedBooks}
              emptyMessage="No suggestions available yet."
              cta="Browse all"
              getStoryTitle={getStoryTitle}
            />
            <section className="bookshelf-section">
              <div className="bookshelf-header">
                <h3>Create Bookshelf</h3>
              </div>
              <button className="button ghost">+ Create a bookshelf</button>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default Library
