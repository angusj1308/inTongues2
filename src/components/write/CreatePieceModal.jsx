import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { TEXT_TYPES, createWritingPiece } from '../../services/writing'

const CreatePieceModal = ({ activeLanguage, onClose, onCreated }) => {
  const { user } = useAuth()
  const [selectedType, setSelectedType] = useState('')
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!selectedType) {
      setError('Please select a text type')
      return
    }

    if (!user) {
      setError('You must be logged in')
      return
    }

    setCreating(true)
    setError('')

    try {
      const newPiece = await createWritingPiece(
        user.uid,
        activeLanguage,
        selectedType,
        title
      )
      onCreated(newPiece)
    } catch (err) {
      console.error('Failed to create piece:', err)
      setError('Failed to create piece. Please try again.')
      setCreating(false)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-piece-title"
    >
      <div className="modal-content create-piece-modal">
        <div className="modal-header">
          <h2 id="create-piece-title">Create New Piece</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">What would you like to write?</label>
            <div className="text-type-grid">
              {TEXT_TYPES.map((type) => (
                <button
                  key={type.id}
                  className={`text-type-option ${selectedType === type.id ? 'selected' : ''}`}
                  onClick={() => setSelectedType(type.id)}
                  type="button"
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="piece-title">
              Title (optional)
            </label>
            <input
              id="piece-title"
              type="text"
              className="form-input"
              placeholder={selectedType ? `Untitled ${TEXT_TYPES.find(t => t.id === selectedType)?.label || ''} - ${new Date().toLocaleDateString()}` : 'Enter a title...'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {error && <p className="error small">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="button ghost" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleCreate}
            disabled={creating || !selectedType}
          >
            {creating ? 'Creating...' : 'Create & Start Writing'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreatePieceModal
