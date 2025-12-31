import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from '../constants/languages'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import {
  loadDueCards,
  loadCardsByStatus,
  loadDueCardsByContentId,
  updateVocabSRS,
  setVocabStatus,
  VOCAB_STATUSES,
} from '../services/vocab'

// Icons
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

const CardsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18" />
  </svg>
)

// Status abbreviations for display
const STATUS_ABBREV = { unknown: 'U', recognised: 'R', familiar: 'F', known: 'K' }

// Deck definitions for Core shelf
const CORE_DECKS = [
  { id: 'all', label: 'All Cards', filter: null },
  { id: 'unknown', label: 'Unknown', filter: 'unknown' },
  { id: 'recognised', label: 'Recognised', filter: 'recognised' },
  { id: 'familiar', label: 'Familiar', filter: 'familiar' },
]

const Review = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  // Language selection
  const supportedLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages]
  )
  const activeLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage) {
      const resolved = resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
      if (resolved) return resolved
    }
    return supportedLanguages.length ? supportedLanguages[0] : ''
  }, [profile?.lastUsedLanguage, supportedLanguages])

  // View state
  const [view, setView] = useState('shelves') // 'shelves' | 'session'
  const [selectedDeck, setSelectedDeck] = useState(null)

  // Deck counts for display
  const [deckCounts, setDeckCounts] = useState({})
  const [countsLoading, setCountsLoading] = useState(true)

  // Content items for "All Content" shelf
  const [contentItems, setContentItems] = useState([])
  const [contentLoading, setContentLoading] = useState(true)

  // Review session state
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState('')

  // Review mode toggles
  const [isRecallMode, setIsRecallMode] = useState(false)
  const [autoPlayAudio, setAutoPlayAudio] = useState(true)

  // Audio state
  const audioRef = useRef(null)
  const [audioLoading, setAudioLoading] = useState(false)

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [user, navigate])

  // Load deck counts
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

  // Start a review session for a deck
  const startSession = useCallback(
    async (deck) => {
      if (!user || !activeLanguage) return

      setSessionLoading(true)
      setSessionError('')
      setSelectedDeck(deck)
      setView('session')
      setCurrentIndex(0)
      setShowAnswer(false)

      try {
        let loadedCards = []

        if (deck.type === 'core') {
          if (deck.filter) {
            loadedCards = await loadCardsByStatus(user.uid, activeLanguage, deck.filter)
          } else {
            loadedCards = await loadDueCards(user.uid, activeLanguage)
          }
        } else if (deck.type === 'content') {
          loadedCards = await loadDueCardsByContentId(user.uid, activeLanguage, deck.contentId)
        }

        setCards(loadedCards)
      } catch (error) {
        console.error('Error loading cards:', error)
        setSessionError('Failed to load cards. Please try again.')
      } finally {
        setSessionLoading(false)
      }
    },
    [user, activeLanguage]
  )

  // Play audio for current card
  const playAudio = useCallback(
    async (word) => {
      if (!word || !activeLanguage || !profile?.nativeLanguage) return

      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      setAudioLoading(true)

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: word,
            sourceLang: activeLanguage,
            targetLang: profile.nativeLanguage,
          }),
        })

        if (!response.ok) throw new Error('Failed to fetch audio')

        const data = await response.json()

        if (data.audioUrl || data.audioBase64) {
          const audio = new Audio()
          if (data.audioBase64) {
            audio.src = `data:audio/mp3;base64,${data.audioBase64}`
          } else {
            audio.src = data.audioUrl
          }
          audio.play().catch((err) => console.error('Audio playback failed:', err))
          audioRef.current = audio
        }
      } catch (error) {
        console.error('Error playing audio:', error)
      } finally {
        setAudioLoading(false)
      }
    },
    [activeLanguage, profile?.nativeLanguage]
  )

  // Auto-play audio when card changes or answer is revealed
  useEffect(() => {
    if (!autoPlayAudio || !showAnswer || cards.length === 0) return

    const currentCard = cards[currentIndex]
    if (currentCard && !isRecallMode) {
      // In recognition mode, play when answer is shown
      playAudio(currentCard.text)
    }
  }, [showAnswer, currentIndex, autoPlayAudio, isRecallMode, cards, playAudio])

  // Handle reveal answer
  const handleReveal = () => {
    setShowAnswer(true)
    // In recall mode, auto-play on reveal
    if (autoPlayAudio && isRecallMode && cards[currentIndex]) {
      playAudio(cards[currentIndex].text)
    }
  }

  // Handle review response
  const handleResponse = async (quality) => {
    const currentCard = cards[currentIndex]
    if (!currentCard || !user) return

    try {
      await updateVocabSRS(user.uid, activeLanguage, currentCard.text, quality, isRecallMode)

      // Remove card from session
      const updatedCards = cards.filter((_, idx) => idx !== currentIndex)
      const nextIndex = currentIndex >= updatedCards.length ? 0 : currentIndex

      setCards(updatedCards)
      setCurrentIndex(nextIndex)
      setShowAnswer(false)

      // Update deck counts
      setDeckCounts((prev) => {
        const newCounts = { ...prev }
        if (newCounts.all > 0) newCounts.all -= 1
        if (currentCard.status && newCounts[currentCard.status] > 0) {
          newCounts[currentCard.status] -= 1
        }
        return newCounts
      })
    } catch (error) {
      console.error('Error updating card:', error)
      setSessionError('Failed to update card. Please try again.')
    }
  }

  // Handle manual status change
  const handleStatusChange = async (newStatus) => {
    const currentCard = cards[currentIndex]
    if (!currentCard || !user) return

    try {
      await setVocabStatus(user.uid, activeLanguage, currentCard.text, newStatus)

      // Update local card state
      const updatedCards = cards.map((card, idx) =>
        idx === currentIndex ? { ...card, status: newStatus } : card
      )
      setCards(updatedCards)
    } catch (error) {
      console.error('Error changing status:', error)
    }
  }

  // Go back to shelves view
  const handleBack = () => {
    setView('shelves')
    setSelectedDeck(null)
    setCards([])
    setCurrentIndex(0)
    setShowAnswer(false)
    // Refresh counts
    if (user && activeLanguage) {
      loadDueCards(user.uid, activeLanguage).then((allCards) => {
        setDeckCounts({
          all: allCards.length,
          unknown: allCards.filter((c) => c.status === 'unknown').length,
          recognised: allCards.filter((c) => c.status === 'recognised').length,
          familiar: allCards.filter((c) => c.status === 'familiar').length,
        })
      })
    }
  }

  const currentCard = cards[currentIndex] || null
  const hasLanguages = supportedLanguages.length > 0

  // Render shelves view
  if (view === 'shelves') {
    return (
      <div className="page review-page">
        <div className="review-container">
          <div className="page-header">
            <div>
              <h1>Review</h1>
              <p className="muted small">Spaced repetition for your vocabulary</p>
            </div>
            <button className="button ghost" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>

          {!hasLanguages ? (
            <p className="muted">Add a language first to review vocabulary.</p>
          ) : !activeLanguage ? (
            <p className="muted">Select a language to review vocabulary.</p>
          ) : (
            <div className="review-shelves">
              {/* Core Shelf */}
              <section className="review-shelf">
                <h2 className="review-shelf-title">Core</h2>
                <div className="review-deck-grid">
                  {CORE_DECKS.map((deck) => {
                    const count = deckCounts[deck.id] ?? 0
                    return (
                      <button
                        key={deck.id}
                        className="review-deck-card"
                        onClick={() =>
                          startSession({ type: 'core', id: deck.id, label: deck.label, filter: deck.filter })
                        }
                        disabled={countsLoading || count === 0}
                      >
                        <div className="review-deck-icon">
                          <CardsIcon />
                        </div>
                        <div className="review-deck-label">{deck.label}</div>
                        <div className="review-deck-count">
                          {countsLoading ? '...' : `${count} due`}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Favourites Shelf - Placeholder */}
              <section className="review-shelf">
                <h2 className="review-shelf-title">My Favourites</h2>
                <p className="muted small">Favourite content decks will appear here.</p>
              </section>

              {/* Recently Studied Shelf - Placeholder */}
              <section className="review-shelf">
                <h2 className="review-shelf-title">Recently Studied</h2>
                <p className="muted small">Your last 10 studied content items will appear here.</p>
              </section>

              {/* All Content Shelf */}
              <section className="review-shelf">
                <h2 className="review-shelf-title">All Content</h2>
                {contentLoading ? (
                  <p className="muted small">Loading content...</p>
                ) : contentItems.length === 0 ? (
                  <p className="muted small">No content yet. Add stories, videos, or podcasts to create decks.</p>
                ) : (
                  <div className="review-deck-grid">
                    {contentItems.map((item) => (
                      <button
                        key={item.id}
                        className="review-deck-card"
                        onClick={() =>
                          startSession({
                            type: 'content',
                            contentId: item.id,
                            label: item.title,
                          })
                        }
                      >
                        <div className="review-deck-icon">
                          <CardsIcon />
                        </div>
                        <div className="review-deck-label">{item.title}</div>
                        <div className="review-deck-count">{item.type}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render review session view
  return (
    <div className="page review-page">
      <div className="review-container">
        {/* Session Header */}
        <div className="review-session-header">
          <button className="button ghost icon-button" onClick={handleBack}>
            <ChevronLeftIcon />
          </button>
          <div className="review-session-title">
            <h2>{selectedDeck?.label || 'Review'}</h2>
            {cards.length > 0 && (
              <span className="review-progress">
                Card {currentIndex + 1} of {cards.length}
              </span>
            )}
          </div>
          <div className="review-toggles">
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={isRecallMode}
                onChange={(e) => setIsRecallMode(e.target.checked)}
              />
              <span>Recall</span>
            </label>
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={autoPlayAudio}
                onChange={(e) => setAutoPlayAudio(e.target.checked)}
              />
              <span>Audio</span>
            </label>
          </div>
        </div>

        {/* Session Content */}
        {sessionLoading ? (
          <div className="review-message">
            <p className="muted">Loading cards...</p>
          </div>
        ) : sessionError ? (
          <div className="review-message">
            <p className="error">{sessionError}</p>
            <button className="button ghost" onClick={handleBack}>
              Back to shelves
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="review-message">
            <p className="muted">0 cards due</p>
            <p className="muted small">Great job! Check back later.</p>
            <button className="button ghost" onClick={handleBack}>
              Back to shelves
            </button>
          </div>
        ) : (
          <div className="review-session">
            {/* Card */}
            <div className="review-card-container">
              <div className={`review-card ${showAnswer ? 'is-flipped' : ''}`}>
                {/* Front of card */}
                <div className="review-card-front">
                  <div className="review-card-content">
                    {isRecallMode ? (
                      // Recall mode: show translation first
                      <div className="review-card-translation">
                        {currentCard?.translation || 'No translation'}
                      </div>
                    ) : (
                      // Recognition mode: show word first
                      <>
                        <div className="review-card-word">{currentCard?.text}</div>
                        <button
                          className="review-audio-button"
                          onClick={() => playAudio(currentCard?.text)}
                          disabled={audioLoading}
                        >
                          <PlayIcon />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Back of card */}
                <div className="review-card-back">
                  <div className="review-card-content">
                    {isRecallMode ? (
                      // Recall mode: reveal word
                      <>
                        <div className="review-card-word">{currentCard?.text}</div>
                        <button
                          className="review-audio-button"
                          onClick={() => playAudio(currentCard?.text)}
                          disabled={audioLoading}
                        >
                          <PlayIcon />
                        </button>
                        <div className="review-card-translation-small">
                          {currentCard?.translation || 'No translation'}
                        </div>
                      </>
                    ) : (
                      // Recognition mode: reveal translation
                      <>
                        <div className="review-card-word">{currentCard?.text}</div>
                        <button
                          className="review-audio-button"
                          onClick={() => playAudio(currentCard?.text)}
                          disabled={audioLoading}
                        >
                          <PlayIcon />
                        </button>
                        <div className="review-card-translation">
                          {currentCard?.translation || 'No translation'}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {!showAnswer ? (
              <div className="review-actions">
                <button className="button review-reveal-button" onClick={handleReveal}>
                  Show Answer
                </button>
              </div>
            ) : (
              <div className="review-actions">
                {/* Status adjustment */}
                <div className="review-status-row">
                  <span className="review-status-label">Status:</span>
                  <div className="review-status-buttons">
                    {VOCAB_STATUSES.filter((s) => s !== 'known').map((status) => (
                      <button
                        key={status}
                        className={`review-status-button ${
                          currentCard?.status === status ? 'is-active' : ''
                        }`}
                        onClick={() => handleStatusChange(status)}
                      >
                        {STATUS_ABBREV[status]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Response buttons */}
                <div className="review-response-buttons">
                  <button
                    className="button review-response-button again"
                    onClick={() => handleResponse('again')}
                  >
                    Again
                  </button>
                  <button
                    className="button review-response-button hard"
                    onClick={() => handleResponse('hard')}
                  >
                    Hard
                  </button>
                  <button
                    className="button review-response-button good"
                    onClick={() => handleResponse('good')}
                  >
                    Good
                  </button>
                  <button
                    className="button review-response-button easy"
                    onClick={() => handleResponse('easy')}
                  >
                    Easy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Review
