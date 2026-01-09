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
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from '../constants/languages'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { loadDueCards } from '../services/vocab'
import { getHomeStats } from '../services/stats'
import { getTodayActivities, ACTIVITY_TYPES } from '../services/routine'

// Level thresholds based on known word count
const LEVEL_THRESHOLDS = [
  { min: 0, max: 2000, level: 'Beginner', nextLevel: 'Upper Beginner' },
  { min: 2000, max: 5000, level: 'Upper Beginner', nextLevel: 'Intermediate' },
  { min: 5000, max: 12000, level: 'Intermediate', nextLevel: 'Upper Intermediate' },
  { min: 12000, max: 24000, level: 'Upper Intermediate', nextLevel: 'Advanced' },
  { min: 24000, max: 40000, level: 'Advanced', nextLevel: 'Native-like' },
  { min: 40000, max: Infinity, level: 'Native-like', nextLevel: null },
]

const getLevelInfo = (knownWords) => {
  const threshold = LEVEL_THRESHOLDS.find((t) => knownWords >= t.min && knownWords < t.max) || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
  const progressInLevel = knownWords - threshold.min
  const levelRange = threshold.max === Infinity ? 10000 : threshold.max - threshold.min
  const progressPercent = Math.min(100, (progressInLevel / levelRange) * 100)
  const wordsToNext = threshold.max === Infinity ? 0 : threshold.max - knownWords

  return {
    level: threshold.level,
    nextLevel: threshold.nextLevel,
    progressPercent,
    wordsToNext,
    currentMin: threshold.min,
    currentMax: threshold.max,
  }
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
  const requestedTab = useMemo(() => {
    const initialTab = location.state?.initialTab
    return initialTab && DASHBOARD_TABS.includes(initialTab) ? initialTab : ''
  }, [location.state?.initialTab])
  const [activeTab, setActiveTab] = useState(requestedTab || 'home')
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
    listeningFormatted: '0m',
    knownWords: 0,
  })
  const [homeStatsLoading, setHomeStatsLoading] = useState(true)
  const [todayActivities, setTodayActivities] = useState([])

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

  // Load home stats when user or language changes
  useEffect(() => {
    if (!user || !activeLanguage) {
      setHomeStats({ wordsRead: 0, listeningFormatted: '0m', knownWords: 0 })
      setHomeStatsLoading(false)
      setTodayActivities([])
      return
    }

    let isMounted = true

    const loadStats = async () => {
      setHomeStatsLoading(true)
      try {
        const [stats, activities] = await Promise.all([
          getHomeStats(user.uid, activeLanguage),
          getTodayActivities(user.uid, activeLanguage),
        ])
        if (isMounted) {
          setHomeStats(stats)
          setTodayActivities(activities)
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
  }, [user, activeLanguage])

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

  const levelInfo = useMemo(() => getLevelInfo(homeStats.knownWords), [homeStats.knownWords])

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
              {/* Level Card */}
              <div className="level-card">
                <div className="level-card-header">
                  <div className="level-card-info">
                    <div className="level-card-icon">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                    <div className="level-card-text">
                      <h3>{homeStatsLoading ? '...' : levelInfo.level}</h3>
                      <p className="level-subtitle">
                        {levelInfo.nextLevel
                          ? `${levelInfo.wordsToNext.toLocaleString()} words to ${levelInfo.nextLevel}`
                          : 'Maximum level achieved'}
                      </p>
                    </div>
                  </div>
                  <div className="level-card-words">
                    <div className="word-count">
                      {homeStatsLoading ? '...' : homeStats.knownWords.toLocaleString()}
                    </div>
                    <div className="word-label">known words</div>
                  </div>
                </div>
                <div className="level-progress-container">
                  <div className="level-progress-labels">
                    <span className="level-progress-current">{levelInfo.level}</span>
                    {levelInfo.nextLevel && (
                      <span className="level-progress-next">{levelInfo.nextLevel}</span>
                    )}
                  </div>
                  <div className="level-progress-bar">
                    <div
                      className="level-progress-fill"
                      style={{ width: `${levelInfo.progressPercent}%` }}
                    />
                  </div>
                  <div className="level-progress-meta">
                    <span>{levelInfo.currentMin.toLocaleString()}</span>
                    <span>{levelInfo.currentMax === Infinity ? '40,000+' : levelInfo.currentMax.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="home-stats-row">
                <div className="stat-card">
                  <div className="stat-card-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </div>
                  <div className="stat-label ui-text">Words Read</div>
                  <div className="stat-value">
                    {homeStatsLoading ? '...' : homeStats.wordsRead.toLocaleString()}
                  </div>
                  <div className="stat-subtitle">From your reading</div>
                </div>

                <div className="stat-card">
                  <div className="stat-card-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                    </svg>
                  </div>
                  <div className="stat-label ui-text">Time Listened</div>
                  <div className="stat-value">
                    {homeStatsLoading ? '...' : homeStats.listeningFormatted}
                  </div>
                  <div className="stat-subtitle">Audio & speech practice</div>
                </div>

                <div className="stat-card">
                  <div className="stat-card-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <div className="stat-label ui-text">Known Words</div>
                  <div className="stat-value">
                    {homeStatsLoading ? '...' : homeStats.knownWords.toLocaleString()}
                  </div>
                  <div className="stat-subtitle">Mastered vocabulary</div>
                </div>
              </div>

              {/* Today's Activities */}
              {todayActivities.length > 0 && (
                <div className="today-activities">
                  <div className="today-activities-header">
                    <h3>Today's Plan</h3>
                  </div>
                  <div className="today-activities-list">
                    {todayActivities.map((activity) => {
                      const activityConfig = ACTIVITY_TYPES.find((a) => a.id === activity.activityType) || ACTIVITY_TYPES[0]
                      return (
                        <div
                          key={activity.id}
                          className="today-activity-card"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            const tabMap = {
                              reading: 'read',
                              listening: 'listen',
                              speaking: 'speak',
                              review: 'review',
                              writing: 'write',
                              tutor: 'tutor',
                            }
                            const tab = tabMap[activity.activityType] || 'read'
                            handleTabClick(tab)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              const tabMap = {
                                reading: 'read',
                                listening: 'listen',
                                speaking: 'speak',
                                review: 'review',
                                writing: 'write',
                                tutor: 'tutor',
                              }
                              const tab = tabMap[activity.activityType] || 'read'
                              handleTabClick(tab)
                            }
                          }}
                        >
                          <div className={`today-activity-icon ${activity.activityType}`}>
                            {activity.activityType === 'reading' && (
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                              </svg>
                            )}
                            {activity.activityType === 'listening' && (
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                              </svg>
                            )}
                            {activity.activityType === 'speaking' && (
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                              </svg>
                            )}
                            {activity.activityType === 'review' && (
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="4" width="20" height="16" rx="2" />
                                <path d="M12 8v4" />
                                <path d="M12 16h.01" />
                              </svg>
                            )}
                            {activity.activityType === 'writing' && (
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                              </svg>
                            )}
                            {activity.activityType === 'tutor' && (
                              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                            )}
                          </div>
                          <div className="today-activity-content">
                            <div className="today-activity-type">{activityConfig.label}</div>
                            <div className="today-activity-meta">
                              {activity.time && `${activity.time} · `}
                              {activity.duration}min
                              {activity.title && ` · ${activity.title}`}
                            </div>
                          </div>
                          <div className="today-activity-arrow">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Routine Builder */}
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
