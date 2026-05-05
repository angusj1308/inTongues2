import { useMemo, useState } from 'react'
import DiscoverDoors from './DiscoverDoors'
import { mockBooksForLanguage } from '../../data/mockBooks'

const ROWS = [
  { key: 'originals', title: 'New inTongues Originals' },
  { key: 'adaptations', title: 'New Adaptations' },
  { key: 'popular', title: 'Popular Right Now' },
]

export default function DiscoverLanding({ activeLanguage, getStoryTitle }) {
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
        <input
          type="search"
          className="discover-search-input"
          placeholder="Search the catalog…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the catalog"
        />
      </form>

      <DiscoverDoors mode="landing" />

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
