import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  TEXT_TYPES,
  groupPiecesByType,
  subscribeToWritingPieces,
} from '../../services/writing'
import { subscribeToPracticeLessons } from '../../services/practice'
import NewWritingModal from './NewWritingModal'
import WritingPieceCard from './WritingPieceCard'
import PracticeLessonCard from './PracticeLessonCard'

// Placeholder data for design preview
const PLACEHOLDER_PIECES = [
  {
    id: 'placeholder-1',
    type: 'journal',
    title: 'Mi primer día en Madrid',
    content: 'Hoy llegué a Madrid por primera vez. La ciudad es increíble, con sus calles llenas de vida y la arquitectura impresionante...',
    status: 'draft',
    wordCount: 342,
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 2) },
    updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 30) },
  },
  {
    id: 'placeholder-2',
    type: 'journal',
    title: 'Reflexiones sobre el idioma',
    content: 'Después de tres meses estudiando español, me doy cuenta de cuánto he aprendido. Las conversaciones fluyen mejor...',
    status: 'complete',
    wordCount: 567,
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 3) },
    updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24) },
  },
  {
    id: 'placeholder-3',
    type: 'essay',
    title: 'El impacto de la tecnología',
    content: 'La tecnología ha transformado nuestra manera de comunicarnos. En este ensayo, exploraré cómo los dispositivos móviles...',
    status: 'submitted',
    wordCount: 892,
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 5) },
    updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 2) },
  },
  {
    id: 'placeholder-4',
    type: 'short-story',
    title: 'El viajero del tiempo',
    content: 'María encontró el reloj antiguo en el ático de su abuela. No sabía que al darle cuerda, su vida cambiaría para siempre...',
    status: 'draft',
    wordCount: 1243,
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
    updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 5) },
  },
  {
    id: 'placeholder-5',
    type: 'reflection',
    title: 'Lo que aprendí hoy',
    content: 'Hoy descubrí una nueva expresión: "estar en las nubes". Me encanta cómo el español usa metáforas tan visuales...',
    status: 'complete',
    wordCount: 234,
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24) },
    updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 20) },
  },
  {
    id: 'placeholder-6',
    type: 'poetry',
    title: 'Atardecer en Barcelona',
    content: 'El sol se esconde tras las montañas,\npintando el cielo de naranja y oro.\nLa ciudad descansa, las calles susurran...',
    status: 'complete',
    wordCount: 89,
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 10) },
    updatedAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 8) },
  },
]

const PLACEHOLDER_LESSONS = [
  {
    id: 'placeholder-lesson-1',
    title: 'TED Talk: The power of introverts',
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
    adaptationLevel: 'intermediate',
    status: 'in_progress',
    completedCount: 12,
    sentences: Array(24).fill({ status: 'pending' }),
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 2) },
  },
  {
    id: 'placeholder-lesson-2',
    title: 'Article: Climate change solutions',
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
    adaptationLevel: 'native',
    status: 'complete',
    completedCount: 18,
    sentences: Array(18).fill({ status: 'finalized' }),
    createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60 * 24 * 6) },
  },
]

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
        <h3>Translation Practice</h3>
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
  const [showModal, setShowModal] = useState(false)

  // For design preview - set to true to see placeholders
  const SHOW_PLACEHOLDERS = true

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
    if (piece.id?.startsWith('placeholder')) return // Don't navigate for placeholders
    if (!piece?.id) return
    navigate(`/write/${piece.id}`)
  }

  const handleOpenLesson = (lesson) => {
    if (lesson.id?.startsWith('placeholder')) return // Don't navigate for placeholders
    if (!lesson?.id) return
    navigate(`/practice/${lesson.id}`)
  }

  const handleCreated = (item, type) => {
    setShowModal(false)
    if (type === 'free') {
      navigate(`/write/${item.id}`)
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

  if (loading && practiceLoading && !SHOW_PLACEHOLDERS) {
    return (
      <div className="writing-hub">
        <p className="muted small">Loading your writing...</p>
      </div>
    )
  }

  if (error && !SHOW_PLACEHOLDERS) {
    return (
      <div className="writing-hub">
        <p className="error small">{error}</p>
      </div>
    )
  }

  // Combine real data with placeholders for design preview
  const displayPieces = SHOW_PLACEHOLDERS ? [...pieces, ...PLACEHOLDER_PIECES] : pieces
  const displayLessons = SHOW_PLACEHOLDERS ? [...practiceLessons, ...PLACEHOLDER_LESSONS] : practiceLessons

  const hasPieces = displayPieces.length > 0
  const hasLessons = displayLessons.length > 0
  const groupedPieces = groupPiecesByType(displayPieces)

  return (
    <div className="writing-hub">
      {/* Header with + New button */}
      <section className="read-section read-slab">
        <div className="read-section-header">
          <h3>Your Writing</h3>
          <button className="button primary small" onClick={() => setShowModal(true)}>
            + New
          </button>
        </div>
        {!hasPieces && !hasLessons && (
          <p className="muted small">
            Start writing to practice your {activeLanguage}.
          </p>
        )}
      </section>

      {/* Practice Lessons */}
      {hasLessons && (
        <PracticeShelf
          lessons={displayLessons}
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

      {showModal && (
        <NewWritingModal
          activeLanguage={activeLanguage}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

export default WritingHub
