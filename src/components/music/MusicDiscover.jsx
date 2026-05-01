import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { MUSIC_GENRES, localizeGenre } from './genres'

const MusicDiscover = () => {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [query, setQuery] = useState('')

  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English') || 'English'

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/music/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="media-discover">
      <form className="media-search-form" onSubmit={handleSubmit} role="search">
        <input
          type="search"
          className="media-search-input"
          placeholder="Search artists, albums, or tracks."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search music"
        />
        <button type="submit" className="media-secondary-button ui-text">
          Search
        </button>
      </form>

      <section className="media-section">
        <h2 className="media-section-header">Browse by Genre</h2>
        <div className="media-category-grid">
          {MUSIC_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              className="media-category-tile"
              onClick={() => navigate(`/music/discover/${encodeURIComponent(genre)}`)}
            >
              <span className="media-category-tile-label">
                {localizeGenre(genre, nativeLanguage)}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default MusicDiscover
