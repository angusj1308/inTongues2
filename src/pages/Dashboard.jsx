import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { collection, getDocs, onSnapshot, orderBy, query, where, writeBatch, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { computePagesWithFontLoading } from '../utils/pagination'
import DashboardLayout, { DASHBOARD_TABS } from '../components/layout/DashboardLayout'
import ListeningHub from '../components/listen/ListeningHub'
import WritingHub from '../components/write/WritingHub'
import TutorHome from '../components/tutor/TutorHome'
import SpeakHub from '../components/speak/SpeakHub'
import ImportBookPanel from '../components/read/ImportBookPanel'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'
import GutenbergSearchPanel from '../components/read/GutenbergSearchPanel'
import ReviewModal from '../components/review/ReviewModal'
import RoutineBuilder from '../components/home/RoutineBuilder'
import ProgressChart from '../components/home/ProgressChart'
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from '../constants/languages'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { loadDueCards } from '../services/vocab'
import { getHomeStats } from '../services/stats'
import { getTodayActivities, ACTIVITY_TYPES, addActivity, getOrCreateActiveRoutine, DAYS_OF_WEEK, DAY_LABELS } from '../services/routine'
import { regeneratePhases, executePhase, resetGeneration } from '../services/novelApiClient'
import generateIcon from '../assets/Generate.png'
import importIcon from '../assets/import.png'

// Target language translations for card headers
const CARD_HEADERS = {
  Spanish: {
    continue: 'Continuar',
    generate: 'Generar',
    import: 'Importar',
    explore: 'Explorar',
    routine: 'Rutina',
    stats: 'Estadísticas',
    recent: 'Recientes',
    allBooks: 'Todos los Libros',
  },
  French: {
    continue: 'Continuer',
    generate: 'Générer',
    import: 'Importer',
    explore: 'Explorer',
    routine: 'Routine',
    stats: 'Statistiques',
    recent: 'Récents',
    allBooks: 'Tous les Livres',
  },
  Italian: {
    continue: 'Continuare',
    generate: 'Generare',
    import: 'Importare',
    explore: 'Esplorare',
    routine: 'Routine',
    stats: 'Statistiche',
    recent: 'Recenti',
    allBooks: 'Tutti i Libri',
  },
  English: {
    continue: 'Continue',
    generate: 'Generate',
    import: 'Import',
    explore: 'Explore',
    routine: 'Routine',
    stats: 'Stats',
    recent: 'Recent',
    allBooks: 'All Books',
  },
}

const getCardHeader = (language, key) => {
  const headers = CARD_HEADERS[language] || CARD_HEADERS.English
  return headers[key] || CARD_HEADERS.English[key]
}

// Get today's day of week (monday, tuesday, etc.)
const getTodayDayOfWeek = () => {
  const dayIndex = new Date().getDay()
  // getDay() returns 0 for Sunday, we need to map to our DAYS_OF_WEEK array
  const dayMap = [6, 0, 1, 2, 3, 4, 5] // Sun=6, Mon=0, Tue=1, etc.
  return DAYS_OF_WEEK[dayMap[dayIndex]]
}

// Simple Add Activity Modal for the routine card (positioned as popover)
const AddActivityModal = ({ isOpen, onClose, onAdd, anchorPosition }) => {
  const [activityType, setActivityType] = useState('reading')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(30)
  const modalRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Calculate position when modal opens
  useEffect(() => {
    if (isOpen && anchorPosition && modalRef.current) {
      const modalRect = modalRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let top = anchorPosition.y + 8
      let left = anchorPosition.x

      // Adjust if modal would go off right edge
      if (left + modalRect.width > viewportWidth - 16) {
        left = viewportWidth - modalRect.width - 16
      }

      // Adjust if modal would go off bottom edge
      if (top + modalRect.height > viewportHeight - 16) {
        top = anchorPosition.y - modalRect.height - 8
      }

      // Ensure minimum positioning
      left = Math.max(16, left)
      top = Math.max(16, top)

      setPosition({ top, left })
    }
  }, [isOpen, anchorPosition])

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
      <div
        ref={modalRef}
        className="routine-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ top: position.top, left: position.left }}
      >
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
  onNextPhase,
  onRegeneratePhase,
  onResetGeneration,
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
          const isGenerating = book.status === 'generating' || book.status === 'planning'
          const isRegenerating = book.status === 'regenerating'
          const isFailed = book.status === 'failed' || book.status === 'error'
          const isProcessing = book.status === 'adapting' || book.status === 'paginating' || book.status === 'pending' || isGenerating || isRegenerating
          // Clickable if not processing and not failed
          const canClick = !isProcessing && !isFailed && onBookClick
          // Show phase controls for generated books
          const showPhaseControls = book.isGeneratedBook && !isProcessing

          return (
            <div
              key={book.id || book.title}
              className={`book-tile ${isProcessing ? 'book-tile--processing' : ''}`}
              role={canClick ? 'button' : undefined}
              tabIndex={canClick ? 0 : undefined}
              onClick={canClick ? () => onBookClick(book) : undefined}
              onKeyDown={
                canClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        onBookClick(book)
                      }
                    }
                  : undefined
              }
            >
              <div className="book-tile-cover">
                {book.coverImageUrl && (
                  <img
                    src={book.coverImageUrl}
                    alt={`Cover of ${titleText}`}
                    className="book-tile-cover-img"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                )}
                {!book.coverImageUrl && (
                  <div className="book-tile-no-cover">
                    <span className="book-tile-no-cover-title">{titleText}</span>
                  </div>
                )}
                {isProcessing && (
                  <div className="book-tile-processing-overlay">
                    <div className="book-tile-spinner" />
                    <span className="book-tile-processing-text">
                      {book.status === 'adapting' ? 'Adapting...'
                        : isRegenerating ? 'Regenerating...'
                        : (book.status === 'generating' || book.status === 'planning') ? 'Generating...'
                        : 'Processing...'}
                    </span>
                  </div>
                )}
                {/* Phase controls for generated books */}
                {showPhaseControls && (
                  <div className="book-phase-controls">
                    <span className="book-phase-indicator">
                      Phase {book.currentPhase || book.lastPhaseCompleted || 0}/9
                    </span>
                    {(book.currentPhase || book.lastPhaseCompleted || 0) < 9 && onNextPhase && (
                      <button
                        className="book-phase-btn book-phase-next"
                        onClick={(e) => {
                          e.stopPropagation()
                          onNextPhase(e, book)
                        }}
                        title={`Run Phase ${(book.currentPhase || book.lastPhaseCompleted || 0) + 1}`}
                      >
                        ▶
                      </button>
                    )}
                    {(book.currentPhase || book.lastPhaseCompleted || 0) > 0 && onRegeneratePhase && (
                      <button
                        className="book-phase-btn book-phase-redo"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRegeneratePhase(e, book)
                        }}
                        title={`Redo Phase ${book.currentPhase || book.lastPhaseCompleted}`}
                      >
                        ↻
                      </button>
                    )}
                    {onResetGeneration && (
                      <button
                        className="book-phase-btn book-phase-reset"
                        onClick={(e) => {
                          e.stopPropagation()
                          onResetGeneration(e, book)
                        }}
                        title="Reset to Phase 1"
                      >
                        ⟲
                      </button>
                    )}
                  </div>
                )}
                <div className="book-tile-hover-overlay">
                  <div className="book-tile-hover-title">{titleText}</div>
                  <div className="book-tile-hover-meta">
                    {book.level ? `Level ${book.level}` : ''}
                    {book.level && book.pageCount ? ' · ' : ''}
                    {book.pageCount ? `${book.pageCount} pages` : ''}
                  </div>
                  <div className="book-tile-hover-progress">
                    <div className="book-tile-hover-progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                </div>
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

  // Modal states for Generate, Import, and Gutenberg
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showGutenbergModal, setShowGutenbergModal] = useState(false)

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
  const [addActivityModal, setAddActivityModal] = useState({ isOpen: false, position: null })
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

    // Track items from both collections
    let storiesItems = []
    let generatedBooksItems = []
    let storiesLoaded = false
    let generatedBooksLoaded = false

    const mergeAndSetItems = () => {
      if (!storiesLoaded || !generatedBooksLoaded) return
      // Merge and sort by createdAt
      const allItems = [...storiesItems, ...generatedBooksItems].sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0
        const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0
        return bTime - aTime
      })
      setItems(allItems)
      setLibraryLoading(false)
    }

    // Listen to stories collection
    const storiesRef = collection(db, 'users', user.uid, 'stories')
    const storiesQuery = query(
      storiesRef,
      where('language', '==', activeLanguage),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribeStories = onSnapshot(
      storiesQuery,
      (snapshot) => {
        storiesItems = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        storiesLoaded = true
        mergeAndSetItems()
      },
      (err) => {
        console.error('Stories load error:', err)
        storiesLoaded = true
        mergeAndSetItems()
      },
    )

    // Listen to generatedBooks collection - query ALL books, filter client-side for debugging
    const generatedBooksRef = collection(db, 'users', user.uid, 'generatedBooks')

    const unsubscribeGeneratedBooks = onSnapshot(
      generatedBooksRef,
      (snapshot) => {
        console.log('Generated books snapshot (ALL):', snapshot.docs.length, 'total docs, filtering for:', activeLanguage)
        snapshot.docs.forEach((doc) => {
          const data = doc.data()
          console.log('  Book:', doc.id, '| language:', JSON.stringify(data.language), '| match:', data.language === activeLanguage)
        })
        // Filter to matching language client-side
        generatedBooksItems = snapshot.docs
          .filter((doc) => doc.data().language === activeLanguage)
          .map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              ...data,
              // Mark as generated book and set title from bible
              isGeneratedBook: true,
              title: data.bible?.coreFoundation?.title || data.concept || 'Untitled Novel',
            }
          })
        console.log('Generated books after filter:', generatedBooksItems.length)
        generatedBooksLoaded = true
        mergeAndSetItems()
      },
      (err) => {
        console.error('Generated books load error:', err)
        generatedBooksLoaded = true
        mergeAndSetItems()
      },
    )

    return () => {
      unsubscribeStories()
      unsubscribeGeneratedBooks()
    }
  }, [activeLanguage, user])

  // Ref for pagination measurement container
  const paginationMeasureRef = useRef(null)
  // Track which books are currently being paginated to avoid duplicates
  const paginatingBooksRef = useRef(new Set())

  // Background pagination for books with status 'paginating'
  useEffect(() => {
    if (!user || !items.length || !paginationMeasureRef.current) return

    const paginatingBooks = items.filter(
      (item) => item.status === 'paginating' && !paginatingBooksRef.current.has(item.id)
    )

    if (!paginatingBooks.length) return

    const runPagination = async (book) => {
      // Mark as being processed
      paginatingBooksRef.current.add(book.id)

      try {
        console.log(`Starting pagination for book: ${book.title} (${book.id})`)

        // Load chapters for this book
        let chapters = []
        if (book.isFlat) {
          // Flat book - create virtual chapter from adaptedTextBlob
          chapters = [{
            id: 'flat-0',
            index: 0,
            title: book.title || 'Untitled',
            adaptedText: book.adaptedTextBlob || '',
            adaptedChapterHeader: book.adaptedChapterHeader || book.chapterHeader || null,
            adaptedChapterOutline: book.adaptedChapterOutline || book.chapterOutline || null,
          }]
        } else {
          // Chapter-based book - load from chapters collection
          const chaptersRef = collection(db, 'users', user.uid, 'stories', book.id, 'chapters')
          const chaptersQuery = query(chaptersRef, orderBy('index', 'asc'))
          const snapshot = await getDocs(chaptersQuery)
          chapters = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
        }

        if (!chapters.length || !chapters.some((c) => c.adaptedText?.trim())) {
          console.warn(`No content to paginate for book: ${book.id}`)
          paginatingBooksRef.current.delete(book.id)
          return
        }

        // Compute pages using the measurement container
        const pages = await computePagesWithFontLoading(chapters, paginationMeasureRef.current)

        if (!pages.length) {
          console.warn(`Pagination produced no pages for book: ${book.id}`)
          paginatingBooksRef.current.delete(book.id)
          return
        }

        console.log(`Computed ${pages.length} pages for book: ${book.title}`)

        // Store pages in Firestore using batch write
        const batch = writeBatch(db)
        const storyRef = doc(db, 'users', user.uid, 'stories', book.id)

        // Write each page to the pages subcollection
        pages.forEach((page) => {
          const pageRef = doc(db, 'users', user.uid, 'stories', book.id, 'pages', String(page.index))
          batch.set(pageRef, page)
        })

        // Update book status to 'ready' and store page count
        batch.update(storyRef, {
          status: 'ready',
          pageCount: pages.length,
        })

        await batch.commit()
        console.log(`Pagination complete for book: ${book.title} - ${pages.length} pages stored`)

      } catch (error) {
        console.error(`Pagination failed for book ${book.id}:`, error)
      } finally {
        paginatingBooksRef.current.delete(book.id)
      }
    }

    // Process paginating books (one at a time to avoid overloading)
    paginatingBooks.forEach((book) => {
      runPagination(book)
    })
  }, [items, user])

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

        // Load generated books (novels/novellas from bible pipeline)
        const generatedBooksRef = collection(db, 'users', user.uid, 'generatedBooks')
        const generatedBooksQuery = query(generatedBooksRef, where('language', '==', activeLanguage))
        const generatedBooksSnap = await getDocs(generatedBooksQuery)
        generatedBooksSnap.forEach((doc) => {
          const data = doc.data()
          allContent.push({
            id: doc.id,
            type: 'generatedBook',
            title: data.bible?.coreFoundation?.title || data.concept || 'Untitled Novel',
            ...data,
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

  const handleDeleteBook = async (e, book) => {
    e.stopPropagation() // Prevent opening the book
    if (!book?.id || !user?.uid) return

    const bookTitle = book.title || book.concept || 'this book'
    const confirmed = window.confirm(`Delete "${bookTitle}" from your library?\n\nYour vocabulary progress will be preserved.`)
    if (!confirmed) return

    try {
      // 1. Delete the story document and pages/chapters via API
      // Pass collectionType so server knows which collection to delete from
      const collectionType = book.isGeneratedBook ? 'generatedBooks' : 'stories'
      const response = await fetch('/api/delete-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, storyId: book.id, collectionType }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete book')
      }

      // 2. Update vocab cards to remove this book from sourceContentIds (but keep the vocab)
      const vocabRef = collection(db, 'users', user.uid, 'vocab')
      const vocabQuery = query(vocabRef, where('sourceContentIds', 'array-contains', book.id))
      const vocabSnap = await getDocs(vocabQuery)

      if (!vocabSnap.empty) {
        const batch = writeBatch(db)
        vocabSnap.forEach((vocabDoc) => {
          const currentIds = vocabDoc.data().sourceContentIds || []
          const updatedIds = currentIds.filter((id) => id !== book.id)
          batch.update(vocabDoc.ref, { sourceContentIds: updatedIds })
        })
        await batch.commit()
      }

    } catch (err) {
      console.error('Error deleting book:', err)
      alert('Failed to delete book. Please try again.')
    }
  }

  // Execute next phase for a book
  const handleNextPhase = async (e, book) => {
    e.stopPropagation()
    if (!book?.id || !user?.uid) return

    const currentPhase = book.currentPhase || book.lastPhaseCompleted || 0
    const nextPhase = currentPhase + 1

    if (nextPhase > 9) {
      alert('All phases complete!')
      return
    }

    try {
      await executePhase({
        uid: user.uid,
        bookId: book.id,
        phase: nextPhase
      })
      // Real-time listener will update UI
    } catch (err) {
      console.error(`Error executing phase ${nextPhase}:`, err)
      alert(`Failed to execute Phase ${nextPhase}: ${err.message}`)
    }
  }

  // Re-run current phase
  const handleRegenerateCurrentPhase = async (e, book) => {
    e.stopPropagation()
    if (!book?.id || !user?.uid) return

    const currentPhase = book.currentPhase || book.lastPhaseCompleted || 0
    if (currentPhase < 1) {
      alert('No phase to regenerate. Click "Next Phase" to start.')
      return
    }

    const confirmed = window.confirm(
      `Regenerate Phase ${currentPhase}?\n\nThis will re-run the phase with fresh generation.`
    )
    if (!confirmed) return

    try {
      await executePhase({
        uid: user.uid,
        bookId: book.id,
        phase: currentPhase
      })
    } catch (err) {
      console.error(`Error regenerating phase ${currentPhase}:`, err)
      alert(`Failed to regenerate Phase ${currentPhase}: ${err.message}`)
    }
  }

  // Reset to start fresh from Phase 1
  const handleResetGeneration = async (e, book) => {
    e.stopPropagation()
    if (!book?.id || !user?.uid) return

    const confirmed = window.confirm(
      'Reset generation?\n\nThis will clear all phase outputs and start fresh from Phase 1.'
    )
    if (!confirmed) return

    try {
      await resetGeneration({
        uid: user.uid,
        bookId: book.id
      })
    } catch (err) {
      console.error('Error resetting generation:', err)
      alert(`Failed to reset generation: ${err.message}`)
    }
  }

  const getStoryTitle = (item) => {
    // Show placeholder for generating books
    if (item.status === 'generating' || item.status === 'planning') {
      return item.concept?.trim() || 'Generating novel...'
    }
    return item.title?.trim() || 'Untitled Story'
  }

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
    <>
      {/* Hidden measurement container for background pagination */}
      <div
        ref={paginationMeasureRef}
        className="reader-measure-container"
        aria-hidden="true"
      />
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
                    <h3 className="home-card-title">{getCardHeader(activeLanguage, 'routine')}</h3>
                    <button
                      className="home-add-activity-btn"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setAddActivityModal({
                          isOpen: true,
                          position: { x: rect.left, y: rect.bottom }
                        })
                      }}
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
                    isOpen={addActivityModal.isOpen}
                    onClose={() => setAddActivityModal({ isOpen: false, position: null })}
                    onAdd={handleAddActivity}
                    anchorPosition={addActivityModal.position}
                  />
                </div>

                {/* Divider */}
                <div className="home-grid-divider" />

                {/* Card 2: Stats */}
                <div className="home-card home-stats-card">
                  <h3 className="home-card-title">{getCardHeader(activeLanguage, 'stats')}</h3>
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

                {/* Divider */}
                <div className="home-grid-divider" />

                {/* Card 3: Progress Chart */}
                <ProgressChart
                  userId={user?.uid}
                  language={activeLanguage}
                  selectedStat={selectedStat}
                  homeStats={homeStats}
                />
              </div>

              {/* Horizontal Divider */}
              <div className="home-row-divider" />

              {/* Row 2: Weekly Calendar */}
              <RoutineBuilder userId={user?.uid} language={activeLanguage} />
            </div>
          )}

          {activeTab === 'read' && (
            <div className="home-content">
              {!activeLanguage ? (
                <p className="muted small" style={{ marginTop: '0.75rem' }}>
                  Add a language to unlock your reading tools.
                </p>
              ) : (
                <>
                  {libraryError ? <p className="error small">{libraryError}</p> : null}

                  {/* Row 1: Three Action Cards */}
                  <div className="home-grid-three">
                    {/* Card 1: Generate */}
                    <button
                      className="home-card reading-action-card"
                      onClick={() => setShowGenerateModal(true)}
                    >
                      <img src={generateIcon} alt="" className="reading-card-icon" />
                      <h3 className="home-card-title">{getCardHeader(activeLanguage, 'generate')}</h3>
                      <p className="reading-card-description">
                        Generate study material in your target language, tailored to your level and interests.
                      </p>
                    </button>

                    {/* Divider */}
                    <div className="home-grid-divider" />

                    {/* Card 2: Import */}
                    <button
                      className="home-card reading-action-card"
                      onClick={() => setShowImportModal(true)}
                    >
                      <img src={importIcon} alt="" className="reading-card-icon" />
                      <h3 className="home-card-title">{getCardHeader(activeLanguage, 'import')}</h3>
                      <p className="reading-card-description">
                        Import your own books and adapt them to your target language and level.
                      </p>
                    </button>

                    {/* Divider */}
                    <div className="home-grid-divider" />

                    {/* Card 3: Explore (Gutenberg) */}
                    <button
                      className="home-card reading-action-card"
                      onClick={() => setShowGutenbergModal(true)}
                    >
                      <div className="reading-card-icon-placeholder" />
                      <h3 className="home-card-title">{getCardHeader(activeLanguage, 'explore')}</h3>
                      <p className="reading-card-description">
                        Explore Gutenberg's vast library of classics, ready to be adapted to your level.
                      </p>
                    </button>
                  </div>

                  {/* Horizontal Divider */}
                  <div className="home-row-divider" />

                  {/* Row 2: Recent Books */}
                  <div className="reading-shelf">
                    <div className="home-card-header">
                      <h3 className="home-card-title">{getCardHeader(activeLanguage, 'recent')}</h3>
                    </div>
                    {libraryLoading ? (
                      <p className="reading-card-empty">Loading your books...</p>
                    ) : !yourRecentBooks?.length ? (
                      <p className="reading-card-empty">Your recent books will appear here</p>
                    ) : (
                      <div className="reading-shelf-scroll">
                        {yourRecentBooks.map((book) => {
                          const progress = Math.max(0, Math.min(100, book.progress || 0))
                          const isGenerating = book.status === 'generating' || book.status === 'planning'
                          const isRegenerating = book.status === 'regenerating'
                          const isFailed = book.status === 'failed' || book.status === 'error'
                          const isProcessing = isGenerating || isRegenerating
                          // Clickable if not processing and not failed (allow bible_complete, bible_needs_review, ready, or no status)
                          const isClickable = !isProcessing && !isFailed
                          // Can regenerate if it's a generated book with bible data and not currently processing
                          return (
                            <div key={book.id || book.title} className={`reading-shelf-item${isProcessing ? ' reading-shelf-item--generating' : ''}${isFailed ? ' reading-shelf-item--failed' : ''}`}>
                              <button
                                className="book-delete-btn"
                                onClick={(e) => handleDeleteBook(e, book)}
                                aria-label="Delete book"
                              >
                                ×
                              </button>
                              {/* Phase controls for generated books */}
                              {book.isGeneratedBook && !isProcessing && (
                                <div className="book-phase-controls">
                                  <span className="book-phase-indicator">
                                    Phase {book.currentPhase || book.lastPhaseCompleted || 0}/9
                                  </span>
                                  {(book.currentPhase || book.lastPhaseCompleted || 0) < 9 && (
                                    <button
                                      className="book-phase-btn book-phase-next"
                                      onClick={(e) => handleNextPhase(e, book)}
                                      title={`Run Phase ${(book.currentPhase || book.lastPhaseCompleted || 0) + 1}`}
                                    >
                                      ▶
                                    </button>
                                  )}
                                  {(book.currentPhase || book.lastPhaseCompleted || 0) > 0 && (
                                    <button
                                      className="book-phase-btn book-phase-redo"
                                      onClick={(e) => handleRegenerateCurrentPhase(e, book)}
                                      title={`Redo Phase ${book.currentPhase || book.lastPhaseCompleted}`}
                                    >
                                      ↻
                                    </button>
                                  )}
                                  <button
                                    className="book-phase-btn book-phase-reset"
                                    onClick={(e) => handleResetGeneration(e, book)}
                                    title="Reset to Phase 1"
                                  >
                                    ⟲
                                  </button>
                                </div>
                              )}
                              <button
                                className="reading-shelf-item-content"
                                onClick={isClickable ? () => handleOpenBook(book) : undefined}
                                disabled={!isClickable}
                              >
                                <div className="reading-shelf-cover">
                                  {book.coverImageUrl && (
                                    <img
                                      src={book.coverImageUrl}
                                      alt={`Cover of ${getStoryTitle(book)}`}
                                      className="reading-shelf-cover-img"
                                      onError={(e) => {
                                        e.target.style.display = 'none'
                                      }}
                                    />
                                  )}
                                  {!book.coverImageUrl && (
                                    <div className="reading-shelf-no-cover">
                                      <span>{getStoryTitle(book)}</span>
                                    </div>
                                  )}
                                  {isProcessing && (
                                    <div className="reading-shelf-generating-overlay">
                                      <div className="reading-shelf-spinner" />
                                      <span className="reading-shelf-generating-text">
                                        {isRegenerating ? 'Regenerating...' : 'Generating...'}
                                      </span>
                                    </div>
                                  )}
                                  {!isProcessing && (
                                    <div className="reading-shelf-hover-overlay">
                                      <div className="reading-shelf-hover-title">{getStoryTitle(book)}</div>
                                      <div className="reading-shelf-hover-meta">
                                        {book.level ? `Level ${book.level}` : ''}
                                        {book.level && book.pageCount ? ' · ' : ''}
                                        {book.pageCount ? `${book.pageCount} pages` : ''}
                                      </div>
                                      <div className="reading-shelf-hover-progress">
                                        <div className="reading-shelf-hover-progress-bar" style={{ width: `${progress}%` }} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Horizontal Divider */}
                  <div className="home-row-divider" />

                  {/* Row 3: All Books */}
                  <div className="reading-shelf">
                    <div className="home-card-header">
                      <h3 className="home-card-title">{getCardHeader(activeLanguage, 'allBooks')}</h3>
                    </div>
                    {libraryLoading ? (
                      <p className="reading-card-empty">Loading...</p>
                    ) : !allBooks?.length ? (
                      <p className="reading-card-empty">No books in your library yet</p>
                    ) : (
                      <div className="reading-shelf-scroll">
                        {allBooks.map((book) => {
                          const progress = Math.max(0, Math.min(100, book.progress || 0))
                          const isGenerating = book.status === 'generating' || book.status === 'planning'
                          const isRegenerating = book.status === 'regenerating'
                          const isFailed = book.status === 'failed' || book.status === 'error'
                          const isProcessing = isGenerating || isRegenerating
                          // Clickable if not processing and not failed (allow bible_complete, bible_needs_review, ready, or no status)
                          const isClickable = !isProcessing && !isFailed
                          // Can regenerate if it's a generated book with bible data and not currently processing
                          return (
                            <div key={book.id || book.title} className={`reading-shelf-item${isProcessing ? ' reading-shelf-item--generating' : ''}${isFailed ? ' reading-shelf-item--failed' : ''}`}>
                              <button
                                className="book-delete-btn"
                                onClick={(e) => handleDeleteBook(e, book)}
                                aria-label="Delete book"
                              >
                                ×
                              </button>
                              {/* Phase controls for generated books */}
                              {book.isGeneratedBook && !isProcessing && (
                                <div className="book-phase-controls">
                                  <span className="book-phase-indicator">
                                    Phase {book.currentPhase || book.lastPhaseCompleted || 0}/9
                                  </span>
                                  {(book.currentPhase || book.lastPhaseCompleted || 0) < 9 && (
                                    <button
                                      className="book-phase-btn book-phase-next"
                                      onClick={(e) => handleNextPhase(e, book)}
                                      title={`Run Phase ${(book.currentPhase || book.lastPhaseCompleted || 0) + 1}`}
                                    >
                                      ▶
                                    </button>
                                  )}
                                  {(book.currentPhase || book.lastPhaseCompleted || 0) > 0 && (
                                    <button
                                      className="book-phase-btn book-phase-redo"
                                      onClick={(e) => handleRegenerateCurrentPhase(e, book)}
                                      title={`Redo Phase ${book.currentPhase || book.lastPhaseCompleted}`}
                                    >
                                      ↻
                                    </button>
                                  )}
                                  <button
                                    className="book-phase-btn book-phase-reset"
                                    onClick={(e) => handleResetGeneration(e, book)}
                                    title="Reset to Phase 1"
                                  >
                                    ⟲
                                  </button>
                                </div>
                              )}
                              <button
                                className="reading-shelf-item-content"
                                onClick={isClickable ? () => handleOpenBook(book) : undefined}
                                disabled={!isClickable}
                              >
                                <div className="reading-shelf-cover">
                                  {book.coverImageUrl && (
                                    <img
                                      src={book.coverImageUrl}
                                      alt={`Cover of ${getStoryTitle(book)}`}
                                      className="reading-shelf-cover-img"
                                      onError={(e) => {
                                        e.target.style.display = 'none'
                                      }}
                                    />
                                  )}
                                  {!book.coverImageUrl && (
                                    <div className="reading-shelf-no-cover">
                                      <span>{getStoryTitle(book)}</span>
                                    </div>
                                  )}
                                  {isProcessing && (
                                    <div className="reading-shelf-generating-overlay">
                                      <div className="reading-shelf-spinner" />
                                      <span className="reading-shelf-generating-text">
                                        {isRegenerating ? 'Regenerating...' : 'Generating...'}
                                      </span>
                                    </div>
                                  )}
                                  {!isProcessing && (
                                    <div className="reading-shelf-hover-overlay">
                                      <div className="reading-shelf-hover-title">{getStoryTitle(book)}</div>
                                      <div className="reading-shelf-hover-meta">
                                        {book.level ? `Level ${book.level}` : ''}
                                        {book.level && book.pageCount ? ' · ' : ''}
                                        {book.pageCount ? `${book.pageCount} pages` : ''}
                                      </div>
                                      <div className="reading-shelf-hover-progress">
                                        <div className="reading-shelf-hover-progress-bar" style={{ width: `${progress}%` }} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add Bookshelf */}
                  <button className="add-bookshelf-btn">
                    + Add bookshelf
                  </button>
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

      {/* Gutenberg Search Modal */}
      {showGutenbergModal && (
        <GutenbergSearchPanel
          activeLanguage={activeLanguage}
          isModal
          onClose={() => setShowGutenbergModal(false)}
          onSelectBook={(book) => {
            // TODO: Integrate with import flow
            console.log('Selected book:', book)
            setShowGutenbergModal(false)
          }}
        />
      )}
      </DashboardLayout>
    </>
  )
}

export default Dashboard
