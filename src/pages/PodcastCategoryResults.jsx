import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import {
  fetchCategoryShows,
  followShow,
  unfollowShow,
  unpinByRef,
  subscribeFollowedShows,
  subscribePins,
} from '../services/podcast'
import PodcastShell from '../components/podcast/PodcastShell'
import ShowResultsList from '../components/podcast/ShowResultsList'
import { localizeCategory } from '../components/podcast/categories'

const PAGE_SIZE = 25

const PodcastCategoryResultsPage = () => {
  const { category: categoryParam } = useParams()
  const category = decodeURIComponent(categoryParam || '')
  const { user, profile } = useAuth()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [followedShows, setFollowedShows] = useState([])
  const [pins, setPins] = useState([])

  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English') || 'English'
  const localizedTitle = localizeCategory(category, nativeLanguage)

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

  const followedIds = useMemo(
    () => new Set(followedShows.map((s) => s.id)),
    [followedShows],
  )
  const pinnedRefs = useMemo(() => new Set(pins.map((p) => p.refId)), [pins])

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
        <h1 className="podcast-results-header-title podcast-results-header-category">
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

      {!loading && results.length === 0 && (
        <p className="podcast-empty-line">No shows found in this category.</p>
      )}
    </PodcastShell>
  )
}

export default PodcastCategoryResultsPage
