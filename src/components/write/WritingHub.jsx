import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  TEXT_TYPES,
  groupPiecesByType,
  subscribeToWritingPieces,
} from '../../services/writing'
import CreatePieceModal from './CreatePieceModal'
import WritingPieceCard from './WritingPieceCard'

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

const WritingHub = ({ activeLanguage }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pieces, setPieces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

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

  const handleOpenPiece = (piece) => {
    if (!piece?.id) return
    navigate(`/write/${piece.id}`)
  }

  const handleCreateNew = () => {
    setShowCreateModal(true)
  }

  const handleCloseModal = () => {
    setShowCreateModal(false)
  }

  const handlePieceCreated = (newPiece) => {
    setShowCreateModal(false)
    navigate(`/write/${newPiece.id}`)
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

  if (loading) {
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
  const groupedPieces = groupPiecesByType(pieces)

  return (
    <div className="writing-hub">
      {!hasPieces ? (
        <div className="writing-empty-state">
          <div className="writing-empty-content">
            <h2>Start Writing</h2>
            <p className="muted">
              Practice your {activeLanguage} writing skills with journals, essays, stories, and more.
              Get AI-powered feedback to improve your grammar, vocabulary, and style.
            </p>
            <button className="button primary" onClick={handleCreateNew}>
              Create Your First Piece
            </button>
          </div>
        </div>
      ) : (
        <div className="writing-stack">
          <section className="read-section read-slab">
            <div className="writing-header">
              <h2>Your Writing</h2>
              <button className="button ghost" onClick={handleCreateNew}>
                + Create New Piece
              </button>
            </div>
          </section>

          {TEXT_TYPES.map((type) => (
            <WritingShelf
              key={type.id}
              title={type.label + 's'}
              pieces={groupedPieces[type.id]}
              onPieceClick={handleOpenPiece}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreatePieceModal
          activeLanguage={activeLanguage}
          onClose={handleCloseModal}
          onCreated={handlePieceCreated}
        />
      )}
    </div>
  )
}

export default WritingHub
