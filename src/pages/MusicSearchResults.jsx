import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { searchMusic } from '../services/music'
import MusicShell from '../components/music/MusicShell'
import MusicResults from '../components/music/MusicResults'
import useMusicSubscriptions from '../components/music/useMusicSubscriptions'

const PAGE_SIZE = 25

const MusicSearchResultsPage = () => {
  const [params] = useSearchParams()
  const { user, profile } = useAuth()
  const {
    followedIds,
    savedAlbumIds,
    savedTrackIds,
    pinnedRefs,
    follow,
    unfollow,
    toggleAlbum,
    toggleTrack,
  } = useMusicSubscriptions()
  const query = params.get('q') || ''
  const [results, setResults] = useState({ artists: [], albums: [], tracks: [] })
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')

  useEffect(() => {
    let cancelled = false
    if (!query.trim()) {
      setResults({ artists: [], albums: [], tracks: [] })
      setExhausted(true)
      return
    }
    if (!user?.uid) return
    setLoading(true)
    setExhausted(false)
    searchMusic({ query, language, limit: PAGE_SIZE, uid: user.uid }).then((data) => {
      if (cancelled) return
      const safe = {
        artists: data?.artists || [],
        albums: data?.albums || [],
        tracks: data?.tracks || [],
      }
      setResults(safe)
      const total = safe.artists.length + safe.albums.length + safe.tracks.length
      setExhausted(total < PAGE_SIZE)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [query, language, user?.uid])

  const totalCount =
    results.artists.length + results.albums.length + results.tracks.length

  const handleLoadMore = async () => {
    if (loading || exhausted) return
    setLoading(true)
    const more = await searchMusic({
      query,
      language,
      limit: PAGE_SIZE,
      offset: totalCount,
      uid: user?.uid,
    })
    setResults((prev) => ({
      artists: [...prev.artists, ...(more?.artists || [])],
      albums: [...prev.albums, ...(more?.albums || [])],
      tracks: [...prev.tracks, ...(more?.tracks || [])],
    }))
    const moreCount =
      (more?.artists?.length || 0) + (more?.albums?.length || 0) + (more?.tracks?.length || 0)
    if (moreCount < PAGE_SIZE) setExhausted(true)
    setLoading(false)
  }

  return (
    <MusicShell>
      <Link to="/music/discover" className="media-back-link ui-text">
        ← Discover
      </Link>
      <header className="media-results-header">
        <h1 className="media-results-header-title">
          Results for <em>"{query}"</em>
        </h1>
        <p className="media-results-header-count">
          {loading && totalCount === 0 ? 'Searching…' : `${totalCount} result${totalCount === 1 ? '' : 's'}`}
        </p>
      </header>

      <MusicResults
        artists={results.artists}
        albums={results.albums}
        tracks={results.tracks}
        followedArtistIds={followedIds}
        savedAlbumIds={savedAlbumIds}
        savedTrackIds={savedTrackIds}
        pinnedRefIds={pinnedRefs}
        onFollow={(artist) => follow(artist)}
        onUnfollow={(artist) => unfollow(artist.id)}
        onToggleAlbum={toggleAlbum}
        onToggleTrack={toggleTrack}
      />

      {!exhausted && totalCount > 0 && (
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
    </MusicShell>
  )
}

export default MusicSearchResultsPage
