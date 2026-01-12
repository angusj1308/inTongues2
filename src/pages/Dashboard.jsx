import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import DashboardLayout, { DASHBOARD_TABS } from '../components/layout/DashboardLayout'
import ListeningHub from '../components/listen/ListeningHub'
import WritingHub from '../components/write/WritingHub'
import TutorHome from '../components/tutor/TutorHome'
import SpeakHub from '../components/speak/SpeakHub'
import ImportBookPanel from '../components/read/ImportBookPanel'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'
import ReviewModal from '../components/review/ReviewModal'
import RoutineBuilder from '../components/home/RoutineBuilder'
import ProgressChart from '../components/home/ProgressChart'
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from '../constants/languages'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { loadDueCards } from '../services/vocab'
import { getHomeStats } from '../services/stats'
import { getTodayActivities, ACTIVITY_TYPES, addActivity, getOrCreateActiveRoutine, DAYS_OF_WEEK, DAY_LABELS } from '../services/routine'

// Get today's day of week (monday, tuesday, etc.)
const getTodayDayOfWeek = () => {
  const dayIndex = new Date().getDay()
  // getDay() returns 0 for Sunday, we need to map to our DAYS_OF_WEEK array
  const dayMap = [6, 0, 1, 2, 3, 4, 5] // Sun=6, Mon=0, Tue=1, etc.
  return DAYS_OF_WEEK[dayMap[dayIndex]]
}

