import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  TEXT_TYPES,
  groupPiecesByType,
  subscribeToWritingPieces,
} from '../../services/writing'
import { subscribeToPracticeLessons } from '../../services/practice'
import CreatePieceModal from './CreatePieceModal'
import ImportPracticeModal from './ImportPracticeModal'
import WritingPieceCard from './WritingPieceCard'
import PracticeLessonCard from './PracticeLessonCard'

// Icons
const PenIcon = () => (
  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

const TranslateIcon = () => (
  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 8l6 6" />
    <path d="M4 14l6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2v3" />
    <path d="M22 22l-5-10-5 10" />
    <path d="M14 18h6" />
  </svg>
)

const WritingShelf = ({ title, pieces, onPieceClick }) => {
  if (!pieces?.length) return null

  return (
    <section className="read-section read-slab">
      <div className="read-section-header">
        <h3>{title}</h3>
      </div>
      <div className="writing-grid">
        {pieces.map((piece) => (
          <WritingPieceCard
            key={piece.id}
            piece={piece}
            onClick={() => onPieceClick(piece)}
          />
        ))}
      </div>
    </section>
  )
}

const PracticeShelf = ({ lessons, onLessonClick }) => {
  if (!lessons?.length) return null

  return (
    <section className="read-section read-slab">
      <div className="read-section-header">
        <h3>Practice Lessons</h3>
      </div>
      <div className="writing-grid">
        {lessons.map((lesson) => (
          <PracticeLessonCard
            key={lesson.id}
            lesson={lesson}
            onClick={() => onLessonClick(lesson)}
          />
        ))}
      </div>
    </section>
  )
}

const WritingHub = ({ activeLanguage }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pieces, setPieces] = useState([])
  const [practiceLessons, setPracticeLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [practiceLoading, setPracticeLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPracticeModal, setShowPracticeModal] = useState(false)

  // Load writing pieces
  useEffect(() => {
    if (!user || !activeLanguage) {
      setPieces([])
      setLoading(false)
      return undefined
    }

    setError('')
    setLoading(true)

    const unsubscribe = subscribeToWritingPieces(
      user.uid,
      activeLanguage,
      (nextPieces) => {
        setPieces(nextPieces)
        setLoading(false)
      },
      (err) => {
        console.error('Writing load error:', err)
        setError('Unable to load your writing pieces.')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [activeLanguage, user])

  // Load practice lessons
  useEffect(() => {
    if (!user || !activeLanguage) {
      setPracticeLessons([])
      setPracticeLoading(false)
      return undefined
    }

    setPracticeLoading(true)

    const unsubscribe = subscribeToPracticeLessons(
      user.uid,
      activeLanguage,
      (nextLessons) => {
        setPracticeLessons(nextLessons)
        setPracticeLoading(false)
      },
      (err) => {
        console.error('Practice load error:', err)
        setPracticeLoading(false)
      }
    )

    return unsubscribe
  }, [activeLanguage, user])

  const handleOpenPiece = (piece) => {
    if (!piece?.id) return
    navigate(`/write/${piece.id}`)
  }

  const handleOpenLesson = (lesson) => {
    if (!lesson?.id) return
    navigate(`/practice/${lesson.id}`)
  }

  const handleCreateNew = () => {
    setShowCreateModal(true)
  }

  const handleStartPractice = () => {
    setShowPracticeModal(true)
  }

  const handleCloseModal = () => {
    setShowCreateModal(false)
  }

  const handleClosePracticeModal = () => {
    setShowPracticeModal(false)
  }

  const handlePieceCreated = (newPiece) => {
    setShowCreateModal(false)
    navigate(`/write/${newPiece.id}`)
  }

  const handleLessonCreated = (newLesson) => {
    setShowPracticeModal(false)
    navigate(`/practice/${newLesson.id}`)
  }

  if (!activeLanguage) {
    return (
      <div className="writing-hub">
        <p className="muted small" style={{ marginTop: '0.75rem' }}>
          Add a language to unlock your writing tools.
        </p>
      </div>
    )
  }

  if (loading && practiceLoading) {
    return (
      <div className="writing-hub">
        <p className="muted small">Loading your writing...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="writing-hub">
        <p className="error small">{error}</p>
      </div>
    )
  }

  const hasPieces = pieces.length > 0
  const hasLessons = practiceLessons.length > 0
  const hasContent = hasPieces || hasLessons
  const groupedPieces = groupPiecesByType(pieces)

  return (
    <div className="writing-hub">
      {/* Mode Selection Cards */}
      <section className="read-section read-slab">
        <div className="writing-mode-cards">
          <div
            className="writing-mode-card"
            role="button"
            tabIndex={0}
            onClick={handleCreateNew}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
          >
            <div className="writing-mode-card-icon">
              <PenIcon />
            </div>
            <div className="writing-mode-card-content">
              <h3>Free Writing</h3>
              <p className="muted small">
                Write journals, essays, stories in {activeLanguage}. Get AI feedback on grammar and style.
              </p>
            </div>
            <button className="button ghost" onClick={(e) => { e.stopPropagation(); handleCreateNew(); }}>
              + New Piece
            </button>
          </div>

          <div
            className="writing-mode-card"
            role="button"
            tabIndex={0}
            onClick={handleStartPractice}
            onKeyDown={(e) => e.key === 'Enter' && handleStartPractice()}
          >
            <div className="writing-mode-card-icon">
              <TranslateIcon />
            </div>
            <div className="writing-mode-card-content">
              <h3>Practice Mode</h3>
              <p className="muted small">
                Import content in your native language and practice expressing it in {activeLanguage}.
              </p>
            </div>
            <button className="button ghost" onClick={(e) => { e.stopPropagation(); handleStartPractice(); }}>
              + New Lesson
            </button>
          </div>
        </div>
      </section>

      {/* Practice Lessons */}
      {hasLessons && (
        <PracticeShelf
          lessons={practiceLessons}
          onLessonClick={handleOpenLesson}
        />
      )}

      {/* Writing Pieces by Type */}
      {hasPieces && (
        <>
          {TEXT_TYPES.map((type) => (
            <WritingShelf
              key={type.id}
              title={type.label + 's'}
              pieces={groupedPieces[type.id]}
              onPieceClick={handleOpenPiece}
            />
          ))}
        </>
      )}

      {/* Empty state message if no content */}
      {!hasContent && (
        <div className="writing-empty-hint">
          <p className="muted small">
            Choose a mode above to start practicing your {activeLanguage} writing skills.
          </p>
        </div>
      )}

      {showCreateModal && (
        <CreatePieceModal
          activeLanguage={activeLanguage}
          onClose={handleCloseModal}
          onCreated={handlePieceCreated}
        />
      )}

      {showPracticeModal && (
        <ImportPracticeModal
          activeLanguage={activeLanguage}
          onClose={handleClosePracticeModal}
          onCreated={handleLessonCreated}
        />
      )}
    </div>
  )
}

export default WritingHub
