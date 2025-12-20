import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from '../constants/languages'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { updateVocabSRS } from '../services/vocab'

const Review = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [reviewCards, setReviewCards] = useState([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showTranslation, setShowTranslation] = useState(false)

  const supportedLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages],
  )
  const hasLanguages = Boolean(supportedLanguages.length)

  const activeLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage) {
      const resolved = resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
      if (resolved) return resolved
    }
    if (supportedLanguages.length) return supportedLanguages[0]
    return ''
  }, [profile?.lastUsedLanguage, supportedLanguages])

  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [user, navigate])

  useEffect(() => {
    let isSubscribed = true

    const loadReviewCards = async () => {
      if (!user || !activeLanguage) {
        if (isSubscribed) {
          setReviewCards([])
          setCurrentIndex(0)
          setShowTranslation(false)
        }
        return
      }

      setReviewLoading(true)
      setReviewError('')

      try {
        const vocabRef = collection(db, 'users', user.uid, 'vocab')
        const vocabQuery = query(vocabRef, where('language', '==', activeLanguage))
        const snapshot = await getDocs(vocabQuery)
        if (!isSubscribed) return

        const now = new Date()

        const dueCards = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((card) => {
            const nextDate = card.nextReviewAt?.toDate ? card.nextReviewAt.toDate() : null
            return !nextDate || nextDate <= now
          })

        dueCards.sort((a, b) => {
          const aDate = a.nextReviewAt?.toDate ? a.nextReviewAt.toDate() : new Date(0)
          const bDate = b.nextReviewAt?.toDate ? b.nextReviewAt.toDate() : new Date(0)
          return aDate - bDate
        })

        const limitedCards = dueCards.slice(0, 50)

        setReviewCards(limitedCards)
        setCurrentIndex(0)
        setShowTranslation(false)
      } catch (error) {
        console.error('Error loading review cards:', error)
        if (isSubscribed) {
          setReviewError('Unable to load review cards right now.')
          setReviewCards([])
        }
      } finally {
        if (isSubscribed) {
          setReviewLoading(false)
        }
      }
    }

    loadReviewCards()

    return () => {
      isSubscribed = false
    }
  }, [activeLanguage, user])

  const currentCard = reviewCards[currentIndex] || null

  const handleRevealTranslation = () => {
    setShowTranslation(true)
  }

  const handleReviewResponse = async (quality) => {
    if (!currentCard || !user || !activeLanguage) return

    try {
      await updateVocabSRS(user.uid, activeLanguage, currentCard.text, quality)

      const updatedCards = reviewCards.filter((_, idx) => idx !== currentIndex)
      const nextIndex = currentIndex >= updatedCards.length ? 0 : currentIndex
      setReviewCards(updatedCards)
      setCurrentIndex(nextIndex)
      setShowTranslation(false)
    } catch (error) {
      console.error('Failed to update review card:', error)
      setReviewError('Unable to update card. Please try again.')
    }
  }

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Review</h1>
            <p className="muted small">Spaced repetition for your vocab.</p>
          </div>
          <button className="button ghost" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>

        {!hasLanguages ? (
          <p className="muted">Add a language first to review vocab.</p>
        ) : !activeLanguage ? (
          <p className="muted">Select a language to review vocab.</p>
        ) : reviewLoading ? (
          <p className="muted">Loading review cards...</p>
        ) : reviewError ? (
          <p className="error">{reviewError}</p>
        ) : reviewCards.length === 0 ? (
          <p className="muted">No cards due today.</p>
        ) : (
          <div className="review-card">
            <div className="section-header">
              <p className="muted small">
                {reviewCards.length} card{reviewCards.length === 1 ? '' : 's'} due
              </p>
            </div>
            <div className="review-word">
              <h2>{currentCard?.text}</h2>
            </div>
            {!showTranslation ? (
              <button className="button" onClick={handleRevealTranslation}>
                Show translation
              </button>
            ) : (
              <div className="review-actions">
                <p className="muted small">{currentCard?.translation || 'No translation provided.'}</p>
                <div className="action-row">
                  <button className="button ghost" onClick={() => handleReviewResponse('again')}>
                    Again
                  </button>
                  <button className="button ghost" onClick={() => handleReviewResponse('good')}>
                    Good
                  </button>
                  <button className="button" onClick={() => handleReviewResponse('easy')}>
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
