import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'

const stripArticles = (s) =>
  (s || '').replace(/^(the|a|an|el|la|los|las|le|les|der|die|das|il|i|lo|gli|le|une|un|el)\s+/i, '').trim()

export default function NewShelfBuilder({
  items,
  activeLanguage,
  userId,
  getStoryTitle,
  getPageCount,
  editingShelf = null,
}) {
  const navigate = useNavigate()
  const isEditing = !!editingShelf

  const [name, setName] = useState(editingShelf?.name || '')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(
    () => new Set(editingShelf?.bookIds || []),
  )
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')

  // If the editingShelf prop arrives later (snapshot loads after mount),
  // sync state to it once.
  const [hydrated, setHydrated] = useState(!!editingShelf)
  useEffect(() => {
    if (editingShelf && !hydrated) {
      setName(editingShelf.name || '')
      setSelected(new Set(editingShelf.bookIds || []))
      setHydrated(true)
    }
  }, [editingShelf, hydrated])

  const trimmedName = name.trim()
  const canSave = trimmedName !== '' && selected.size > 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((b) => {
      const title = (getStoryTitle(b) || '').toLowerCase()
      const author = (b.author || '').toLowerCase()
      return title.includes(q) || author.includes(q)
    })
  }, [items, query, getStoryTitle])

  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const at = stripArticles(getStoryTitle(a)).toLowerCase()
      const bt = stripArticles(getStoryTitle(b)).toLowerCase()
      return at.localeCompare(bt)
    })
    const map = new Map()
    for (const book of sorted) {
      const title = stripArticles(getStoryTitle(book))
      const letter = (title[0] || '#').toUpperCase()
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter).push(book)
    }
    return Array.from(map.entries())
  }, [filtered, getStoryTitle])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!canSave || !userId || saving) return
    setSaving(true)
    setSaveError('')
    try {
      if (isEditing && editingShelf?.id) {
        await updateDoc(doc(db, 'users', userId, 'bookshelves', editingShelf.id), {
          name: trimmedName,
          bookIds: Array.from(selected),
          updatedAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, 'users', userId, 'bookshelves'), {
          name: trimmedName,
          bookIds: Array.from(selected),
          language: activeLanguage,
          createdAt: serverTimestamp(),
        })
      }
      navigate('/read/library')
    } catch (err) {
      console.error('Failed to save shelf:', err)
      setSaveError('Could not save the shelf. Please try again.')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEditing || !userId || !editingShelf?.id || deleting) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'users', userId, 'bookshelves', editingShelf.id))
      navigate('/read/library')
    } catch (err) {
      console.error('Failed to delete shelf:', err)
      setSaveError('Could not delete the shelf. Please try again.')
      setDeleting(false)
      setShowDelete(false)
    }
  }

  return (
    <div className="new-shelf-page">
      <div className="new-shelf-orientation">
        <button
          type="button"
          className="new-shelf-back"
          onClick={() => navigate('/read/library')}
          aria-label="Back to library"
        >
          ←
        </button>
        <h1 className="new-shelf-page-title">
          {isEditing ? 'Edit Shelf' : 'New Shelf'}
        </h1>
      </div>
      <header className="new-shelf-identity">
        <div className="new-shelf-name-row">
          <input
            className="new-shelf-name-input"
            type="text"
            placeholder="Name this shelf…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="new-shelf-save-btn"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Save Shelf →'}
          </button>
        </div>
        {saveError && <p className="new-shelf-error">{saveError}</p>}
      </header>

      <div className="new-shelf-search">
        <input
          type="text"
          placeholder="Search your library…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="new-shelf-list">
        {groups.length === 0 ? (
          <p className="new-shelf-empty">No matches</p>
        ) : (
          groups.map(([letter, books]) => (
            <section key={letter} className="new-shelf-group">
              <h3 className="new-shelf-group-letter">{letter}</h3>
              <div className="new-shelf-group-rule" aria-hidden="true" />
              {books.map((book) => {
                const isSelected = selected.has(book.id)
                const pages = getPageCount(book)
                const subParts = []
                if (book.author) subParts.push(book.author)
                if (book.level) subParts.push(book.level)
                if (pages) subParts.push(`${pages} pages`)
                return (
                  <div
                    key={book.id}
                    className={`new-shelf-row${isSelected ? ' is-selected' : ''}`}
                  >
                    <div className="new-shelf-row-meta">
                      <p className="new-shelf-row-title">{getStoryTitle(book)}</p>
                      {subParts.length > 0 && (
                        <p className="new-shelf-row-sub">{subParts.join(' · ')}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`new-shelf-toggle${isSelected ? ' is-on' : ''}`}
                      onClick={() => toggle(book.id)}
                      aria-pressed={isSelected}
                      aria-label={
                        isSelected
                          ? `Remove ${getStoryTitle(book)} from shelf`
                          : `Add ${getStoryTitle(book)} to shelf`
                      }
                    >
                      {isSelected ? '✓' : '+'}
                    </button>
                  </div>
                )
              })}
            </section>
          ))
        )}
      </div>

      {isEditing && (
        <footer className="new-shelf-footer">
          <button
            type="button"
            className="new-shelf-delete-btn"
            onClick={() => setShowDelete(true)}
          >
            Delete Shelf
          </button>
          {showDelete && (
            <div className="new-shelf-discard new-shelf-delete-confirm" role="alertdialog">
              <span>Delete this shelf? This cannot be undone.</span>
              <button
                type="button"
                className="new-shelf-discard-confirm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                className="new-shelf-discard-keep"
                onClick={() => setShowDelete(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </footer>
      )}
    </div>
  )
}
