import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  TEXT_TYPES,
  groupPiecesByType,
  subscribeToWritingPieces,
} from '../../services/writing'
import { subscribeToPracticeLessons, deletePracticeLesson } from '../../services/practice'
import { subscribeToFreeWritingLessons, deleteFreeWritingLesson } from '../../services/freewriting'
import NewWritingModal from './NewWritingModal'
import WritingPieceCard from './WritingPieceCard'
import PracticeLessonCard from './PracticeLessonCard'
import FreeWritingCard from './FreeWritingCard'

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

const PracticeShelf = ({ lessons, onLessonClick, onLessonDelete }) => {
  if (!lessons?.length) return null

  return (
    <section className="read-section read-slab">
      <div className="read-section-header">
        <h3>Translation Practice</h3>
      </div>
      <div className="writing-grid">
        {lessons.map((lesson) => (
          <PracticeLessonCard
            key={lesson.id}
            lesson={lesson}
            onClick={() => onLessonClick(lesson)}
            onDelete={onLessonDelete}
          />
        ))}
      </div>
    </section>
  )
}

const WritingHub = ({ activeLanguage, subPage }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pieces, setPieces] = useState([])
  const [practiceLessons, setPracticeLessons] = useState([])
  const [freeWritingLessons, setFreeWritingLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [practiceLoading, setPracticeLoading] = useState(true)
  const [freeWritingLoading, setFreeWritingLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMode, setModalMode] = useState(null)

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

  useEffect(() => {
    if (!user || !activeLanguage) {
      setFreeWritingLessons([])
      setFreeWritingLoading(false)
      return undefined
    }

    setFreeWritingLoading(true)

    const unsubscribe = subscribeToFreeWritingLessons(
      user.uid,
      activeLanguage,
      (nextLessons) => {
        setFreeWritingLessons(nextLessons)
        setFreeWritingLoading(false)
      },
      (err) => {
        console.error('Free writing load error:', err)
        setFreeWritingLoading(false)
      }
    )

    return unsubscribe
  }, [activeLanguage, user])

  const handleOpenPiece = (piece) => {
    if (piece.id?.startsWith('placeholder')) return
    if (!piece?.id) return
    navigate(`/write/${piece.id}`)
  }

  const handleOpenLesson = (lesson) => {
    if (lesson.id?.startsWith('placeholder')) return
    if (!lesson?.id) return
    navigate(`/practice/${lesson.id}`)
  }

  const handleOpenFreeWriting = (lesson) => {
    if (lesson.id?.startsWith('placeholder')) return
    if (!lesson?.id) return
    navigate(`/freewrite/${lesson.id}`)
  }

  const handleDeleteLesson = async (lessonId) => {
    if (!user || !lessonId || lessonId.startsWith('placeholder')) return
    try {
      await deletePracticeLesson(user.uid, lessonId)
    } catch (err) {
      console.error('Failed to delete lesson:', err)
    }
  }

  const handleDeleteFreeWriting = async (lessonId) => {
    if (!user || !lessonId || lessonId.startsWith('placeholder')) return
    try {
      await deleteFreeWritingLesson(user.uid, lessonId)
    } catch (err) {
      console.error('Failed to delete free writing:', err)
    }
  }

  const handleCreated = (item, type, options = {}) => {
    setModalMode(null)
    if (options.stayOnDashboard) {
      return
    }
    if (type === 'free') {
      navigate(`/freewrite/${item.id}`)
    } else {
      navigate(`/practice/${item.id}`)
    }
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

  if (loading && practiceLoading && freeWritingLoading) {
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
  const hasFreeWriting = freeWritingLessons.length > 0
  const hasAnything = hasPieces || hasLessons || hasFreeWriting
  const groupedPieces = groupPiecesByType(pieces)

  if (subPage === 'compose') {
    return (
      <div className="writing-hub compose-landing">
        <div className="discover-doors discover-doors--landing">
          <button className="discover-door discover-door--landing" onClick={() => setModalMode('practice')}>
            <h2 className="discover-door-label">Practice</h2>
            <span className="discover-door-rule" aria-hidden="true" />
            <p className="discover-door-description">Provide text in your native language and practice expressing yourself in your target language.</p>
          </button>

          <button className="discover-door discover-door--landing" onClick={() => setModalMode('free')}>
            <h2 className="discover-door-label">Free Write</h2>
            <span className="discover-door-rule" aria-hidden="true" />
            <p className="discover-door-description">Write freely and receive feedback on your grammar, vocabulary and fluency.</p>
          </button>
        </div>

        {modalMode && (
          <NewWritingModal
            activeLanguage={activeLanguage}
            initialMode={modalMode}
            onClose={() => setModalMode(null)}
            onCreated={handleCreated}
          />
        )}
      </div>
    )
  }

  return (
    <div className="writing-hub">
      {!hasAnything && (
        <div className="writing-empty-state">
          <p className="muted">Nothing in your notebook yet.</p>
          <p className="muted small">
            Head to <Link to="/write/compose" className="writing-empty-link">Compose</Link> to write your first piece.
          </p>
        </div>
      )}

      {hasFreeWriting && (
        <section className="read-section read-slab">
          <div className="read-section-header">
            <h3>Free Writing</h3>
          </div>
          <div className="writing-grid">
            {freeWritingLessons.map((lesson) => (
              <FreeWritingCard
                key={lesson.id}
                lesson={lesson}
                onClick={() => handleOpenFreeWriting(lesson)}
                onDelete={handleDeleteFreeWriting}
              />
            ))}
          </div>
        </section>
      )}

      {hasLessons && (
        <PracticeShelf
          lessons={practiceLessons}
          onLessonClick={handleOpenLesson}
          onLessonDelete={handleDeleteLesson}
        />
      )}

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
    </div>
  )
}

export default WritingHub
