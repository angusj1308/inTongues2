import { useState, useEffect, useCallback } from 'react'
import { searchBooks, getLanguageCode } from '../../services/gutenberg'

// Target language translations for modal title
const EXPLORE_TITLES = {
  Spanish: 'Explorar',
  French: 'Explorer',
  Italian: 'Esplorare',
  English: 'Explore',
}

const GutenbergSearchPanel = ({
  activeLanguage = '',
  onClose,
  onSelectBook,
  isModal = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [nextPage, setNextPage] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedBook, setSelectedBook] = useState(null)

  // Load popular books on mount
  useEffect(() => {
    const loadPopular = async () => {
      setLoading(true)
      try {
        const results = await searchBooks({ page: 1 })
        setBooks(results.books)
        setTotalCount(results.count)
        setNextPage(results.next)
      } catch (err) {
        console.error('Failed to load popular books:', err)
      } finally {
        setLoading(false)
      }
    }
    loadPopular()
  }, [])

  const handleSearch = useCallback(async (page = 1) => {
    if (!searchQuery.trim() && page === 1) {
      // Reset to popular books
      setLoading(true)
      try {
        const results = await searchBooks({ page: 1 })
        setBooks(results.books)
        setTotalCount(results.count)
        setNextPage(results.next)
        setCurrentPage(1)
        setHasSearched(false)
      } catch (err) {
        setError('Failed to load books')
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    setError('')
    setHasSearched(true)

    try {
      const results = await searchBooks({
        search: searchQuery.trim(),
        page,
      })

      if (page === 1) {
        setBooks(results.books)
      } else {
        setBooks((prev) => [...prev, ...results.books])
      }

      setTotalCount(results.count)
      setNextPage(results.next)
      setCurrentPage(page)
    } catch (err) {
      console.error('Search error:', err)
      setError('Failed to search. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch(1)
    }
  }

  const handleLoadMore = () => {
    if (nextPage && !loading) {
      handleSearch(currentPage + 1)
    }
  }

  const handleBookClick = (book) => {
    setSelectedBook(book)
  }

  const handleBackToResults = () => {
    setSelectedBook(null)
  }

  const handleSelectForImport = (book) => {
    if (onSelectBook) {
      onSelectBook(book)
    }
  }

  const panelContent = (
    <div className="gutenberg-panel">
      <div className="gutenberg-header">
        <div className="gutenberg-header-top">
          <h2 className="gutenberg-title">
            {EXPLORE_TITLES[activeLanguage] || EXPLORE_TITLES.English}
          </h2>
          {onClose && (
            <button className="modal-close-button" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        <p className="gutenberg-subtitle">
          Explore Gutenberg's vast library of classics, ready to be adapted to your level.
        </p>

        {!selectedBook && (
          <div className="gutenberg-search-bar">
            <input
              type="text"
              className="gutenberg-search-input"
              placeholder="Search by title, author, or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="gutenberg-search-btn"
              onClick={() => handleSearch(1)}
              disabled={loading}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="gutenberg-error">{error}</p>}

      {selectedBook ? (
        <div className="gutenberg-book-detail">
          <button className="gutenberg-back-btn" onClick={handleBackToResults}>
            ← Back to results
          </button>

          <div className="gutenberg-book-detail-content">
            <div className="gutenberg-book-detail-cover">
              {selectedBook.coverUrl ? (
                <img src={selectedBook.coverUrl} alt={selectedBook.title} />
              ) : (
                <div className="gutenberg-book-no-cover">No Cover</div>
              )}
            </div>

            <div className="gutenberg-book-detail-info">
              <h3 className="gutenberg-book-detail-title">{selectedBook.title}</h3>

              <div className="gutenberg-book-detail-meta">
                <div className="gutenberg-meta-row">
                  <span className="gutenberg-meta-label">Author</span>
                  <span className="gutenberg-meta-value">
                    {selectedBook.authorName} {selectedBook.authorLifespan}
                  </span>
                </div>

                {selectedBook.languages?.length > 0 && (
                  <div className="gutenberg-meta-row">
                    <span className="gutenberg-meta-label">Language</span>
                    <span className="gutenberg-meta-value">
                      {selectedBook.languages.join(', ').toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="gutenberg-meta-row">
                  <span className="gutenberg-meta-label">Downloads</span>
                  <span className="gutenberg-meta-value">
                    {selectedBook.downloadCount.toLocaleString()}
                  </span>
                </div>

                {selectedBook.subjects?.length > 0 && (
                  <div className="gutenberg-meta-row gutenberg-meta-subjects">
                    <span className="gutenberg-meta-label">Subjects</span>
                    <div className="gutenberg-meta-tags">
                      {selectedBook.subjects.slice(0, 5).map((subject, i) => (
                        <span key={i} className="gutenberg-tag">{subject}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedBook.bookshelves?.length > 0 && (
                  <div className="gutenberg-meta-row">
                    <span className="gutenberg-meta-label">Bookshelves</span>
                    <div className="gutenberg-meta-tags">
                      {selectedBook.bookshelves.slice(0, 3).map((shelf, i) => (
                        <span key={i} className="gutenberg-tag">{shelf}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="gutenberg-book-detail-actions">
                <button
                  className="gutenberg-btn-primary"
                  onClick={() => handleSelectForImport(selectedBook)}
                  disabled={!selectedBook.textUrl}
                >
                  Import & Adapt
                </button>
                {selectedBook.htmlUrl && (
                  <a
                    href={selectedBook.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gutenberg-btn-secondary"
                  >
                    Read Online
                  </a>
                )}
              </div>

              {!selectedBook.textUrl && (
                <p className="gutenberg-warning">
                  Plain text format not available for this book.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="gutenberg-results">
          {!loading && hasSearched && books.length === 0 && (
            <p className="gutenberg-no-results">
              No books found for "{searchQuery}". Try a different search term.
            </p>
          )}

          {!loading && !hasSearched && books.length > 0 && (
            <p className="gutenberg-results-info">
              Showing popular books from Project Gutenberg
            </p>
          )}

          {hasSearched && books.length > 0 && (
            <p className="gutenberg-results-info">
              Found {totalCount.toLocaleString()} books
            </p>
          )}

          <div className="gutenberg-books-grid">
            {books.map((book) => (
              <button
                key={book.id}
                className="gutenberg-book-card"
                onClick={() => handleBookClick(book)}
              >
                <div className="gutenberg-book-cover">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt="" />
                  ) : (
                    <div className="gutenberg-book-no-cover-small">
                      <span>{book.title.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="gutenberg-book-info">
                  <h4 className="gutenberg-book-title">{book.title}</h4>
                  <p className="gutenberg-book-author">{book.authorName}</p>
                  <p className="gutenberg-book-downloads">
                    {book.downloadCount.toLocaleString()} downloads
                  </p>
                </div>
              </button>
            ))}
          </div>

          {loading && (
            <div className="gutenberg-loading">
              <p>Loading books...</p>
            </div>
          )}

          {nextPage && !loading && (
            <button className="gutenberg-load-more" onClick={handleLoadMore}>
              Load More
            </button>
          )}
        </div>
      )}
    </div>
  )

  if (isModal) {
    return (
      <div className="modal-overlay gutenberg-modal-overlay" onClick={onClose}>
        <div className="modal-container gutenberg-modal" onClick={(e) => e.stopPropagation()}>
          {panelContent}
        </div>
      </div>
    )
  }

  return panelContent
}

export default GutenbergSearchPanel
