import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import DashboardLayout, { DASHBOARD_TABS } from '../components/layout/DashboardLayout'
import ListeningHub from '../components/listen/ListeningHub'
import WritingHub from '../components/write/WritingHub'
import ImportBookPanel from '../components/read/ImportBookPanel'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from '../constants/languages'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { loadDueCards } from '../services/vocab'

// Icons for review decks
const CardsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18" />
  </svg>
)

const PinIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M9 4v6l-2 4v2h10v-2l-2-4V4" />
    <line x1="12" y1="16" x2="12" y2="21" />
    <line x1="8" y1="4" x2="16" y2="4" />
  </svg>
)

const HideIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

// Core deck definitions
const CORE_DECKS = [
  { id: 'all', label: 'All Cards', filter: null },
  { id: 'unknown', label: 'Unknown', filter: 'unknown' },
  { id: 'recognised', label: 'Recognised', filter: 'recognised' },
  { id: 'familiar', label: 'Familiar', filter: 'familiar' },
]

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
  const requestedTab = useMemo(() => {
    const initialTab = location.state?.initialTab
    return initialTab && DASHBOARD_TABS.includes(initialTab) ? initialTab : ''
  }, [location.state?.initialTab])
  const [activeTab, setActiveTab] = useState(requestedTab || 'home')
  const [slideDirection, setSlideDirection] = useState('')
  const [items, setItems] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const generatePanelRef = useRef(null)
  const importPanelRef = useRef(null)

  // Review tab state
  const [deckCounts, setDeckCounts] = useState({})
  const [countsLoading, setCountsLoading] = useState(true)
  const [contentItems, setContentItems] = useState([])
  const [contentLoading, setContentLoading] = useState(true)
  const [pinnedDecks, setPinnedDecks] = useState(() => {
    try {
      const saved = localStorage.getItem('pinnedDecks')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const availableLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages],
  )
  const activeLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage) {
      const resolved = resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
      if (resolved && availableLanguages.includes(resolved)) {
        return resolved
      }
    }
    if (availableLanguages.length) return availableLanguages[0]
    return ''
  }, [availableLanguages, profile?.lastUsedLanguage])

  useEffect(() => {
    if (!requestedTab) return

    setActiveTab((currentTab) => {
      if (requestedTab === currentTab) return currentTab

      const currentIndex = DASHBOARD_TABS.indexOf(currentTab)
      const nextIndex = DASHBOARD_TABS.indexOf(requestedTab)

      if (nextIndex > currentIndex) {
        setSlideDirection('right')
      } else if (nextIndex < currentIndex) {
        setSlideDirection('left')
      }

      return requestedTab
    })
  }, [requestedTab])

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

  // Load review deck counts
  useEffect(() => {
    if (!user || !activeLanguage) {
      setDeckCounts({})
      setCountsLoading(false)
      return
    }

    const loadCounts = async () => {
      setCountsLoading(true)
      try {
        const allCards = await loadDueCards(user.uid, activeLanguage)
        const counts = {
          all: allCards.length,
          unknown: allCards.filter((c) => c.status === 'unknown').length,
          recognised: allCards.filter((c) => c.status === 'recognised').length,
          familiar: allCards.filter((c) => c.status === 'familiar').length,
        }
        setDeckCounts(counts)
      } catch (error) {
        console.error('Error loading deck counts:', error)
      } finally {
        setCountsLoading(false)
      }
    }

    loadCounts()
  }, [user, activeLanguage])

  // Load content items for All Content shelf
  useEffect(() => {
    if (!user || !activeLanguage) {
      setContentItems([])
      setContentLoading(false)
      return
    }

    const loadContent = async () => {
      setContentLoading(true)
      try {
        const allContent = []

        // Load stories
        const storiesRef = collection(db, 'users', user.uid, 'stories')
        const storiesQuery = query(
          storiesRef,
          where('language', '==', activeLanguage),
          orderBy('createdAt', 'desc')
        )
        const storiesSnap = await getDocs(storiesQuery)
        storiesSnap.forEach((doc) => {
          allContent.push({
            id: doc.id,
            type: 'story',
            title: doc.data().title || 'Untitled Story',
            ...doc.data(),
          })
        })

        // Load YouTube videos
        const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')
        const videosQuery = query(
          videosRef,
          where('language', '==', activeLanguage),
          orderBy('createdAt', 'desc')
        )
        const videosSnap = await getDocs(videosQuery)
        videosSnap.forEach((doc) => {
          allContent.push({
            id: doc.id,
            type: 'video',
            title: doc.data().title || 'Untitled Video',
            ...doc.data(),
          })
        })

        // Load Spotify items
        const spotifyRef = collection(db, 'users', user.uid, 'spotifyItems')
        const spotifyQuery = query(spotifyRef, where('language', '==', activeLanguage))
        const spotifySnap = await getDocs(spotifyQuery)
        spotifySnap.forEach((doc) => {
          allContent.push({
            id: doc.id,
            type: 'spotify',
            title: doc.data().title || doc.data().name || 'Untitled',
            ...doc.data(),
          })
        })

        setContentItems(allContent)
      } catch (error) {
        console.error('Error loading content items:', error)
      } finally {
        setContentLoading(false)
      }
    }

    loadContent()
  }, [user, activeLanguage])

  // Navigate to review session with deck info
  const startReviewSession = (deck) => {
    const params = new URLSearchParams()
    params.set('type', deck.type)
    if (deck.filter) params.set('filter', deck.filter)
    if (deck.contentId) params.set('contentId', deck.contentId)
    if (deck.label) params.set('label', deck.label)
    navigate(`/review?${params.toString()}`)
  }

  // Toggle pin status for a deck
  const togglePinDeck = (deckInfo) => {
    setPinnedDecks((prev) => {
      const key = deckInfo.type === 'core' ? `core:${deckInfo.id}` : `content:${deckInfo.contentId}`
      const exists = prev.some((p) => p.key === key)
      let next
      if (exists) {
        next = prev.filter((p) => p.key !== key)
      } else {
        next = [...prev, { key, ...deckInfo }]
      }
      localStorage.setItem('pinnedDecks', JSON.stringify(next))
      return next
    })
  }

  // Check if a deck is pinned
  const isDeckPinned = (type, id) => {
    const key = type === 'core' ? `core:${id}` : `content:${id}`
    return pinnedDecks.some((p) => p.key === key)
  }

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

    const languageForReader = resolveSupportedLanguageLabel(book.language || activeLanguage, '')
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
          {activeTab === 'listen' && <ListeningHub embedded showBackButton={false} />}

          {activeTab === 'speak' && (
            <div className="coming-soon">
              <p className="muted">Speaking workouts will land here soon.</p>
            </div>
          )}

          {activeTab === 'write' && <WritingHub activeLanguage={activeLanguage} />}

          {activeTab === 'review' && (
            <div className="listening-hub">
              {!activeLanguage ? (
                <p className="muted small" style={{ marginTop: '0.75rem' }}>
                  Add a language first to review vocabulary.
                </p>
              ) : (
                <>
                  {/* Pinned - at top */}
                  <div className="section">
                    <div className="section-header">
                      <h3>Pinned</h3>
                    </div>
                    {pinnedDecks.length === 0 ? (
                      <p className="muted small">Pin decks to keep them here for quick access.</p>
                    ) : (
                      <div className="listen-shelf">
                        {pinnedDecks.map((pinned) => {
                          const count = pinned.type === 'core' ? (deckCounts[pinned.id] ?? 0) : 0
                          return (
                            <div
                              key={pinned.key}
                              className={`preview-card listen-card review-deck-card${pinned.type === 'core' && (countsLoading || count === 0) ? ' is-disabled' : ''}`}
                              onClick={() => {
                                if (pinned.type === 'core') {
                                  if (!countsLoading && count > 0) {
                                    startReviewSession({ type: 'core', id: pinned.id, label: pinned.label, filter: pinned.filter })
                                  }
                                } else {
                                  startReviewSession({ type: 'content', contentId: pinned.contentId, label: pinned.label })
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <button
                                type="button"
                                className="review-deck-pin-btn is-pinned"
                                title="Unpin deck"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  togglePinDeck(pinned)
                                }}
                              >
                                <PinIcon filled />
                              </button>
                              <div className="review-deck-card-inner">
                                <div className="review-deck-card-icon">
                                  <CardsIcon />
                                </div>
                                <div className="review-deck-card-content">
                                  <div className="review-deck-card-title">{pinned.label}</div>
                                  <div className="review-deck-card-meta ui-text">
                                    {pinned.type === 'core' ? (countsLoading ? 'Loading...' : `${count} cards due`) : pinned.contentType || 'content'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Core Decks */}
                  <div className="section">
                    <div className="section-header">
                      <h3>Core Decks</h3>
                    </div>
                    <div className="listen-shelf">
                      {CORE_DECKS.map((deck) => {
                        const count = deckCounts[deck.id] ?? 0
                        const pinned = isDeckPinned('core', deck.id)
                        return (
                          <div
                            key={deck.id}
                            className={`preview-card listen-card review-deck-card${countsLoading || count === 0 ? ' is-disabled' : ''}`}
                            onClick={() => {
                              if (!countsLoading && count > 0) {
                                startReviewSession({ type: 'core', id: deck.id, label: deck.label, filter: deck.filter })
                              }
                            }}
                            role="button"
                            tabIndex={countsLoading || count === 0 ? -1 : 0}
                          >
                            <button
                              type="button"
                              className={`review-deck-pin-btn${pinned ? ' is-pinned' : ''}`}
                              title={pinned ? 'Unpin deck' : 'Pin deck'}
                              onClick={(e) => {
                                e.stopPropagation()
                                togglePinDeck({ type: 'core', id: deck.id, label: deck.label, filter: deck.filter })
                              }}
                            >
                              <PinIcon filled={pinned} />
                            </button>
                            <div className="review-deck-card-inner">
                              <div className="review-deck-card-icon">
                                <CardsIcon />
                              </div>
                              <div className="review-deck-card-content">
                                <div className="review-deck-card-title">{deck.label}</div>
                                <div className="review-deck-card-meta ui-text">
                                  {countsLoading ? 'Loading...' : `${count} cards due`}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Recently Studied - Placeholder */}
                  <div className="section">
                    <div className="section-header">
                      <h3>Recently Studied</h3>
                    </div>
                    <p className="muted small">Your last 10 studied content items will appear here.</p>
                  </div>

                  {/* All Content */}
                  <div className="section">
                    <div className="section-header">
                      <h3>All Content</h3>
                    </div>
                    {contentLoading ? (
                      <p className="muted small">Loading content...</p>
                    ) : contentItems.length === 0 ? (
                      <p className="muted small">No content yet. Add stories, videos, or podcasts to create decks.</p>
                    ) : (
                      <div className="listen-shelf">
                        {contentItems.map((item) => {
                          const pinned = isDeckPinned('content', item.id)
                          return (
                            <div
                              key={item.id}
                              className="preview-card listen-card review-deck-card"
                              onClick={() =>
                                startReviewSession({
                                  type: 'content',
                                  contentId: item.id,
                                  label: item.title,
                                })
                              }
                              role="button"
                              tabIndex={0}
                            >
                              <button
                                type="button"
                                className={`review-deck-pin-btn${pinned ? ' is-pinned' : ''}`}
                                title={pinned ? 'Unpin deck' : 'Pin deck'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  togglePinDeck({ type: 'content', contentId: item.id, label: item.title, contentType: item.type })
                                }}
                              >
                                <PinIcon filled={pinned} />
                              </button>
                              <div className="review-deck-card-inner">
                                <div className="review-deck-card-icon">
                                  <CardsIcon />
                                </div>
                                <div className="review-deck-card-content">
                                  <div className="review-deck-card-title">{item.title}</div>
                                  <div className="review-deck-card-meta ui-text">{item.type}</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Dashboard
