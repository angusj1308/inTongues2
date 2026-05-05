import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { mockBooksForLanguage } from '../../data/mockBooks'
import GenerateInlineForm from './GenerateInlineForm'

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
    description: 'Commission a new short story or novel.',
  },
  {
    key: 'adapt',
    to: '/read/discover/adapt',
    label: 'Adapt',
    description: 'Re-render a classic at your level.',
  },
  {
    key: 'import',
    to: '/read/discover/import',
    label: 'Import',
    description: 'Bring your own EPUB or PDF.',
  },
]

export default function DiscoverLanding({
  activeLanguage,
  getStoryTitle,
  expandedDoor = null,
}) {
  const [query, setQuery] = useState('')

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

  return (
    <div className="discover-landing">
      <form
        className="discover-search"
        role="search"
        onSubmit={(e) => e.preventDefault()}
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
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the catalog"
        />
      </form>

      <div className="discover-doors discover-doors--landing">
        {DOORS.map((door) => {
          const isExpanded = expandedDoor === door.key
          if (isExpanded && door.key === 'generate') {
            return (
              <div
                key={door.key}
                className="discover-door discover-door--landing is-expanded"
              >
                <GenerateInlineForm activeLanguage={activeLanguage} />
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
    </div>
  )
}
