import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import GenerateNovelPanel from '../components/novel/GenerateNovelPanel'
// BibleReview and ChapterGenerator kept for admin/QA access but not in normal user flow
import BibleReview from '../components/novel/BibleReview'
import ChapterGenerator from '../components/novel/ChapterGenerator'
import { getBook } from '../services/novelGenerator'

// Flow steps - simplified for users (they only see SETUP, then go straight to reader)
// REVIEW and GENERATE kept for admin/QA access via URL params
const STEPS = {
  SETUP: 'setup',
  REVIEW: 'review',      // Admin only - accessed via ?mode=review
  GENERATE: 'generate',  // Admin only - accessed via ?mode=generate
}

const NovelGenerator = () => {
  const navigate = useNavigate()
  const { bookId: urlBookId } = useParams()
  const { user } = useAuth()

  const [step, setStep] = useState(STEPS.SETUP)
  const [bookId, setBookId] = useState(urlBookId || null)
  const [bookData, setBookData] = useState(null)
  const [bible, setBible] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load existing book if bookId is in URL
  // For normal users, redirect to reader if book has chapters
  // Admin can access review/generate via ?mode=review or ?mode=generate
  useEffect(() => {
    const loadBook = async () => {
      if (!urlBookId || !user?.uid) return

      // Check for admin mode in URL params
      const urlParams = new URLSearchParams(window.location.search)
      const adminMode = urlParams.get('mode')

      setLoading(true)
      setError('')

      try {
        const book = await getBook(user.uid, urlBookId)
        setBookId(urlBookId)
        setBookData(book)
        setBible(book.bible)

        // Admin mode: allow access to review/generate steps
        if (adminMode === 'review') {
          setStep(STEPS.REVIEW)
          setLoading(false)
          return
        }
        if (adminMode === 'generate') {
          setStep(STEPS.GENERATE)
          setLoading(false)
          return
        }

        // Normal user flow: if book has any chapters, go to reader
        if (book.status === 'in_progress' || book.status === 'complete' ||
            book.generatedChapterCount > 0) {
          navigate(`/reader/${urlBookId}`, { replace: true })
          return
        }

        // If bible is complete but no chapters, something went wrong
        // Stay on setup to let them try again or show error
        if (book.status === 'bible_complete' || book.status === 'bible_needs_review') {
          setError('Story outline was created but Chapter 1 failed to generate. Please try again.')
          setStep(STEPS.SETUP)
        }
      } catch (err) {
        setError(err.message || 'Failed to load book')
        setStep(STEPS.SETUP)
      } finally {
        setLoading(false)
      }
    }

    loadBook()
  }, [urlBookId, user?.uid, navigate])

  // Handle bible generation complete - go straight to reader
  const handleBibleGenerated = (result) => {
    // Bible + Chapter 1 are now generated, navigate directly to reader
    // User will see Chapter 1 and can generate subsequent chapters from there
    navigate(`/reader/${result.bookId}`)
  }

  // Handle approval of bible
  const handleApprove = () => {
    setStep(STEPS.GENERATE)
  }

  // Handle completion of all chapters
  const handleComplete = () => {
    // Navigate to reader with the completed novel
    navigate(`/reader/${bookId}`)
  }

  // Handle going back from review
  const handleBackToSetup = () => {
    setStep(STEPS.SETUP)
    setBookId(null)
    setBookData(null)
    setBible(null)
    navigate('/novel', { replace: true })
  }

  // Handle going back from chapter generator
  const handleBackToReview = () => {
    setStep(STEPS.REVIEW)
  }

  // Handle cancel
  const handleCancel = () => {
    navigate('/dashboard', { state: { initialTab: 'read' } })
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card dashboard-card">
          <div className="loading-state">
            <div className="progress-spinner" />
            <p>Loading novel...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !bookData) {
    return (
      <div className="page">
        <div className="card dashboard-card">
          <div className="error-state">
            <h2>Error</h2>
            <p className="error">{error}</p>
            <button className="button primary" onClick={() => navigate('/novel')}>
              Start Fresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Check if in admin mode
  const isAdminMode = step === STEPS.REVIEW || step === STEPS.GENERATE

  return (
    <div className="page">
      <div className="card dashboard-card novel-generator-page">
        {/* Step Indicator - simplified for normal users, full for admin */}
        {isAdminMode ? (
          // Admin mode: show all 3 steps
          <div className="step-indicator">
            <div className={`step ${step === STEPS.SETUP ? 'active' : 'complete'}`}>
              <span className="step-number">1</span>
              <span className="step-label">Setup</span>
            </div>
            <div className="step-connector" />
            <div className={`step ${step === STEPS.REVIEW ? 'active' : step === STEPS.GENERATE ? 'complete' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Review</span>
            </div>
            <div className="step-connector" />
            <div className={`step ${step === STEPS.GENERATE ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Generate</span>
            </div>
            <div className="admin-badge" style={{ marginLeft: '16px', fontSize: '12px', color: '#888' }}>
              (Admin Mode)
            </div>
          </div>
        ) : (
          // Normal user: simple single-step indicator
          <div className="step-indicator">
            <div className="step active">
              <span className="step-number">1</span>
              <span className="step-label">Create Your Story</span>
            </div>
          </div>
        )}

        {/* Step Content */}
        {step === STEPS.SETUP && (
          <GenerateNovelPanel
            onBibleGenerated={handleBibleGenerated}
            onCancel={handleCancel}
          />
        )}

        {/* Admin-only: Bible Review */}
        {step === STEPS.REVIEW && bible && (
          <BibleReview
            bible={bible}
            bookId={bookId}
            bookData={bookData}
            onApprove={handleApprove}
            onBack={handleBackToSetup}
          />
        )}

        {/* Admin-only: Chapter Generator */}
        {step === STEPS.GENERATE && bookId && (
          <ChapterGenerator
            bookId={bookId}
            uid={user?.uid}
            bible={bible}
            bookData={bookData}
            onComplete={handleComplete}
            onBack={handleBackToReview}
          />
        )}
      </div>
    </div>
  )
}

export default NovelGenerator
