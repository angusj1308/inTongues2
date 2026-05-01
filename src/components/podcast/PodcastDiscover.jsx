import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { PODCAST_CATEGORIES, localizeCategory } from './categories'

const PodcastDiscover = () => {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [query, setQuery] = useState('')

  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English') || 'English'

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/podcasts/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="podcast-discover">
      <form className="podcast-search-form" onSubmit={handleSubmit} role="search">
        <input
          type="search"
          className="podcast-search-input"
          placeholder="Search shows or topics."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search podcasts"
        />
        <button type="submit" className="podcast-secondary-button ui-text">
          Search
        </button>
      </form>

      <section className="podcast-section">
        <h2 className="podcast-section-header">Browse by Category</h2>
        <div className="podcast-category-grid">
          {PODCAST_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className="podcast-category-tile"
              onClick={() =>
                navigate(`/podcasts/discover/${encodeURIComponent(category)}`)
              }
            >
              <span className="podcast-category-tile-label">
                {localizeCategory(category, nativeLanguage)}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default PodcastDiscover
