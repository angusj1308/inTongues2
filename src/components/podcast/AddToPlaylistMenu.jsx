import { useEffect, useRef, useState } from 'react'
import { addEpisodeToPlaylist, createPlaylist } from '../../services/podcast'

const AddToPlaylistMenu = ({ uid, episode, playlists = [], onClose }) => {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleAdd = async (playlistId) => {
    if (!uid || !episode?.id || busy) return
    setBusy(true)
    try {
      await addEpisodeToPlaylist(uid, playlistId, episode.id)
      onClose?.()
    } finally {
      setBusy(false)
    }
  }

  const handleCreateAndAdd = async (event) => {
    event.preventDefault()
    if (!uid || !newName.trim() || !episode?.id || busy) return
    setBusy(true)
    try {
      const id = await createPlaylist(uid, { name: newName })
      if (id) await addEpisodeToPlaylist(uid, id, episode.id)
      onClose?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="podcast-menu" role="menu">
      <p className="podcast-menu-heading">Add to playlist</p>
      {playlists.length === 0 && !creating && (
        <p className="podcast-menu-empty">No playlists yet.</p>
      )}
      {!creating && (
        <ul className="podcast-menu-list">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                className="podcast-menu-item"
                onClick={() => handleAdd(playlist.id)}
                disabled={busy}
              >
                {playlist.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <form className="podcast-menu-form" onSubmit={handleCreateAndAdd}>
          <input
            type="text"
            className="podcast-modal-input"
            placeholder="Playlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            maxLength={120}
          />
          <div className="podcast-menu-form-actions">
            <button
              type="button"
              className="podcast-text-button ui-text"
              onClick={() => setCreating(false)}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="submit"
              className="podcast-secondary-button ui-text"
              disabled={busy || !newName.trim()}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="podcast-menu-item podcast-menu-item-create"
          onClick={() => setCreating(true)}
          disabled={busy}
        >
          + New playlist
        </button>
      )}
    </div>
  )
}

export default AddToPlaylistMenu
