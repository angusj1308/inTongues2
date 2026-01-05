import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import GenerateNovelPanel from '../components/novel/GenerateNovelPanel'
import BibleReview from '../components/novel/BibleReview'
import ChapterGenerator from '../components/novel/ChapterGenerator'
import { getBook } from '../services/novelGenerator'

// Flow steps
const STEPS = {
  SETUP: 'setup',
  REVIEW: 'review',
  GENERATE: 'generate',
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
  useEffect(() => {
    const loadBook = async () => {
      if (!urlBookId || !user?.uid) return

      setLoading(true)
      setError('')

      try {
        const book = await getBook(user.uid, urlBookId)
        setBookId(urlBookId)
        setBookData(book)
        setBible(book.bible)

        // Determine which step to show based on book status
        if (book.status === 'bible_complete' || book.status === 'bible_needs_review') {
          // Check if any chapters have been generated
          if (book.chapters?.some((c) => c.status === 'complete')) {
            setStep(STEPS.GENERATE)
          } else {
            setStep(STEPS.REVIEW)
          }
        } else if (book.status === 'chapters_in_progress' || book.status === 'complete') {
          setStep(STEPS.GENERATE)
        }
      } catch (err) {
        setError(err.message || 'Failed to load book')
        setStep(STEPS.SETUP)
      } finally {
        setLoading(false)
      }
    }

    loadBook()
  }, [urlBookId, user?.uid])

  // Handle bible generation complete
  const handleBibleGenerated = (result) => {
    setBookId(result.bookId)
    setBookData({
      concept: result.bible?.phase1?.concept,
      language: result.bible?.phase1?.language,
      level: result.level,
      lengthPreset: result.lengthPreset,
      chapterCount: result.chapterCount,
      status: result.status,
    })
    setBible(result.bible)
    setStep(STEPS.REVIEW)

    // Update URL to include bookId
    navigate(`/novel/${result.bookId}`, { replace: true })
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

  return (
    <div className="page">
      <div className="card dashboard-card novel-generator-page">
        {/* Step Indicator */}
        <div className="step-indicator">
          <div className={`step ${step === STEPS.SETUP ? 'active' : step !== STEPS.SETUP ? 'complete' : ''}`}>
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
        </div>

        {/* Step Content */}
        {step === STEPS.SETUP && (
          <GenerateNovelPanel
            onBibleGenerated={handleBibleGenerated}
            onCancel={handleCancel}
          />
        )}

        {step === STEPS.REVIEW && bible && (
          <BibleReview
            bible={bible}
            bookId={bookId}
            bookData={bookData}
            onApprove={handleApprove}
            onBack={handleBackToSetup}
          />
        )}

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
