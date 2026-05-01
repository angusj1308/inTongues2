import { useEffect, useRef, useState } from 'react'
import { createPlaylist } from '../../services/podcast'

const NewPlaylistModal = ({ uid, open, onClose, onCreated }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!uid || !name.trim()) {
      setError('Give your playlist a name.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const id = await createPlaylist(uid, { name, description })
      onCreated?.(id)
      onClose?.()
    } catch (err) {
      console.error(err)
      setError('Could not create playlist.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="media-modal-backdrop" onClick={onClose}>
      <div
        className="media-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-new-playlist-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="media-new-playlist-title" className="media-modal-title">
          New Playlist
        </h2>
        <form className="media-modal-form" onSubmit={handleSubmit}>
          <label className="media-modal-field">
            <span className="media-modal-field-label">Name</span>
            <input
              ref={inputRef}
              type="text"
              className="media-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My listening list"
              maxLength={120}
            />
          </label>
          <label className="media-modal-field">
            <span className="media-modal-field-label">Description (optional)</span>
            <textarea
              className="media-modal-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </label>
          {error && <p className="media-modal-error ui-text">{error}</p>}
          <div className="media-modal-actions">
            <button
              type="button"
              className="media-text-button ui-text"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="media-primary-button ui-text"
              disabled={submitting || !name.trim()}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewPlaylistModal
