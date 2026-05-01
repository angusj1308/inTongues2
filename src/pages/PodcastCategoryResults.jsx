import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { fetchCategoryShows } from '../services/podcast'
import PodcastShell from '../components/podcast/PodcastShell'
import ShowResultsList from '../components/podcast/ShowResultsList'
import { localizeCategory } from '../components/podcast/categories'
import usePodcastSubscriptions from '../components/podcast/usePodcastSubscriptions'

const PAGE_SIZE = 25

const PodcastCategoryResultsPage = () => {
  const { category: categoryParam } = useParams()
  const category = decodeURIComponent(categoryParam || '')
  const { profile } = useAuth()
  const { followedIds, pinnedRefs, follow, unfollow } = usePodcastSubscriptions()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English') || 'English'
  const localizedTitle = localizeCategory(category, nativeLanguage)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setExhausted(false)
    fetchCategoryShows({ category, language, limit: PAGE_SIZE }).then((shows) => {
      if (cancelled) return
      setResults(shows || [])
      setExhausted((shows || []).length < PAGE_SIZE)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [category, language])

  const handleLoadMore = async () => {
    if (loading || exhausted) return
    setLoading(true)
    const more = await fetchCategoryShows({
      category,
      language,
      limit: PAGE_SIZE,
      offset: results.length,
    })
    setResults((prev) => [...prev, ...(more || [])])
    if ((more || []).length < PAGE_SIZE) setExhausted(true)
    setLoading(false)
  }

  const handleFollow = (show) => follow(show)
  const handleUnfollow = (show) => unfollow(show.id)

  return (
    <PodcastShell>
      <Link to="/podcasts/discover" className="media-back-link ui-text">
        ← Discover
      </Link>
      <header className="media-results-header">
        <h1 className="media-results-header-title media-results-header-category">
          {localizedTitle}
        </h1>
      </header>

      <ShowResultsList
        shows={results}
        followedShowIds={followedIds}
        pinnedRefIds={pinnedRefs}
        onFollow={handleFollow}
        onUnfollow={handleUnfollow}
      />

      {!exhausted && results.length > 0 && (
        <div className="media-load-more">
          <button
            type="button"
            className="media-secondary-button ui-text"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {!loading && results.length === 0 && (
        <p className="media-empty-line">No shows found in this category.</p>
      )}
    </PodcastShell>
  )
}

export default PodcastCategoryResultsPage
