import { useState, useEffect, useMemo } from 'react'

import { searchBooks, localCoverPath } from '../../services/gutenberg'

// Order matches the brief: Most Downloaded first, then 12 genre shelves.
const GENRE_SHELVES = [
  'Russian Masters',
  '19th-Century Classics',
  'Modernist Classics',
  'Mystery & Detective',
  'Adventure',
  'Romance',
  'Gothic & Horror',
  'Sci-Fi',
  'Comedy & Satire',
  'Historical Fiction',
  "Children's Classics",
  'Myth, Fable & Fairy Tale',
]

const sortByDownloads = (a, b) => (b.downloadCount || 0) - (a.downloadCount || 0)

function ShelfCover({ book }) {
  const src = useMemo(() => localCoverPath(book.title), [book.title])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [book.title])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={book.title}
        className="reading-shelf-cover-img"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className="reading-shelf-no-cover">
      <span>{book.title}</span>
    </div>
  )
}

function ShelfItem({ book, onSelect }) {
  return (
    <div className="reading-shelf-item">
      <button
        className="reading-shelf-item-content"
        onClick={() => onSelect?.(book)}
      >
        <div className="reading-shelf-cover">
          <ShelfCover book={book} />
          <div className="reading-shelf-hover-overlay">
            <div className="reading-shelf-hover-title">{book.title}</div>
            {book.authorName && (
              <div className="reading-shelf-hover-meta">{book.authorName}</div>
            )}
          </div>
        </div>
      </button>
    </div>
  )
}

function Shelf({ title, books, onSelect }) {
  if (!books || books.length === 0) return null
  return (
    <div className="reading-shelf">
      <div className="reading-shelf-header">
        <h2 className="reading-shelf-title">{title}</h2>
      </div>
      <div className="reading-shelf-scroll">
        {books.map((book) => (
          <ShelfItem key={book.id} book={book} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

const matchesQuery = (book, term) => {
  if ((book.title || '').toLowerCase().includes(term)) return true
  for (const author of book.authors || []) {
    if ((author?.name || '').toLowerCase().includes(term)) return true
  }
  return false
}

export default function ClassicsShelves({ searchQuery = '', onSelectBook }) {
  const [allBooks, setAllBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    searchBooks({})
      .then((res) => {
        if (cancelled) return
        setAllBooks(res.books || [])
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load classics:', err)
        setError('Failed to load classics')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shelves = useMemo(() => {
    const term = (searchQuery || '').trim().toLowerCase()

    if (term) {
      const filtered = allBooks.filter((b) => matchesQuery(b, term))
      return [
        {
          title: `Search results for "${searchQuery.trim()}"`,
          books: [...filtered].sort(sortByDownloads),
        },
      ]
    }

    const result = [
      { title: 'Most Downloaded', books: [...allBooks].sort(sortByDownloads) },
    ]

    for (const genre of GENRE_SHELVES) {
      const books = allBooks
        .filter((b) => b.genreShelf === genre)
        .sort(sortByDownloads)
      result.push({ title: genre, books })
    }

    return result
  }, [allBooks, searchQuery])

  if (loading) {
    return (
      <div className="classics-shelves classics-shelves--loading">
        <p>Loading classics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="classics-shelves classics-shelves--error">
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="classics-shelves">
      {shelves.map((shelf) => (
        <Shelf
          key={shelf.title}
          title={shelf.title}
          books={shelf.books}
          onSelect={onSelectBook}
        />
      ))}
    </div>
  )
}