// Simple Add Activity Modal for the routine card
const AddActivityModal = ({ isOpen, onClose, onAdd }) => {
  const [activityType, setActivityType] = useState('reading')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(30)

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({ activityType, time, duration })
    setActivityType('reading')
    setTime('09:00')
    setDuration(30)
    onClose()
  }

  return (
    <div className="routine-modal-overlay" onClick={onClose}>
      <div className="routine-modal" onClick={(e) => e.stopPropagation()}>
        <div className="routine-modal-header">
          <h3>Add Activity</h3>
          <span className="routine-modal-day">{DAY_LABELS[getTodayDayOfWeek()]}</span>
        </div>

        <form onSubmit={handleSubmit} className="routine-modal-form">
          <div className="routine-activity-type-list">
            {ACTIVITY_TYPES.map((type) => (
              <label key={type.id} className="routine-activity-type-option">
                <input
                  type="radio"
                  name="activityType"
                  value={type.id}
                  checked={activityType === type.id}
                  onChange={() => setActivityType(type.id)}
                />
                <span>{type.label}</span>
              </label>
            ))}
          </div>

          <div className="routine-modal-row">
            <label>
              <span className="routine-label-text">Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <label>
              <span className="routine-label-text">Duration (min)</span>
              <input
                type="number"
                min={5}
                max={180}
                step={5}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 30)}
              />
            </label>
          </div>

          <div className="routine-modal-actions">
            <button type="button" className="button ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const PinIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M9 4v6l-2 4v2h10v-2l-2-4V4" />
    <line x1="12" y1="16" x2="12" y2="21" />
    <line x1="8" y1="4" x2="16" y2="4" />
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
  const getInitialTab = () => {
    const initialTab = location.state?.initialTab
    return initialTab && DASHBOARD_TABS.includes(initialTab) ? initialTab : 'home'
  }
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [slideDirection, setSlideDirection] = useState('')
  const [items, setItems] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')

  // Modal states for Generate and Import
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // Review tab state
  const [deckCounts, setDeckCounts] = useState({})
  const [contentCounts, setContentCounts] = useState({})
  const [countsLoading, setCountsLoading] = useState(true)
  const [contentItems, setContentItems] = useState([])
  const [contentLoading, setContentLoading] = useState(true)
  const [reviewDeck, setReviewDeck] = useState(null)
  const [pinnedDecks, setPinnedDecks] = useState(() => {
    try {
      const saved = localStorage.getItem('pinnedDecks')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Home tab state
  const [homeStats, setHomeStats] = useState({
    wordsRead: 0,
    listeningSeconds: 0,
    listeningFormatted: '0m',
    knownWords: 0,
    reviewCount: 0,
    wordsWritten: 0,
    speakingSeconds: 0,
    speakingFormatted: '0m',
  })
  const [homeStatsLoading, setHomeStatsLoading] = useState(true)
  const [todayActivities, setTodayActivities] = useState([])
  const [selectedStat, setSelectedStat] = useState('knownWords')
  const [showAddActivityModal, setShowAddActivityModal] = useState(false)
  const [activeRoutineId, setActiveRoutineId] = useState(null)

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

  // Handle tab changes from navigation (e.g., from other pages)
  useEffect(() => {
    const initialTab = location.state?.initialTab
    if (!initialTab || !DASHBOARD_TABS.includes(initialTab)) return

    setActiveTab((currentTab) => {
      if (initialTab === currentTab) return currentTab

      const currentIndex = DASHBOARD_TABS.indexOf(currentTab)
      const nextIndex = DASHBOARD_TABS.indexOf(initialTab)

      if (nextIndex > currentIndex) {
        setSlideDirection('right')
      } else if (nextIndex < currentIndex) {
        setSlideDirection('left')
      }

      return initialTab
    })
  }, [location.state?.initialTab])

  useEffect(() => {
    if (activeLanguage) {
      setLastUsedLanguage(activeLanguage)
    }
  }, [activeLanguage, setLastUsedLanguage])

  // Load home stats when user, language, or tab changes to home
  useEffect(() => {
    if (!user || !activeLanguage) {
      setHomeStats({ wordsRead: 0, listeningFormatted: '0m', knownWords: 0 })
      setHomeStatsLoading(false)
      setTodayActivities([])
      return
    }

    // Only load stats when on the home tab
    if (activeTab !== 'home') return

    let isMounted = true

    const loadStats = async () => {
      setHomeStatsLoading(true)
      try {
        const [stats, activities, routine] = await Promise.all([
          getHomeStats(user.uid, activeLanguage),
          getTodayActivities(user.uid, activeLanguage),
          getOrCreateActiveRoutine(user.uid, activeLanguage),
        ])
        if (isMounted) {
          setHomeStats(stats)
          setTodayActivities(activities)
          setActiveRoutineId(routine?.id || null)
        }
      } catch (err) {
        console.error('Failed to load home stats:', err)
      } finally {
        if (isMounted) {
          setHomeStatsLoading(false)
        }
      }
    }

    loadStats()

    return () => {
      isMounted = false
    }
  }, [user, activeLanguage, activeTab])

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
      setContentCounts({})
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

        // Calculate counts per content item
        const perContent = {}
        allCards.forEach((card) => {
          if (card.sourceContentIds) {
            card.sourceContentIds.forEach((contentId) => {
              perContent[contentId] = (perContent[contentId] || 0) + 1
            })
          }
        })
        setContentCounts(perContent)
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

        // Load stories (simple query without orderBy to avoid index requirement)
        const storiesRef = collection(db, 'users', user.uid, 'stories')
        const storiesQuery = query(storiesRef, where('language', '==', activeLanguage))
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
        const videosQuery = query(videosRef, where('language', '==', activeLanguage))
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

        // Sort by createdAt client-side
        allContent.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0
          const bTime = b.createdAt?.toMillis?.() || 0
          return bTime - aTime
        })

        console.log('Loaded content items:', allContent.length, allContent)
        setContentItems(allContent)
      } catch (error) {
        console.error('Error loading content items:', error)
      } finally {
        setContentLoading(false)
      }
    }

    loadContent()
  }, [user, activeLanguage])

  // Open review modal with deck info
  const startReviewSession = (deck) => {
    setReviewDeck(deck)
  }

  // Handle review modal close
  const handleReviewModalClose = () => {
    setReviewDeck(null)
  }

  // Handle cards updated callback - reload counts
  const handleCardsUpdated = async () => {
    if (!user || !activeLanguage) return
    try {
      const allCards = await loadDueCards(user.uid, activeLanguage)
      const counts = {
        all: allCards.length,
        unknown: allCards.filter((c) => c.status === 'unknown').length,
        recognised: allCards.filter((c) => c.status === 'recognised').length,
        familiar: allCards.filter((c) => c.status === 'familiar').length,
      }
      setDeckCounts(counts)

      // Recalculate content counts
      const perContent = {}
      allCards.forEach((card) => {
        if (card.sourceContentIds) {
          card.sourceContentIds.forEach((contentId) => {
            perContent[contentId] = (perContent[contentId] || 0) + 1
          })
        }
      })
      setContentCounts(perContent)
    } catch (error) {
      console.error('Error refreshing deck counts:', error)
    }
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

  const handleAddActivity = async (activity) => {
    if (!user?.uid || !activeRoutineId) return
    try {
      const today = getTodayDayOfWeek()
      await addActivity(user.uid, activeRoutineId, today, activity)
      // Refresh today's activities
      const activities = await getTodayActivities(user.uid, activeLanguage)
      setTodayActivities(activities)
    } catch (err) {
      console.error('Failed to add activity:', err)
    }
  }

  const handleOpenBook = (book) => {
    if (!book?.id) return

    const languageForReader = resolveSupportedLanguageLabel(book.language || activeLanguage, '')
    const readerPath = languageForReader
      ? `/reader/${encodeURIComponent(languageForReader)}/${book.id}`
      : `/reader/${book.id}`

    navigate(readerPath)
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
            <div className="home-content">
              {/* Row 1: Three Card Layout */}
              <div className="home-grid-three">
                {/* Card 1: Today's Routine */}
                <div className="home-card home-routine-card">
                  <div className="home-card-header">
                    <h3 className="home-card-title">Routine</h3>
                    <button
                      className="home-add-activity-btn"
                      onClick={() => setShowAddActivityModal(true)}
                      title="Add activity"
                    >
                      +
                    </button>
                  </div>
                  {todayActivities.length > 0 ? (
                    <div className="home-today-list">
                      {todayActivities.map((activity) => {
                        const activityConfig = ACTIVITY_TYPES.find((a) => a.id === activity.activityType) || ACTIVITY_TYPES[0]
                        return (
                          <button
                            key={activity.id}
                            className="home-today-item"
                            onClick={() => {
                              const tabMap = {
                                reading: 'read',
                                listening: 'listen',
                                speaking: 'speak',
                                review: 'review',
                                writing: 'write',
                                tutor: 'tutor',
                              }
                              handleTabClick(tabMap[activity.activityType] || 'read')
                            }}
                          >
                            <span className="home-today-time">{activity.time || '—'}</span>
                            <span className="home-today-activity">{activityConfig.label}</span>
                            <span className="home-today-duration">{activity.duration}m</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="home-today-empty">No activities scheduled for today</p>
                  )}
                  <AddActivityModal
                    isOpen={showAddActivityModal}
                    onClose={() => setShowAddActivityModal(false)}
                    onAdd={handleAddActivity}
                  />
                </div>

                {/* Card 2: Stats */}
                <div className="home-card home-stats-card">
                  <h3 className="home-card-title">Stats</h3>
                  <div className="home-stats-list">
                    <button
                      className={`home-stat-item ${selectedStat === 'knownWords' ? 'active' : ''}`}
                      onClick={() => setSelectedStat('knownWords')}
                    >
                      <span className="home-stat-value">
                        {homeStatsLoading ? '...' : homeStats.knownWords.toLocaleString()}
                      </span>
                      <span className="home-stat-label">known words</span>
                    </button>
                    <button
                      className={`home-stat-item ${selectedStat === 'wordsRead' ? 'active' : ''}`}
                      onClick={() => setSelectedStat('wordsRead')}
                    >
                      <span className="home-stat-value">
                        {homeStatsLoading ? '...' : homeStats.wordsRead >= 1000
                          ? `${(homeStats.wordsRead / 1000).toFixed(1)}k`
                          : homeStats.wordsRead}
                      </span>
                      <span className="home-stat-label">words read</span>
                    </button>
                    <button
                      className={`home-stat-item ${selectedStat === 'listeningSeconds' ? 'active' : ''}`}
                      onClick={() => setSelectedStat('listeningSeconds')}
                    >
                      <span className="home-stat-value">
                        {homeStatsLoading ? '...' : homeStats.listeningFormatted}
                      </span>
                      <span className="home-stat-label">listened</span>
                    </button>
                    <button
                      className={`home-stat-item ${selectedStat === 'reviews' ? 'active' : ''}`}
                      onClick={() => setSelectedStat('reviews')}
                    >
                      <span className="home-stat-value">
                        {homeStatsLoading ? '...' : homeStats.reviewCount || 0}
                      </span>
                      <span className="home-stat-label">cards reviewed</span>
                    </button>
                    <button
                      className={`home-stat-item ${selectedStat === 'wordsWritten' ? 'active' : ''}`}
                      onClick={() => setSelectedStat('wordsWritten')}
                    >
                      <span className="home-stat-value">
                        {homeStatsLoading ? '...' : homeStats.wordsWritten >= 1000
                          ? `${(homeStats.wordsWritten / 1000).toFixed(1)}k`
                          : homeStats.wordsWritten}
                      </span>
                      <span className="home-stat-label">words written</span>
                    </button>
                    <button
                      className={`home-stat-item ${selectedStat === 'speakingSeconds' ? 'active' : ''}`}
                      onClick={() => setSelectedStat('speakingSeconds')}
                    >
                      <span className="home-stat-value">
                        {homeStatsLoading ? '...' : homeStats.speakingFormatted}
                      </span>
                      <span className="home-stat-label">speaking</span>
                    </button>
                  </div>
                </div>

                {/* Card 3: Progress Chart */}
                <ProgressChart
                  userId={user?.uid}
                  language={activeLanguage}
                  selectedStat={selectedStat}
                  homeStats={homeStats}
                />
              </div>

              {/* Row 2: Weekly Calendar */}
              <RoutineBuilder userId={user?.uid} language={activeLanguage} />
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
                  {/* Action Cards Row */}
                  <section className="read-section read-action-cards">
                    <div className="action-cards-row">
                      {/* Continue Reading Card */}
                      <div
                        className="action-card continue-action-card"
                        role="button"
                        tabIndex={continueStory && !libraryLoading ? 0 : -1}
                        onClick={() => continueStory && handleOpenBook(continueStory)}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && continueStory) {
                            handleOpenBook(continueStory)
                          }
                        }}
                      >
                        <div className="action-card-icon">
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                          </svg>
                        </div>
                        <div className="action-card-content">
                          <h3 className="action-card-title">Continue Reading</h3>
                          <p className="action-card-subtitle">
                            {libraryLoading
                              ? 'Loading...'
                              : continueStory
                                ? getStoryTitle(continueStory)
                                : 'No books yet'}
                          </p>
                          {continueStory && (
                            <div className="action-card-progress">
                              <div
                                className="action-card-progress-bar"
                                style={{ width: `${continueProgress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Generate Card */}
                      <div
                        className="action-card generate-action-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowGenerateModal(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setShowGenerateModal(true)
                          }
                        }}
                      >
                        <div className="action-card-icon">
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 3v18M3 12h18" />
                          </svg>
                        </div>
                        <div className="action-card-content">
                          <h3 className="action-card-title">Generate</h3>
                          <p className="action-card-subtitle">Create a new romance story</p>
                        </div>
                      </div>

                      {/* Import Card */}
                      <div
                        className="action-card import-action-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowImportModal(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setShowImportModal(true)
                          }
                        }}
                      >
                        <div className="action-card-icon">
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17,8 12,3 7,8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </div>
                        <div className="action-card-content">
                          <h3 className="action-card-title">Import</h3>
                          <p className="action-card-subtitle">Add a book from a file</p>
                        </div>
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
                    onEmptyAction={() => setShowGenerateModal(true)}
                    onEmptyActionLabel="Generate your first book"
                    onBookClick={handleOpenBook}
                    getStoryTitle={getStoryTitle}
                  />

                  <BookGrid
                    title="Your Adaptations"
                    books={adaptationBooks}
                    emptyMessage="You haven't imported or adapted any books yet."
                    loading={libraryLoading}
                    onEmptyAction={() => setShowImportModal(true)}
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
                </>
              )}
            </div>
          )}
          {activeTab === 'listen' && <ListeningHub embedded showBackButton={false} />}

          {activeTab === 'speak' && (
            <SpeakHub
              activeLanguage={activeLanguage}
              nativeLanguage={resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')}
            />
          )}

          {activeTab === 'write' && <WritingHub activeLanguage={activeLanguage} />}

          {activeTab === 'tutor' && (
            <TutorHome
              activeLanguage={activeLanguage}
              nativeLanguage={resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English')}
            />
          )}

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
                          const count = pinned.type === 'core'
                            ? (deckCounts[pinned.id] ?? 0)
                            : (contentCounts[pinned.contentId] || 0)
                          const isDisabled = countsLoading || count === 0
                          return (
                            <div
                              key={pinned.key}
                              className={`preview-card listen-card review-deck-card${isDisabled ? ' is-disabled' : ''}`}
                              onClick={() => {
                                if (isDisabled) return
                                if (pinned.type === 'core') {
                                  startReviewSession({ type: 'core', id: pinned.id, label: pinned.label, filter: pinned.filter })
                                } else {
                                  startReviewSession({ type: 'content', contentId: pinned.contentId, label: pinned.label })
                                }
                              }}
                              role="button"
                              tabIndex={isDisabled ? -1 : 0}
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
                                <div className="review-deck-card-content">
                                  <div className="review-deck-card-title">{pinned.label}</div>
                                  <div className="review-deck-card-meta ui-text">
                                    {countsLoading ? 'Loading...' : `${count} due`}
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
                              <div className="review-deck-card-content">
                                <div className="review-deck-card-title">{deck.label}</div>
                                <div className="review-deck-card-meta ui-text">
                                  {countsLoading ? 'Loading...' : `${count} due`}
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
                          const count = contentCounts[item.id] || 0
                          return (
                            <div
                              key={item.id}
                              className={`preview-card listen-card review-deck-card${countsLoading || count === 0 ? ' is-disabled' : ''}`}
                              onClick={() => {
                                if (!countsLoading && count > 0) {
                                  startReviewSession({
                                    type: 'content',
                                    contentId: item.id,
                                    label: item.title,
                                  })
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
                                  togglePinDeck({ type: 'content', contentId: item.id, label: item.title, contentType: item.type })
                                }}
                              >
                                <PinIcon filled={pinned} />
                              </button>
                              <div className="review-deck-card-inner">
                                <div className="review-deck-card-content">
                                  <div className="review-deck-card-title">{item.title}</div>
                                  <div className="review-deck-card-meta ui-text">
                                    {countsLoading ? 'Loading...' : `${count} due`}
                                  </div>
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

      {/* Review Modal */}
      {reviewDeck && (
        <ReviewModal
          deck={reviewDeck}
          language={activeLanguage}
          onClose={handleReviewModalClose}
          onCardsUpdated={handleCardsUpdated}
        />
      )}

      {/* Generate Story Modal */}
      {showGenerateModal && (
        <GenerateStoryPanel
          activeLanguage={activeLanguage}
          isModal
          onClose={() => setShowGenerateModal(false)}
        />
      )}

      {/* Import Book Modal */}
      {showImportModal && (
        <ImportBookPanel
          activeLanguage={activeLanguage}
          isModal
          onClose={() => setShowImportModal(false)}
        />
      )}
    </DashboardLayout>
  )
}

export default Dashboard
