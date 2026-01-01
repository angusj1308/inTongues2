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
  const groupedPieces = groupPiecesByType(pieces)

  return (
    <div className="writing-hub">
      {/* New Actions */}
      <section className="read-section read-slab">
        <div className="read-section-header">
          <h3>Start Writing</h3>
        </div>
        <div className="write-actions">
          <button
            className="write-action-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <span className="write-action-title">New Piece</span>
            <span className="write-action-desc">Write freely in {activeLanguage}</span>
          </button>
          <button
            className="write-action-btn"
            onClick={() => setShowPracticeModal(true)}
          >
            <span className="write-action-title">Translation Practice</span>
            <span className="write-action-desc">Express ideas from your native language</span>
          </button>
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

      {showCreateModal && (
        <CreatePieceModal
          activeLanguage={activeLanguage}
          onClose={() => setShowCreateModal(false)}
          onCreated={handlePieceCreated}
        />
      )}

      {showPracticeModal && (
        <ImportPracticeModal
          activeLanguage={activeLanguage}
          onClose={() => setShowPracticeModal(false)}
          onCreated={handleLessonCreated}
        />
      )}
    </div>
  )
}

export default WritingHub
