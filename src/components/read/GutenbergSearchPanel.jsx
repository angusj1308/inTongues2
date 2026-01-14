import { useState, useEffect, useCallback } from 'react'
import { searchBooks } from '../../services/gutenberg'

// Target language translations for modal title
const EXPLORE_TITLES = {
  Spanish: 'Explorar',
  French: 'Explorer',
  Italian: 'Esplorare',
  English: 'Explore',
}

const LEVELS = ['Beginner', 'Intermediate', 'Native']

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

  // Import wizard state
  const [importingBookId, setImportingBookId] = useState(null)
  const [importStep, setImportStep] = useState('format') // format, level, audio, voice, confirm
  const [importOptions, setImportOptions] = useState({
    format: null,
    level: null,
    generateAudio: null,
    voiceGender: null,
  })

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

  // Reset import wizard
  const resetImportWizard = () => {
    setImportingBookId(null)
    setImportStep('format')
    setImportOptions({
      format: null,
      level: null,
      generateAudio: null,
      voiceGender: null,
    })
  }

  // Start import wizard for a book
  const startImportWizard = (e, bookId, format) => {
    e.stopPropagation()
    setImportingBookId(bookId)
    setImportStep('level')
    setImportOptions({
      format,
      level: null,
      generateAudio: null,
      voiceGender: null,
    })
  }

  // Handle level selection
  const handleLevelSelect = (e, level) => {
    e.stopPropagation()
    setImportOptions((prev) => ({ ...prev, level }))
    setImportStep('audio')
  }

  // Handle audio selection
  const handleAudioSelect = (e, generateAudio) => {
    e.stopPropagation()
    setImportOptions((prev) => ({ ...prev, generateAudio }))
    if (generateAudio) {
      setImportStep('voice')
    } else {
      setImportStep('confirm')
    }
  }

  // Handle voice selection
  const handleVoiceSelect = (e, voiceGender) => {
    e.stopPropagation()
    setImportOptions((prev) => ({ ...prev, voiceGender }))
    setImportStep('confirm')
  }

  // Handle final confirmation
  const handleConfirmImport = (e, book) => {
    e.stopPropagation()
    if (onSelectBook) {
      onSelectBook({
        ...book,
        selectedFormat: importOptions.format,
        level: importOptions.level,
        generateAudio: importOptions.generateAudio,
        voiceGender: importOptions.voiceGender,
      })
    }
    resetImportWizard()
  }

  // Handle cancel/back in wizard
  const handleWizardBack = (e) => {
    e.stopPropagation()
    if (importStep === 'level') {
      resetImportWizard()
    } else if (importStep === 'audio') {
      setImportStep('level')
    } else if (importStep === 'voice') {
      setImportStep('audio')
    } else if (importStep === 'confirm') {
      if (importOptions.generateAudio) {
        setImportStep('voice')
      } else {
        setImportStep('audio')
      }
    }
  }

  // Render the import wizard overlay for a book
  const renderImportWizard = (book) => {
    if (importingBookId !== book.id) {
      // Default format selection
      return (
        <div className="gutenberg-book-hover-overlay">
          {book.epubUrl && (
            <button
              className="gutenberg-quick-import-btn"
              onClick={(e) => startImportWizard(e, book.id, 'epub')}
            >
              EPUB
            </button>
          )}
          {book.textUrl && (
            <button
              className="gutenberg-quick-import-btn"
              onClick={(e) => startImportWizard(e, book.id, 'txt')}
            >
              TXT
            </button>
          )}
        </div>
      )
    }

    // Wizard steps
    return (
      <div className="gutenberg-book-hover-overlay gutenberg-wizard-overlay">
        <button
          className="gutenberg-wizard-back"
          onClick={handleWizardBack}
        >
          ←
        </button>

        {importStep === 'level' && (
          <div className="gutenberg-wizard-step">
            <span className="gutenberg-wizard-label">Select Level</span>
            {LEVELS.map((level) => (
              <button
                key={level}
                className="gutenberg-quick-import-btn"
                onClick={(e) => handleLevelSelect(e, level)}
              >
                {level}
              </button>
            ))}
          </div>
        )}

        {importStep === 'audio' && (
          <div className="gutenberg-wizard-step">
            <span className="gutenberg-wizard-label">Generate Audio?</span>
            <button
              className="gutenberg-quick-import-btn"
              onClick={(e) => handleAudioSelect(e, true)}
            >
              Yes
            </button>
            <button
              className="gutenberg-quick-import-btn"
              onClick={(e) => handleAudioSelect(e, false)}
            >
              No
            </button>
          </div>
        )}

        {importStep === 'voice' && (
          <div className="gutenberg-wizard-step">
            <span className="gutenberg-wizard-label">Voice Gender</span>
            <button
              className="gutenberg-quick-import-btn"
              onClick={(e) => handleVoiceSelect(e, 'male')}
            >
              Male
            </button>
            <button
              className="gutenberg-quick-import-btn"
              onClick={(e) => handleVoiceSelect(e, 'female')}
            >
              Female
            </button>
          </div>
        )}

        {importStep === 'confirm' && (
          <div className="gutenberg-wizard-step gutenberg-wizard-confirm">
            <span className="gutenberg-wizard-label">Confirm Import</span>
            <div className="gutenberg-wizard-summary">
              <span>{importOptions.format.toUpperCase()}</span>
              <span>{importOptions.level}</span>
              <span>{importOptions.generateAudio ? `Audio: ${importOptions.voiceGender}` : 'No audio'}</span>
            </div>
            <button
              className="gutenberg-quick-import-btn gutenberg-confirm-btn"
              onClick={(e) => handleConfirmImport(e, book)}
            >
              Import
            </button>
          </div>
        )}
      </div>
    )
  }

  // Handle detail view import (same wizard but in detail)
  const handleDetailImport = (format) => {
    if (onSelectBook && selectedBook) {
      // For detail view, we'll open import modal with pre-filled data
      // For now, just pass the format
      onSelectBook({
        ...selectedBook,
        selectedFormat: format,
      })
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
                {selectedBook.epubUrl && (
                  <button
                    className="gutenberg-btn-primary"
                    onClick={() => handleDetailImport('epub')}
                  >
                    Import EPUB
                  </button>
                )}
                {selectedBook.textUrl && (
                  <button
                    className={selectedBook.epubUrl ? "gutenberg-btn-secondary" : "gutenberg-btn-primary"}
                    onClick={() => handleDetailImport('txt')}
                  >
                    Import TXT
                  </button>
                )}
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

              {!selectedBook.textUrl && !selectedBook.epubUrl && (
                <p className="gutenberg-warning">
                  No downloadable format available for this book.
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
              <div
                key={book.id}
                className={`gutenberg-book-card${importingBookId === book.id ? ' is-importing' : ''}`}
                onClick={() => {
                  if (!importingBookId) {
                    handleBookClick(book)
                  }
                }}
                onMouseLeave={() => {
                  if (importingBookId === book.id) {
                    resetImportWizard()
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (!importingBookId) {
                      handleBookClick(book)
                    }
                  }
                  if (e.key === 'Escape' && importingBookId === book.id) {
                    resetImportWizard()
                  }
                }}
              >
                <div className="gutenberg-book-cover">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt="" />
                  ) : (
                    <div className="gutenberg-book-no-cover-small">
                      <span>{book.title.charAt(0)}</span>
                    </div>
                  )}
                  {renderImportWizard(book)}
                </div>
                <div className="gutenberg-book-info">
                  <h4 className="gutenberg-book-title">{book.title}</h4>
                  <p className="gutenberg-book-author">{book.authorName}</p>
                  <p className="gutenberg-book-downloads">
                    {book.downloadCount.toLocaleString()} downloads
                  </p>
                </div>
              </div>
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
