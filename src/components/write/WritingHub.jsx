import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  TEXT_TYPES,
  subscribeToWritingPieces,
} from '../../services/writing'
import { subscribeToPracticeLessons } from '../../services/practice'
import { subscribeToFreeWritingLessons } from '../../services/freewriting'
import NewWritingModal from './NewWritingModal'

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

const getTypeLabel = (item) => {
  if (item.kind === 'free') return 'Free Write'
  if (item.kind === 'practice') return 'Practice'
  const match = TEXT_TYPES.find((t) => t.id === item.type)
  return match?.label || 'Writing'
}

const getWordInfo = (item) => {
  if (item.kind === 'practice') {
    const total = item.sentences?.length || 0
    return total ? `${total} sentences` : ''
  }
  const count = item.wordCount || 0
  return count ? `${count} words` : ''
}

const getTimestamp = (item) => {
  const ts = item.createdAt
  if (!ts) return 0
  if (typeof ts.toDate === 'function') return ts.toDate().getTime()
  if (ts instanceof Date) return ts.getTime()
  return 0
}

const WritingHub = ({ activeLanguage }) => {
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

  const allItems = useMemo(() => {
    const tagged = [
      ...pieces.map((p) => ({ ...p, kind: 'piece' })),
      ...practiceLessons.map((l) => ({ ...l, kind: 'practice' })),
      ...freeWritingLessons.map((l) => ({ ...l, kind: 'free' })),
    ]
    tagged.sort((a, b) => getTimestamp(b) - getTimestamp(a))
    return tagged
  }, [pieces, practiceLessons, freeWritingLessons])

  const handleOpen = (item) => {
    if (!item?.id) return
    if (item.kind === 'free') navigate(`/freewrite/${item.id}`)
    else if (item.kind === 'practice') navigate(`/practice/${item.id}`)
    else navigate(`/write/${item.id}`)
  }

  const handleCreated = (item, type, options = {}) => {
    setModalMode(null)
    if (options.stayOnDashboard) return
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

  return (
    <div className="writing-hub compose-landing">
      <nav className="read-sub-nav" aria-label="Write sections" style={{ display: 'flex', justifyContent: 'center' }}>
        <span className="read-sub-nav-item is-active">Notebook</span>
      </nav>

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

      <section className="notebook-section">
        {allItems.length === 0 ? (
          <p className="muted small notebook-empty">Your work will appear here once you start writing.</p>
        ) : (
          <ul className="notebook-list">
            {allItems.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="notebook-row" onClick={() => handleOpen(item)}>
                <span className="notebook-title">{item.title || 'Untitled'}</span>
                <span className="notebook-type">{getTypeLabel(item)}</span>
                <span className="notebook-meta">{getWordInfo(item)}</span>
                <span className="notebook-edit" aria-label="Edit">
                  <PencilIcon />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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

export default WritingHub
