import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { fetchGenreShows } from '../services/music'
import MusicShell from '../components/music/MusicShell'
import MusicResults from '../components/music/MusicResults'
import { localizeGenre } from '../components/music/genres'
import useMusicSubscriptions from '../components/music/useMusicSubscriptions'

const PAGE_SIZE = 25

const MusicGenreResultsPage = () => {
  const { genre: genreParam } = useParams()
  const genre = decodeURIComponent(genreParam || '')
  const { profile } = useAuth()
  const {
    followedIds,
    savedAlbumIds,
    pinnedRefs,
    follow,
    unfollow,
    toggleAlbum,
  } = useMusicSubscriptions()
  const [results, setResults] = useState({ artists: [], albums: [] })
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')
  const nativeLanguage = resolveSupportedLanguageLabel(profile?.nativeLanguage, 'English') || 'English'
  const localizedTitle = localizeGenre(genre, nativeLanguage)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setExhausted(false)
    fetchGenreShows({ genre, language, limit: PAGE_SIZE }).then((data) => {
      if (cancelled) return
      const safe = {
        artists: data?.artists || [],
        albums: data?.albums || [],
      }
      setResults(safe)
      const total = safe.artists.length + safe.albums.length
      setExhausted(total < PAGE_SIZE)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [genre, language])

  const totalCount = results.artists.length + results.albums.length

  const handleLoadMore = async () => {
    if (loading || exhausted) return
    setLoading(true)
    const more = await fetchGenreShows({
      genre,
      language,
      limit: PAGE_SIZE,
      offset: totalCount,
    })
    setResults((prev) => ({
      artists: [...prev.artists, ...(more?.artists || [])],
      albums: [...prev.albums, ...(more?.albums || [])],
    }))
    const moreCount = (more?.artists?.length || 0) + (more?.albums?.length || 0)
    if (moreCount < PAGE_SIZE) setExhausted(true)
    setLoading(false)
  }

  return (
    <MusicShell>
      <Link to="/music/discover" className="media-back-link ui-text">
        ← Discover
      </Link>
      <header className="media-results-header">
        <h1 className="media-results-header-title media-results-header-category">
          {localizedTitle}
        </h1>
      </header>

      <MusicResults
        artists={results.artists}
        albums={results.albums}
        followedArtistIds={followedIds}
        savedAlbumIds={savedAlbumIds}
        pinnedRefIds={pinnedRefs}
        onFollow={(artist) => follow(artist)}
        onUnfollow={(artist) => unfollow(artist.id)}
        onToggleAlbum={toggleAlbum}
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

      {!loading && totalCount === 0 && (
        <p className="media-empty-line">No artists or albums in this genre yet.</p>
      )}
    </MusicShell>
  )
}

export default MusicGenreResultsPage
