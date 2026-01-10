import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { HIGHLIGHT_COLOR, STATUS_OPACITY } from '../../constants/highlightColors'
import {
  loadDueCards,
  loadCardsByStatus,
  loadDueCardsByContentId,
  updateVocabSRS,
  setVocabStatus,
  updateVocabTranslation,
  VOCAB_STATUSES,
} from '../../services/vocab'

// Helper to get language color (unified brand color)
const getLanguageColor = () => HIGHLIGHT_COLOR

// Icons
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

// Status abbreviations for display (full spectrum: New, Unknown, Recognised, Familiar, Known)
const ALL_STATUSES = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = { new: 'N', unknown: 'U', recognised: 'R', familiar: 'F', known: 'K' }

// Get background style for a status button when active
// Uses exact same color codes and opacity values as the word highlighting system
const getStatusStyle = (statusLevel, isActive, languageColor) => {
  if (!isActive) return {}

  switch (statusLevel) {
    case 'new':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.new * 100}%, white)`,
        color: '#8B3A3A'
      }
    case 'unknown':
      return {
        background: `color-mix(in srgb, ${languageColor} ${STATUS_OPACITY.unknown * 100}%, white)`,
        color: '#1e293b'
      }
    case 'recognised':
      return {
        background: `color-mix(in srgb, ${languageColor} ${STATUS_OPACITY.recognised * 100}%, white)`,
        color: '#1e293b'
      }
    case 'familiar':
      return {
        background: `color-mix(in srgb, ${languageColor} ${STATUS_OPACITY.familiar * 100}%, white)`,
        color: '#64748b'
      }
    case 'known':
      return {
        background: 'color-mix(in srgb, #22c55e 40%, white)',
        color: '#166534'
      }
    default:
      return {}
  }
}

const ReviewModal = ({ deck, language, onClose, onCardsUpdated }) => {
  const { user, profile } = useAuth()

  // Review session state
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')

  // Review mode toggles
  const [isRecallMode, setIsRecallMode] = useState(false)
  const [autoPlayAudio, setAutoPlayAudio] = useState(true)
  const [useSerifFont, setUseSerifFont] = useState(false)

  // Audio state
  const audioRef = useRef(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [translationLoading, setTranslationLoading] = useState(false)
  const [skipFlipAnimation, setSkipFlipAnimation] = useState(false)

  // Get language color for status selector
  const languageColor = getLanguageColor(language)

  // Load cards when modal opens
  useEffect(() => {
    if (!user || !language || !deck) return

    const loadCards = async () => {
      setSessionLoading(true)
      setSessionError('')

      try {
        let loadedCards = []

        if (deck.type === 'core') {
          if (deck.filter) {
            loadedCards = await loadCardsByStatus(user.uid, language, deck.filter)
          } else {
            loadedCards = await loadDueCards(user.uid, language)
          }
        } else if (deck.type === 'content') {
          loadedCards = await loadDueCardsByContentId(user.uid, language, deck.contentId)
        }

        setCards(loadedCards)
      } catch (error) {
        console.error('Error loading cards:', error)
        setSessionError('Failed to load cards. Please try again.')
      } finally {
        setSessionLoading(false)
      }
    }

    loadCards()
  }, [user, language, deck])

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Helper to check if translation is missing or invalid
  const isMissingTranslation = (translation) => {
    return !translation ||
      translation === 'No translation found' ||
      translation === 'No translation'
  }

  // Fetch missing translation for current card and persist to Firestore
  useEffect(() => {
    const currentCard = cards[currentIndex]
    if (!currentCard || !isMissingTranslation(currentCard.translation)) {
      setTranslationLoading(false)
      return
    }
    if (!language || !profile?.nativeLanguage || !user) return

    setTranslationLoading(true)

    const fetchTranslation = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: currentCard.text,
            sourceLang: language,
            targetLang: profile.nativeLanguage,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.translation && data.translation !== 'No translation found') {
            // Update the card in local state
            setCards((prev) =>
              prev.map((card, idx) =>
                idx === currentIndex ? { ...card, translation: data.translation } : card
              )
            )
            // Persist to Firestore
            await updateVocabTranslation(user.uid, language, currentCard.text, data.translation)
          }
        }
      } catch (error) {
        console.error('Error fetching translation:', error)
      } finally {
        setTranslationLoading(false)
      }
    }

    fetchTranslation()
  }, [currentIndex, cards, language, profile?.nativeLanguage, user])

  // Play audio for current card
  const playAudio = useCallback(
    async (word) => {
      if (!word || !language || !profile?.nativeLanguage) return

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
            sourceLang: language,
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
    [language, profile?.nativeLanguage]
  )

  // Auto-play audio when card is first shown (not when answer is revealed)
  useEffect(() => {
    if (!autoPlayAudio || cards.length === 0 || showAnswer) return

    const currentCard = cards[currentIndex]
    if (currentCard && !isRecallMode) {
      playAudio(currentCard.text)
    }
  }, [currentIndex, autoPlayAudio, isRecallMode, cards, playAudio, showAnswer])

  // Handle reveal answer
  const handleReveal = () => {
    setShowAnswer(true)
    if (autoPlayAudio && isRecallMode && cards[currentIndex]) {
      playAudio(cards[currentIndex].text)
    }
  }

  // Handle review response
  const handleResponse = async (quality) => {
    const currentCard = cards[currentIndex]
    if (!currentCard || !user) return

    try {
      await updateVocabSRS(user.uid, language, currentCard.text, quality, isRecallMode)

      const updatedCards = cards.filter((_, idx) => idx !== currentIndex)
      const nextIndex = currentIndex >= updatedCards.length ? 0 : currentIndex

      // Skip flip animation when transitioning to next card
      setSkipFlipAnimation(true)
      setCards(updatedCards)
      setCurrentIndex(nextIndex)
      setShowAnswer(false)

      // Re-enable animation after state updates
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSkipFlipAnimation(false)
        })
      })

      // Notify parent that cards were updated
      if (onCardsUpdated) {
        onCardsUpdated()
      }
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
      await setVocabStatus(user.uid, language, currentCard.text, newStatus)

      const updatedCards = cards.map((card, idx) =>
        idx === currentIndex ? { ...card, status: newStatus } : card
      )
      setCards(updatedCards)
    } catch (error) {
      console.error('Error changing status:', error)
    }
  }

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const currentCard = cards[currentIndex] || null
  const fontClass = useSerifFont ? 'use-serif-font' : ''

  return (
    <div className="review-modal-backdrop" onClick={handleBackdropClick}>
      <div className={`review-modal ${fontClass}`}>
        {/* Modal Header */}
        <div className="review-modal-header">
          <div className="review-modal-title">
            <h2>{deck?.label || 'Review'}</h2>
            {cards.length > 0 && (
              <span className="review-progress">{cards.length} remaining</span>
            )}
          </div>
          <div className="review-modal-controls">
            <label className="review-toggle-switch">
              <span className="review-toggle-label">Recall</span>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isRecallMode}
                  onChange={(e) => setIsRecallMode(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <label className="review-toggle-switch">
              <span className="review-toggle-label">Audio</span>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoPlayAudio}
                  onChange={(e) => setAutoPlayAudio(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <button className="review-modal-close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="review-modal-content">
          {sessionLoading ? (
            <div className="review-message">
              <p className="muted">Loading cards...</p>
            </div>
          ) : sessionError ? (
            <div className="review-message">
              <p className="error">{sessionError}</p>
              <button className="button ghost" onClick={onClose}>
                Close
              </button>
            </div>
          ) : cards.length === 0 ? (
            <div className="review-message">
              <p className="muted">0 cards due</p>
              <p className="muted small">Great job! Check back later.</p>
              <button className="button ghost" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <div className="review-session">
              {/* Card */}
              <div className="review-card-container">
                {/* Status selector on card */}
                <div className="review-card-status-selector">
                  {ALL_STATUSES.map((status) => {
                    const isActive = currentCard?.status === status
                    const style = getStatusStyle(status, isActive, languageColor)
                    return (
                      <button
                        key={status}
                        type="button"
                        className={`review-card-status-option${isActive ? ' is-active' : ''}`}
                        style={style}
                        onClick={() => handleStatusChange(status)}
                        title={status.charAt(0).toUpperCase() + status.slice(1)}
                      >
                        {STATUS_ABBREV[status]}
                      </button>
                    )
                  })}
                </div>
                <div className={`review-card ${showAnswer ? 'is-flipped' : ''}${skipFlipAnimation ? ' no-transition' : ''}`}>
                  {/* Front of card */}
                  <div className="review-card-front">
                    <div className="review-card-content">
                      {isRecallMode ? (
                        <>
                          <div className="review-card-text">
                            {translationLoading ? '...' : (currentCard?.translation || 'No translation')}
                          </div>
                          {/* Placeholder to match play button height */}
                          <div className="review-audio-placeholder" />
                        </>
                      ) : (
                        <>
                          <div className="review-card-text">{currentCard?.text}</div>
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
                        <>
                          <div className="review-card-text">{currentCard?.text}</div>
                          <button
                            className="review-audio-button"
                            onClick={() => playAudio(currentCard?.text)}
                            disabled={audioLoading}
                          >
                            <PlayIcon />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="review-card-text">
                            {translationLoading ? '...' : (currentCard?.translation || 'No translation')}
                          </div>
                          {/* Placeholder to match play button height */}
                          <div className="review-audio-placeholder" />
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
    </div>
  )
}

export default ReviewModal
