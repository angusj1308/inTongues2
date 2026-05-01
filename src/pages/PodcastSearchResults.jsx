import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import {
  searchPodcasts,
  followShow,
  unfollowShow,
  unpinByRef,
  subscribeFollowedShows,
  subscribePins,
} from '../services/podcast'
import PodcastShell from '../components/podcast/PodcastShell'
import ShowResultsList from '../components/podcast/ShowResultsList'

const PAGE_SIZE = 25

const PodcastSearchResultsPage = () => {
  const [params] = useSearchParams()
  const { user, profile } = useAuth()
  const query = params.get('q') || ''
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [exhausted, setExhausted] = useState(false)
  const [followedShows, setFollowedShows] = useState([])
  const [pins, setPins] = useState([])

  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')

  useEffect(() => {
    if (!user?.uid) return undefined
    const u1 = subscribeFollowedShows(user.uid, setFollowedShows)
    const u2 = subscribePins(user.uid, setPins)
    return () => {
      u1()
      u2()
    }
  }, [user?.uid])

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

  const followedIds = useMemo(
    () => new Set(followedShows.map((s) => s.id)),
    [followedShows],
  )

  const pinnedRefs = useMemo(() => new Set(pins.map((p) => p.refId)), [pins])

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

  const handleFollow = async (show) => {
    if (!user?.uid) return
    await followShow(user.uid, show)
  }

  const handleUnfollow = async (show) => {
    if (!user?.uid) return
    await unfollowShow(user.uid, show.id)
    if (pinnedRefs.has(show.id)) await unpinByRef(user.uid, show.id)
  }

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
