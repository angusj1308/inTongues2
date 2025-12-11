import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import DashboardLayout, { DASHBOARD_TABS } from '../components/layout/DashboardLayout'
import ImportBookPanel from '../components/read/ImportBookPanel'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'

const BookGrid = ({
  title,
  books,
  emptyMessage,
  loading,
  onEmptyAction,
  onEmptyActionLabel,
  onBookClick,
  getStoryTitle,
}) => (
  <section className="read-section read-slab">
    <div className="read-section-header">
      <h3>{title}</h3>
    </div>
    {loading ? (
      <p className="muted small">Loading your books...</p>
    ) : !books?.length ? (
      <div className="empty-bookshelf">
        <p className="muted small">{emptyMessage}</p>
        {onEmptyAction ? (
          <button className="button ghost" onClick={onEmptyAction}>
            {onEmptyActionLabel}
          </button>
        ) : null}
      </div>
    ) : (
      <div className="book-grid">
        {books.map((book) => {
          const progress = Math.max(0, Math.min(100, book.progress || 0))
          const titleText = getStoryTitle ? getStoryTitle(book) : book.title

          return (
            <div
              key={book.id || book.title}
              className="book-tile"
              role={onBookClick ? 'button' : undefined}
              tabIndex={onBookClick ? 0 : undefined}
              onClick={onBookClick ? () => onBookClick(book) : undefined}
              onKeyDown={
                onBookClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        onBookClick(book)
                      }
                    }
                  : undefined
              }
            >
              <div className="book-tile-cover" />
              <div className="book-tile-title">{titleText}</div>
              <div className="book-tile-meta ui-text">
                {book.language || 'Unknown language'}
                {book.level ? ` · Level ${book.level}` : ''}
              </div>
              <div className="book-progress-bar">
                <div className="book-progress-bar-inner" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    )}
  </section>
)

const Dashboard = () => {
  const { user, profile, setLastUsedLanguage } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const preferredTab = useMemo(() => {
    const requestedTab = location.state?.initialTab
    return requestedTab && DASHBOARD_TABS.includes(requestedTab) ? requestedTab : 'home'
  }, [location.state?.initialTab])
  const [activeTab, setActiveTab] = useState(preferredTab)
  const [slideDirection, setSlideDirection] = useState('')
  const [items, setItems] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const generatePanelRef = useRef(null)
  const importPanelRef = useRef(null)

  const availableLanguages = profile?.myLanguages || []
  const activeLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage && availableLanguages.includes(profile.lastUsedLanguage)) {
      return profile.lastUsedLanguage
    }
    if (availableLanguages.length) return availableLanguages[0]
    return ''
  }, [availableLanguages, profile?.lastUsedLanguage])

  useEffect(() => {
    if (preferredTab !== activeTab) {
      const currentIndex = DASHBOARD_TABS.indexOf(activeTab)
      const nextIndex = DASHBOARD_TABS.indexOf(preferredTab)

      if (nextIndex > currentIndex) {
        setSlideDirection('right')
      } else if (nextIndex < currentIndex) {
        setSlideDirection('left')
      }

      setActiveTab(preferredTab)
    }
  }, [activeTab, preferredTab])

  useEffect(() => {
    if (activeLanguage) {
      setLastUsedLanguage(activeLanguage)
    }
  }, [activeLanguage, setLastUsedLanguage])

  useEffect(() => {
    if (!user || !activeLanguage) {
      setItems([])
      setLibraryLoading(false)
      return undefined
    }

    setLibraryError('')
    setLibraryLoading(true)

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
        setLibraryLoading(false)
      },
      (err) => {
        console.error('Library load error:', err)
        setLibraryError('Unable to load your library right now.')
        setLibraryLoading(false)
      },
    )

    return unsubscribe
  }, [activeLanguage, user])

  const handleTabClick = (tab) => {
    if (tab === activeTab) return

    const currentIndex = DASHBOARD_TABS.indexOf(activeTab)
    const nextIndex = DASHBOARD_TABS.indexOf(tab)

    if (nextIndex > currentIndex) {
      setSlideDirection('right')
    } else if (nextIndex < currentIndex) {
      setSlideDirection('left')
    }

    setActiveTab(tab)
  }

  const handleOpenBook = (book) => {
    if (!book?.id) return

    const languageForReader = book.language || activeLanguage
    const readerPath = languageForReader
      ? `/reader/${encodeURIComponent(languageForReader)}/${book.id}`
      : `/reader/${book.id}`

    navigate(readerPath)
  }

  const scrollToPanel = (ref) => {
    ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const getStoryTitle = (item) => item.title?.trim() || 'Untitled Story'

  const inProgressBooks =
    items.filter((item) => Number.isFinite(item.progress) && item.progress > 0 && item.progress < 100) || []
  const yourRecentBooks = items.slice(0, 8)
  const allBooks = items
  const generatedBooks =
    items.filter((item) => item.sourceType === 'generated' || item.storyType === 'generated') || []
  const adaptationBooks =
    items.filter((item) => item.sourceType === 'adaptation' || item.storyType === 'adaptation') || []
  const suggestedBooks = [
    { id: 'suggest-1', title: 'Short Stories A2', language: 'Spanish', level: 'A2' },
    { id: 'suggest-2', title: 'Everyday Dialogues B1', language: 'Spanish', level: 'B1' },
    { id: 'suggest-3', title: 'Cultural Notes A1', language: 'Spanish', level: 'A1' },
  ]
  const intonguesLibraryBooks = [
    { id: 'library-1', title: 'Graded Readers A1', language: 'Spanish', level: 'A1' },
    { id: 'library-2', title: 'Cultural Snapshots A2', language: 'Spanish', level: 'A2' },
    { id: 'library-3', title: 'Travel Dialogues B1', language: 'Spanish', level: 'B1' },
  ]

  const continueStory = inProgressBooks[0] || yourRecentBooks[0]
  const continueProgress = Math.max(0, Math.min(100, continueStory?.progress || 0))
  const continueMeta = continueStory
    ? `${continueStory.language || activeLanguage || 'Your language'} · ${
        continueProgress ? `${continueProgress}% complete` : 'Ready to start'
      }`
    : 'Your next read will appear here.'

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={handleTabClick}>
      <div className="tab-panel">
        <div
          className={`tab-panel-inner ${
            slideDirection === 'right'
              ? 'slide-in-right'
              : slideDirection === 'left'
                ? 'slide-in-left'
                : ''
          }`}
          key={activeTab}
        >
          {activeTab === 'home' && (
            <div className="home-grid">
              <div className="stat-card">
                <div className="stat-label ui-text">Daily streak</div>
                <div className="stat-value">— days</div>
                <p className="muted small">Keep showing up each day to grow your streak.</p>
              </div>
              <div className="stat-card">
                <div className="stat-label ui-text">Minutes today</div>
                <div className="stat-value">00:00</div>
                <p className="muted small">Track how much time you spend practicing.</p>
              </div>
              <div className="stat-card">
                <div className="stat-label ui-text">Words reviewed</div>
                <div className="stat-value">0</div>
                <p className="muted small">Your spaced repetition stats will appear here.</p>
              </div>
              <div className="stat-card">
                <div className="stat-label ui-text">Sessions this week</div>
                <div className="stat-value">0</div>
                <p className="muted small">See your weekly rhythm at a glance.</p>
              </div>
            </div>
          )}

          {activeTab === 'read' && (
            <div className="read-stack">
              {!activeLanguage ? (
                <p className="muted small" style={{ marginTop: '0.75rem' }}>
                  Add a language to unlock your reading tools.
                </p>
              ) : (
                <>
                  <section className="read-section read-slab continue-section">
                    <div className="continue-card">
                      <div className="continue-card-meta">
                        <h3 className="continue-card-label">Continue reading</h3>
                        <div className="continue-card-title">
                          {libraryLoading
                            ? 'Loading your books...'
                            : continueStory
                              ? getStoryTitle(continueStory)
                              : 'No books yet'}
                        </div>
                        <div className="continue-card-progress ui-text">
                          {libraryLoading ? 'Fetching your shelves' : continueMeta}
                        </div>
                      </div>
                      <div className="continue-card-actions">
                        <button
                          className="button ghost"
                          onClick={() => handleOpenBook(continueStory)}
                          disabled={!continueStory || libraryLoading}
                        >
                          {continueStory ? 'Resume' : 'Start reading'}
                        </button>
                      </div>
                    </div>
                  </section>

                  {libraryError ? <p className="error small">{libraryError}</p> : null}

                  <BookGrid
                    title="Your Recent"
                    books={yourRecentBooks}
                    emptyMessage="Your recent books will show up here."
                    loading={libraryLoading}
                    onBookClick={handleOpenBook}
                    getStoryTitle={getStoryTitle}
                  />

                  <BookGrid
                    title="All Books"
                    books={allBooks}
                    emptyMessage="No books in your library yet."
                    loading={libraryLoading}
                    onBookClick={handleOpenBook}
                    getStoryTitle={getStoryTitle}
                  />

                  <BookGrid
                    title="Your Generated"
                    books={generatedBooks}
                    emptyMessage="You haven't generated any stories yet."
                    loading={libraryLoading}
                    onEmptyAction={() => scrollToPanel(generatePanelRef)}
                    onEmptyActionLabel="Generate your first book"
                    onBookClick={handleOpenBook}
                    getStoryTitle={getStoryTitle}
                  />

                  <BookGrid
                    title="Your Adaptations"
                    books={adaptationBooks}
                    emptyMessage="You haven't imported or adapted any books yet."
                    loading={libraryLoading}
                    onEmptyAction={() => scrollToPanel(importPanelRef)}
                    onEmptyActionLabel="Import your first book"
                    onBookClick={handleOpenBook}
                    getStoryTitle={getStoryTitle}
                  />

                  <BookGrid
                    title="InTongues Library"
                    books={intonguesLibraryBooks}
                    emptyMessage="Browse curated titles from InTongues."
                    loading={false}
                    getStoryTitle={getStoryTitle}
                  />

                  <BookGrid
                    title="Suggested for you"
                    books={suggestedBooks}
                    emptyMessage="No suggestions available yet."
                    loading={false}
                    getStoryTitle={getStoryTitle}
                  />

                  <section className="read-section read-slab">
                    <div className="bookshelf-header">
                      <h3>Create a Bookshelf</h3>
                    </div>
                    <button className="button ghost">+ Create a bookshelf</button>
                  </section>

                  <section className="read-section">
                    <div className="read-tool-panels">
                      <div className="read-tool-panel" ref={generatePanelRef}>
                        <GenerateStoryPanel activeLanguage={activeLanguage} headingLevel="h3" />
                      </div>
                      <div className="read-tool-panel" ref={importPanelRef}>
                        <ImportBookPanel activeLanguage={activeLanguage} headingLevel="h3" />
                      </div>
                    </div>
                  </section>
                </>
              )}
            </div>
          )}

          {activeTab === 'listen' && (
            <>
              <section className="read-section read-slab continue-section">
                <div className="continue-card">
                  <div className="continue-card-meta">
                    <h3 className="continue-card-label">Continue listening</h3>
                    <div className="continue-card-title">Your latest session</div>
                    <div className="continue-card-progress ui-text">
                      {activeLanguage || 'Target language'} · Episode 5 · 42% complete
                    </div>
                  </div>
                  <div className="continue-card-actions">
                    <button
                      className="button ghost"
                      onClick={() => navigate('/listening')}
                      disabled={!activeLanguage}
                    >
                      Resume
                    </button>
                    <button
                      className="text-link ui-text"
                      onClick={() => navigate('/listening')}
                      disabled={!activeLanguage}
                    >
                      View listening library →
                    </button>
                  </div>
                </div>
              </section>

              <section className="read-section read-slab">
                <div className="read-section-header">
                  <h3>Your audiobooks</h3>
                  <button
                    className="text-link ui-text"
                    onClick={() => navigate('/listening')}
                    disabled={!activeLanguage}
                  >
                    View all →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'City Dialogues', progress: 45, meta: 'Spanish · 14m left' },
                    { title: 'Mountain Tales', progress: 20, meta: 'French · Chapter 3' },
                    { title: 'Everyday Heroes', progress: 70, meta: 'German · 6m left' },
                    { title: 'Quiet Mornings', progress: 10, meta: 'Italian · Chapter 1' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/listening')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/listening')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="read-section-header">
                  <h3>Your podcasts</h3>
                  <button className="text-link ui-text" onClick={() => navigate('/listening')}>
                    Explore shows →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'Language Lab Live', progress: 35, meta: 'Episode 12 · 18m left' },
                    { title: 'Café Chats', progress: 60, meta: 'Episode 4 · Spanish' },
                    { title: 'Traveler Notes', progress: 15, meta: 'Episode 2 · French' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/listening')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/listening')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="read-section-header">
                  <h3>Your videos</h3>
                  <button className="text-link ui-text" onClick={() => navigate('/cinema/library')}>
                    Browse cinema →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'Street Food Stories', progress: 50, meta: 'Subtitled clip' },
                    { title: 'News Highlights', progress: 30, meta: 'Spanish · 6m left' },
                    { title: 'Mini Docu', progress: 10, meta: 'French · New' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/cinema/library')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/cinema/library')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="read-section-header">
                  <h3>Your music</h3>
                  <button className="text-link ui-text" onClick={() => navigate('/listening')}>
                    Open library →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'Morning Mix', progress: 80, meta: 'Playlist · 22 tracks' },
                    { title: 'Indie Focus', progress: 55, meta: 'Album · 8 tracks' },
                    { title: 'Chill Study', progress: 15, meta: 'Playlist · New' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/listening')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/listening')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {activeLanguage ? (
                <section className="read-section">
                  <div className="read-tool-panels">
                    <div className="read-tool-panel">
                      <h3>Spotify importer</h3>
                      <p className="muted small">
                        Connect your Spotify to pull playlists, podcasts, and albums directly into your listening library.
                      </p>
                      <button className="button ghost" onClick={() => navigate('/listening')}>
                        Open Spotify importer
                      </button>
                    </div>
                    <div className="read-tool-panel">
                      <h3>YouTube importer</h3>
                      <p className="muted small">
                        Import subtitles and transcripts from your favorite videos to keep them in your study stack.
                      </p>
                      <button className="button ghost" onClick={() => navigate('/importaudio/video')}>
                        Open YouTube importer
                      </button>
                    </div>
                    <div className="read-tool-panel">
                      <h3>Comprehension Practice with Juan</h3>
                      <p className="muted small">
                        Practice understanding conversational {activeLanguage || 'target language'} while responding naturally in your own native language.
                      </p>
                      <button className="button ghost" onClick={() => navigate('/listening')}>
                        Start comprehension practice
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <p className="muted small" style={{ marginTop: '0.75rem' }}>
                  Add a language to unlock your listening tools.
                </p>
              )}
            </>
          )}

          {activeTab === 'speak' && (
            <div className="coming-soon">
              <p className="muted">Speaking workouts will land here soon.</p>
            </div>
          )}

          {activeTab === 'write' && (
            <div className="coming-soon">
              <p className="muted">Writing prompts and feedback are on the way.</p>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="read-grid">
              <div className="read-card">
                <h3>Flashcard review</h3>
                <p className="muted small">Keep vocabulary fresh with spaced repetition.</p>
                <button className="button ghost" onClick={() => navigate('/review')} disabled={!activeLanguage}>
                  Start reviewing
                </button>
              </div>
              <div className="read-card">
                <h3>Recent words</h3>
                <p className="muted small">Quick access to the latest terms you saved.</p>
                <button className="button ghost" onClick={() => navigate('/dashboard', { state: { initialTab: 'read' } })}>
                  View words
                </button>
              </div>
              <div className="read-card">
                <h3>Progress</h3>
                <p className="muted small">Review streaks and accuracy coming soon.</p>
                <button className="button ghost" disabled>
                  Tracking soon
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Dashboard
