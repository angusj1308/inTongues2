import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { searchPodcasts } from '../services/podcast'
import PodcastShell from '../components/podcast/PodcastShell'
import ShowResultsList from '../components/podcast/ShowResultsList'
import usePodcastSubscriptions from '../components/podcast/usePodcastSubscriptions'

const PAGE_SIZE = 25

const PodcastSearchResultsPage = () => {
  const [params] = useSearchParams()
  const { profile } = useAuth()
  const { followedIds, pinnedRefs, follow, unfollow } = usePodcastSubscriptions()
  const query = params.get('q') || ''
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [exhausted, setExhausted] = useState(false)

  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')

  useEffect(() => {
    let cancelled = false
    if (!query.trim()) {
      setResults([])
      setExhausted(true)
      return
    }
    setLoading(true)
    setPage(1)
    setExhausted(false)
    searchPodcasts({ query, language, limit: PAGE_SIZE }).then((shows) => {
      if (cancelled) return
      setResults(shows || [])
      setExhausted((shows || []).length < PAGE_SIZE)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [query, language])

  const handleLoadMore = async () => {
    if (loading || exhausted) return
    setLoading(true)
    const next = page + 1
    const more = await searchPodcasts({
      query,
      language,
      limit: PAGE_SIZE,
      offset: results.length,
    })
    setResults((prev) => [...prev, ...(more || [])])
    setPage(next)
    if ((more || []).length < PAGE_SIZE) setExhausted(true)
    setLoading(false)
  }

  const handleFollow = (show) => follow(show)
  const handleUnfollow = (show) => unfollow(show.id)

  return (
    <PodcastShell>
      <Link to="/podcasts/discover" className="podcast-back-link ui-text">
        ← Discover
      </Link>
      <header className="podcast-results-header">
        <h1 className="podcast-results-header-title">
          Results for <em>"{query}"</em>
        </h1>
        <p className="podcast-results-header-count">
          {loading && results.length === 0
            ? 'Searching…'
            : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </p>
      </header>

      <ShowResultsList
        shows={results}
        followedShowIds={followedIds}
        pinnedRefIds={pinnedRefs}
        onFollow={handleFollow}
        onUnfollow={handleUnfollow}
      />

      {!exhausted && results.length > 0 && (
        <div className="podcast-load-more">
          <button
            type="button"
            className="podcast-secondary-button ui-text"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </PodcastShell>
  )
}

export default PodcastSearchResultsPage
