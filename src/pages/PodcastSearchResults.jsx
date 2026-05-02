import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { searchPodcasts, fetchShow, fetchShowEpisodes } from '../services/podcast'
import PodcastShell from '../components/podcast/PodcastShell'
import SearchResultRow, {
  SearchResultRowSkeleton,
} from '../components/podcast/SearchResultRow'
import UnavailableShowMessage from '../components/podcast/UnavailableShowMessage'
import usePodcastSubscriptions from '../components/podcast/usePodcastSubscriptions'

const PAGE_SIZE = 25

const SkeletonList = ({ count = 6 }) => (
  <div className="media-results-list" aria-busy="true" aria-label="Searching…">
    {Array.from({ length: count }).map((_, i) => (
      <SearchResultRowSkeleton key={i} />
    ))}
  </div>
)

const PodcastSearchResultsPage = () => {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { followedIds, pinnedRefs, follow, unfollow } = usePodcastSubscriptions()

  const submittedQuery = params.get('q') || ''
  const [inputValue, setInputValue] = useState(submittedQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [exhausted, setExhausted] = useState(false)
  const [unavailableEpisode, setUnavailableEpisode] = useState(null)

  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')

  // Keep the field synced with the URL when the user re-submits or back-navigates.
  useEffect(() => {
    setInputValue(submittedQuery)
  }, [submittedQuery])

  const runSearch = useCallback(async () => {
    if (!submittedQuery.trim()) {
      setResults([])
      setExhausted(true)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await searchPodcasts({ query: submittedQuery, language })
      setResults(next)
      setExhausted(next.length < PAGE_SIZE)
    } catch (err) {
      console.error('Search failed', err)
      setError(err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [submittedQuery, language])

  useEffect(() => {
    runSearch()
  }, [runSearch])

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setParams({ q: trimmed })
  }

  const handleLoadMore = async () => {
    if (loading || exhausted) return
    setLoading(true)
    try {
      const more = await searchPodcasts({
        query: submittedQuery,
        language,
        offset: results.length,
      })
      // Backend search returns a single ranked page; second page typically returns the
      // same set, so de-dupe against what we already have.
      const idOf = (r) =>
        r.type === 'show'
          ? `s:${r.itunesCollectionId ?? r.spotifyShowId ?? r.feedId ?? ''}`
          : `e:${r.itunesEpisodeId ?? r.spotifyEpisodeId ?? r.episodeId ?? ''}`
      const seen = new Set(results.map(idOf))
      const novel = more.filter((r) => !seen.has(idOf(r)))
      if (novel.length === 0) {
        setExhausted(true)
      } else {
        setResults((prev) => [...prev, ...novel])
      }
    } catch (err) {
      console.error('Load more failed', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const showIdOf = (r) => String(r.itunesCollectionId ?? r.spotifyShowId ?? r.feedId ?? '')
  const episodeIdOf = (r) =>
    String(r.itunesEpisodeId ?? r.spotifyEpisodeId ?? r.episodeId ?? '')

  const handleFollow = (result) => {
    follow({
      id: showIdOf(result),
      title: result.title,
      host: result.author || '',
      coverUrl: result.coverArtUrl || '',
      language: result.language || '',
      category: Array.isArray(result.categories) ? result.categories[0] || '' : '',
    })
  }

  const handleUnfollow = (result) => {
    unfollow(showIdOf(result))
  }

  const handlePlayEpisode = async (episode) => {
    const parentShowId = String(
      episode.itunesCollectionId || episode.spotifyShowId || '',
    )
    // Search-result episodes don't carry an audioUrl directly (iTunes search
    // doesn't return it). Resolve via the show's RSS-backed episode list,
    // matching by episode id.
    if (!parentShowId) return
    let parent = null
    try {
      parent = await fetchShow(parentShowId)
    } catch (err) {
      console.error('Show lookup failed', err)
    }
    if (parent && parent.available === false) {
      setUnavailableEpisode({
        showTitle: episode.showTitle || parent.title || '',
      })
      return
    }
    const epId = episodeIdOf(episode)
    let { episodes } = await fetchShowEpisodes(parentShowId)
    let resolved = episodes.find((ep) => String(ep.id) === String(epId))
    // Episode IDs from iTunes search and RSS feed often differ; fall back to
    // matching by title.
    if (!resolved && episode.title) {
      resolved = episodes.find((ep) => ep.title === episode.title)
    }
    // Last resort: play the most recent episode from the feed.
    if (!resolved && episodes.length) resolved = episodes[0]
    if (!resolved?.audioUrl) {
      setUnavailableEpisode({ showTitle: episode.showTitle || parent?.title || '' })
      return
    }
    navigate(`/podcasts/play/${encodeURIComponent(resolved.id)}`, {
      state: {
        episode: {
          ...resolved,
          showId: parentShowId,
          showName: episode.showTitle || parent?.title || resolved.showName || '',
          coverUrl: resolved.coverUrl || episode.coverArtUrl || parent?.coverUrl || '',
        },
      },
    })
  }

  const totalCount = results.length

  return (
    <PodcastShell>
      <Link to="/podcasts/discover" className="media-back-link ui-text">
        ← Discover
      </Link>

      <form
        className="media-search-form media-search-page-form"
        onSubmit={handleSubmit}
        role="search"
      >
        <input
          type="search"
          className="media-search-input"
          placeholder="Search shows or topics."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          aria-label="Search podcasts"
        />
        <button type="submit" className="media-secondary-button ui-text">
          Search
        </button>
      </form>

      {submittedQuery && (
        <p className="media-search-caption">
          Showing results for <em>"{submittedQuery}"</em>
        </p>
      )}

      {loading && results.length === 0 ? (
        <SkeletonList />
      ) : error ? (
        <>
          <p className="media-search-error">Something went wrong. Try again.</p>
          <div className="media-search-error-actions">
            <button
              type="button"
              className="media-secondary-button ui-text"
              onClick={runSearch}
            >
              Retry
            </button>
          </div>
        </>
      ) : results.length === 0 && submittedQuery ? (
        <p className="media-search-empty">
          No results for "{submittedQuery}". Try a different search.
        </p>
      ) : (
        <div className="media-results-list">
          {results.map((result) => {
            const isShow = result.type === 'show'
            const id = isShow ? showIdOf(result) : episodeIdOf(result)
            return (
              <SearchResultRow
                key={`${result.type}:${id}`}
                result={result}
                isFollowed={isShow && followedIds.has(id)}
                isPinned={isShow && pinnedRefs.has(id)}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
                onPlay={handlePlayEpisode}
              />
            )
          })}
        </div>
      )}

      {unavailableEpisode && (
        <div
          className="media-modal-backdrop"
          onClick={() => setUnavailableEpisode(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Episode unavailable"
        >
          <div className="media-modal" onClick={(e) => e.stopPropagation()}>
            <UnavailableShowMessage
              title={unavailableEpisode.showTitle}
              onBack={() => setUnavailableEpisode(null)}
              layout="dialog"
            />
          </div>
        </div>
      )}

      {!loading && !error && totalCount > 0 && !exhausted && (
        <div className="media-load-more">
          <button
            type="button"
            className="media-secondary-button ui-text"
            onClick={handleLoadMore}
          >
            Load more results
          </button>
        </div>
      )}

      {loading && results.length > 0 && (
        <div className="media-results-list" aria-busy="true">
          <SearchResultRowSkeleton />
          <SearchResultRowSkeleton />
        </div>
      )}
    </PodcastShell>
  )
}

export default PodcastSearchResultsPage
