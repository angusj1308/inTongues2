import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'

const stripArticles = (s) =>
  (s || '').replace(/^(the|a|an|el|la|los|las|le|les|der|die|das|il|i|lo|gli|le|une|un|el)\s+/i, '').trim()

export default function NewShelfBuilder({ items, activeLanguage, userId, getStoryTitle, getPageCount }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)
  const [saveError, setSaveError] = useState('')

  const trimmedName = name.trim()
  const isDirty = trimmedName !== '' || selected.size > 0
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
      await addDoc(collection(db, 'users', userId, 'bookshelves'), {
        name: trimmedName,
        bookIds: Array.from(selected),
        language: activeLanguage,
        createdAt: serverTimestamp(),
      })
      navigate('/read/library')
    } catch (err) {
      console.error('Failed to save shelf:', err)
      setSaveError('Could not save the shelf. Please try again.')
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (isDirty) {
      setShowDiscard(true)
      return
    }
    navigate('/read/library')
  }

  return (
    <div className="new-shelf-page">
      <header className="new-shelf-identity">
        <p className="new-shelf-eyebrow">New Bookshelf</p>
        <input
          className="new-shelf-name-input"
          type="text"
          placeholder="Name this shelf…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="new-shelf-action-row">
          <span className="new-shelf-count">
            <strong>{selected.size}</strong> {selected.size === 1 ? 'book' : 'books'} on this shelf
          </span>
          <span className="new-shelf-action-divider" aria-hidden="true">|</span>
          <button
            type="button"
            className="new-shelf-save-btn"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Save Shelf →'}
          </button>
          <button
            type="button"
            className="new-shelf-cancel-btn"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
        {saveError && <p className="new-shelf-error">{saveError}</p>}
        {showDiscard && (
          <div className="new-shelf-discard" role="alertdialog">
            <span>Discard this shelf?</span>
            <button
              type="button"
              className="new-shelf-discard-confirm"
              onClick={() => navigate('/read/library')}
            >
              Discard
            </button>
            <button
              type="button"
              className="new-shelf-discard-keep"
              onClick={() => setShowDiscard(false)}
            >
              Keep editing
            </button>
          </div>
        )}
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
    </div>
  )
}
