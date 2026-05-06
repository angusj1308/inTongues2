import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { mockBooksForLanguage } from '../../data/mockBooks'
import GenerateInlineForm from './GenerateInlineForm'
import ImportInlineForm from './ImportInlineForm'
import GutenbergSearchPanel from './GutenbergSearchPanel'

const ROWS = [
  { key: 'originals', title: 'New inTongues Originals' },
  { key: 'adaptations', title: 'New Adaptations' },
  { key: 'popular', title: 'Popular Right Now' },
]

const DOORS = [
  {
    key: 'generate',
    to: '/read/discover/generate',
    label: 'Generate',
    description: 'Have an original story written in your target language at your level.',
  },
  {
    key: 'import',
    to: '/read/discover/import',
    label: 'Import',
    description: 'Upload an EPUB or PDF in any language. We’ll translate it to your target language at your level.',
  },
  {
    key: 'classics',
    to: '/read/discover/classics',
    label: 'Classics',
    description: 'Read public-domain classics adapted to your level.',
  },
]

export default function DiscoverLanding({
  activeLanguage,
  getStoryTitle,
  expandedDoor = null,
  onSelectGutenbergBook,
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const expandedCardRef = useRef(null)
  const gutenbergRef = useRef(null)

  const isClassics = expandedDoor === 'classics'

  useEffect(() => {
    if (expandedDoor !== 'generate' && expandedDoor !== 'import') return
    const handleClickOutside = (event) => {
      const card = expandedCardRef.current
      if (card && !card.contains(event.target)) {
        navigate('/read/discover')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expandedDoor, navigate])

  // Reset the query when leaving classics so the search bar starts empty
  // when the user comes back to the landing.
  useEffect(() => {
    if (!isClassics) setQuery('')
  }, [isClassics])

  const rowBooks = useMemo(() => {
    const pool = mockBooksForLanguage(activeLanguage)
    const slices = { originals: [], adaptations: [], popular: [] }
    pool.forEach((book, index) => {
      const bucket = ROWS[index % ROWS.length].key
      slices[bucket].push(book)
    })
    return Object.fromEntries(
      Object.entries(slices).map(([k, v]) => [k, v.slice(0, 6)]),
    )
  }, [activeLanguage])

  const titleOf = (book) =>
    getStoryTitle ? getStoryTitle(book) : book.title

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (isClassics) {
      gutenbergRef.current?.search(query)
    }
  }

  return (
    <div className="discover-landing">
      <form
        className="discover-search"
        role="search"
        onSubmit={handleSearchSubmit}
      >
        <span className="discover-search-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="search"
          className="discover-search-input"
          placeholder={isClassics ? 'Search title, author, or subject…' : 'Search'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={isClassics ? 'Search Project Gutenberg' : 'Search the catalog'}
        />
      </form>

      <div
        key={isClassics ? 'classics' : 'landing'}
        className={`discover-content-slider ${
          isClassics ? 'slide-in-right' : 'slide-in-left'
        }`}
      >
        {isClassics ? (
          <GutenbergSearchPanel
            ref={gutenbergRef}
            activeLanguage={activeLanguage}
            onSelectBook={onSelectGutenbergBook}
            hideSearchBar
          />
        ) : (
          <>
            <div className="discover-doors discover-doors--landing">
              {DOORS.map((door) => {
                const isExpanded = expandedDoor === door.key
                if (isExpanded && door.key === 'generate') {
                  return (
                    <div
                      key={door.key}
                      ref={expandedCardRef}
                      className="discover-door discover-door--landing is-expanded"
                    >
                      <GenerateInlineForm activeLanguage={activeLanguage} />
                    </div>
                  )
                }
                if (isExpanded && door.key === 'import') {
                  return (
                    <div
                      key={door.key}
                      ref={expandedCardRef}
                      className="discover-door discover-door--landing is-expanded"
                    >
                      <ImportInlineForm activeLanguage={activeLanguage} />
                    </div>
                  )
                }
                return (
                  <NavLink
                    key={door.key}
                    to={door.to}
                    className="discover-door discover-door--landing"
                  >
                    <h2 className="discover-door-label">{door.label}</h2>
                    <span className="discover-door-rule" aria-hidden="true" />
                    <p className="discover-door-description">{door.description}</p>
                  </NavLink>
                )
              })}
            </div>

            <div className="discover-hairline" aria-hidden="true" />

            <div className="discover-rows">
              {ROWS.map((row) => {
                const books = rowBooks[row.key] || []
                return (
                  <section key={row.key} className="discover-row">
                    <header className="discover-row-header">
                      <h2 className="discover-row-title">{row.title}</h2>
                      <button type="button" className="discover-row-view-all">
                        View all <span aria-hidden="true">→</span>
                      </button>
                    </header>
                    <div className="discover-row-grid">
                      {books.map((book) => (
                        <button
                          key={book.id}
                          type="button"
                          className="discover-row-cover"
                          aria-label={titleOf(book)}
                        >
                          {book.coverImageUrl ? (
                            <img
                              src={book.coverImageUrl}
                              alt={`Cover of ${titleOf(book)}`}
                              className="discover-row-cover-img"
                            />
                          ) : (
                            <span className="discover-row-cover-fallback">
                              {titleOf(book)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
