import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { searchPodcasts, showIdOf, episodeIdOf } from '../../services/podcast'
import { searchMusic } from '../../services/music'
import { resolveSupportedLanguageLabel } from '../../constants/languages'

const RAILS = [
  { key: 'audiobooks', title: 'Recommended Audiobooks', shape: 'portrait', cols: 6 },
  { key: 'podcasts', title: 'Recommended Podcasts', shape: 'square', cols: 6 },
  { key: 'music', title: 'Recommended Music', shape: 'square', cols: 6 },
  { key: 'youtube', title: 'Recommended Videos', shape: 'wide', cols: 4 },
]

const FILTER_CHIPS = ['All', 'Audiobooks', 'Podcasts', 'Music', 'YouTube']

const formatDuration = (ms) => {
  if (!ms) return ''
  const totalSec = Math.round(Number(ms) / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return `${min}:${sec.toString().padStart(2, '0')}`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return `${hr}:${remMin.toString().padStart(2, '0')}`
}

function ResultRow({ row }) {
  return (
    <button type="button" className="listen-deep-row" onClick={row.onClick}>
      <div className={`listen-deep-thumb listen-deep-thumb--${row.shape || 'square'}`}>
        {row.coverUrl ? <img src={row.coverUrl} alt="" /> : <span className="listen-deep-thumb-fallback">{row.title?.[0] || '·'}</span>}
      </div>
      <div className="listen-deep-meta">
        <p className="listen-deep-title">{row.title}</p>
        {row.subtitle && <p className="listen-deep-sub">{row.subtitle}</p>}
      </div>
      {row.trailing && <span className="listen-deep-trailing">{row.trailing}</span>}
    </button>
  )
}

function Rail({ title, cols, shape, items, emptyLabel }) {
  return (
    <section className="listen-shelf">
      <header className="listen-shelf-header">
        <h2 className="listen-shelf-heading">{title}</h2>
      </header>
      {items.length === 0 ? (
        <p className="listen-shelf-empty">{emptyLabel}</p>
      ) : (
        <div className={`listen-shelf-grid listen-shelf-grid--cols-${cols}`}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`listen-shelf-card listen-shelf-card--${shape}`}
              onClick={item.onClick}
            >
              <div className={`listen-shelf-cover listen-shelf-cover--${shape}`}>
                {item.coverUrl ? <img src={item.coverUrl} alt="" /> : <span className="listen-shelf-cover-fallback">{item.title}</span>}
              </div>
              <div className="listen-shelf-meta">
                <p className="listen-shelf-title">{item.title}</p>
                {item.subtitle && <p className="listen-shelf-sub">{item.subtitle}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default function ListenDiscover() {
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [results, setResults] = useState({ podcasts: [], music: { artists: [], albums: [], tracks: [] } })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRssNote, setShowRssNote] = useState(false)
  const requestId = useRef(0)

  const activeLanguage = useMemo(
    () => resolveSupportedLanguageLabel(profile?.lastUsedLanguage, ''),
    [profile?.lastUsedLanguage],
  )

  const hasQuery = query.trim().length > 0

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault?.()
    const q = query.trim()
    if (!q) {
      setResults({ podcasts: [], music: { artists: [], albums: [], tracks: [] } })
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const [podcastResults, musicResults] = await Promise.all([
        searchPodcasts({ query: q, language: activeLanguage || undefined }).catch(() => []),
        searchMusic({ query: q, language: activeLanguage || undefined, uid: user?.uid }).catch(
          () => ({ artists: [], albums: [], tracks: [] }),
        ),
      ])
      if (id !== requestId.current) return
      setResults({ podcasts: podcastResults || [], music: musicResults || { artists: [], albums: [], tracks: [] } })
    } catch (err) {
      if (id !== requestId.current) return
      setError('Search failed. Try again.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [query, activeLanguage, user?.uid])

  // Re-run search when query changes (debounced for free-typing)
  useEffect(() => {
    if (!hasQuery) {
      setResults({ podcasts: [], music: { artists: [], albums: [], tracks: [] } })
      setActiveFilter('All')
      return undefined
    }
    const handle = setTimeout(() => {
      handleSubmit()
    }, 400)
    return () => clearTimeout(handle)
  }, [query, hasQuery, handleSubmit])

  const handlePasteUrl = () => {
    navigate('/importaudio/video')
  }

  // Flatten search results into one row list keyed by medium, then filter by chip
  const resultRows = useMemo(() => {
    const rows = []
    // Podcasts: split show vs episode
    ;(results.podcasts || []).forEach((p) => {
      // The podcast search endpoint returns iTunes/Spotify-shaped raw rows.
      // Use the same field names the legacy podcast search row uses
      // (coverArtUrl, author, itunesCollectionId/Episode, …) so covers,
      // subtitles, and navigation actually work.
      const cover = p.coverArtUrl || p.coverUrl || p.image || ''
      if (p.type === 'episode') {
        const episodeId = episodeIdOf(p)
        const showName = p.showTitle || p.collectionName || p.showName || ''
        rows.push({
          id: `pod-ep-${episodeId || Math.random()}`,
          medium: 'Podcasts',
          coverUrl: cover,
          title: p.title || 'Untitled episode',
          subtitle: showName,
          shape: 'square',
          trailing: formatDuration(
            typeof p.duration === 'number' ? p.duration * 1000 : p.durationMs,
          ),
          onClick: () => episodeId && navigate(`/listen/${episodeId}?source=podcast`),
        })
      } else {
        const showId = showIdOf(p)
        const metaParts = []
        if (p.author) metaParts.push(p.author)
        if (p.episodeCount > 0) {
          metaParts.push(p.episodeCount === 1 ? '1 episode' : `${p.episodeCount} episodes`)
        }
        rows.push({
          id: `pod-show-${showId || Math.random()}`,
          medium: 'Podcasts',
          coverUrl: cover,
          title: p.title || 'Untitled show',
          subtitle: metaParts.join(' · '),
          shape: 'square',
          onClick: () => showId && navigate(`/podcasts/show/${showId}`),
        })
      }
    })
    // Music: tracks + albums + artists
    ;(results.music?.tracks || []).forEach((t) => {
      rows.push({
        id: `mus-tr-${t.id || Math.random()}`,
        medium: 'Music',
        coverUrl: t.coverUrl || '',
        title: t.title || 'Untitled track',
        subtitle: t.artistName || '',
        shape: 'square',
        trailing: formatDuration(t.durationMs),
        onClick: () => t.id && navigate(`/listen/${t.id}?source=music`),
      })
    })
    ;(results.music?.albums || []).forEach((a) => {
      rows.push({
        id: `mus-al-${a.id || Math.random()}`,
        medium: 'Music',
        coverUrl: a.coverUrl || '',
        title: a.title || 'Untitled album',
        subtitle: a.artistName || '',
        shape: 'square',
        onClick: () => a.id && navigate(`/music/album/${a.id}`),
      })
    })
    ;(results.music?.artists || []).forEach((ar) => {
      rows.push({
        id: `mus-ar-${ar.id || Math.random()}`,
        medium: 'Music',
        coverUrl: ar.coverUrl || '',
        title: ar.name || 'Unknown artist',
        subtitle: '',
        shape: 'square',
        onClick: () => ar.id && navigate(`/music/artist/${ar.id}`),
      })
    })
    return rows
  }, [results, navigate])

  const visibleRows = useMemo(() => {
    if (activeFilter === 'All') return resultRows
    return resultRows.filter((r) => r.medium === activeFilter)
  }, [resultRows, activeFilter])

  return (
    <div className="listen-discover">
      <form
        className="discover-search"
        role="search"
        onSubmit={handleSubmit}
      >
        <span className="discover-search-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="search"
          className="discover-search-input"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search across audiobooks, podcasts, music, and videos"
        />
      </form>

      {!hasQuery && (
        <div className="listen-discover-chips">
          <button type="button" className="listen-utility-chip" onClick={handlePasteUrl}>
            + Paste URL
          </button>
          <button
            type="button"
            className="listen-utility-chip"
            onClick={() => setShowRssNote((v) => !v)}
            aria-pressed={showRssNote}
          >
            + Add RSS feed
          </button>
          {showRssNote && (
            <span className="listen-utility-note">RSS-feed import isn't wired up yet.</span>
          )}
        </div>
      )}

      {hasQuery && (
        <div className="listen-filter-chips" role="tablist">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              role="tab"
              aria-selected={activeFilter === chip}
              className={`listen-filter-chip${activeFilter === chip ? ' is-active' : ''}`}
              onClick={() => setActiveFilter(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {!hasQuery && (
        <div className="listen-discover-rails">
          {RAILS.map((rail) => (
            <Rail
              key={rail.key}
              title={rail.title}
              cols={rail.cols}
              shape={rail.shape}
              items={[]}
              emptyLabel="Recommendations coming soon."
            />
          ))}
        </div>
      )}

      {hasQuery && (
        <div className="listen-deep-rows">
          {loading ? (
            <p className="listen-deep-empty">Searching…</p>
          ) : error ? (
            <p className="listen-deep-empty">{error}</p>
          ) : visibleRows.length === 0 ? (
            <p className="listen-deep-empty">No matches.</p>
          ) : (
            visibleRows.map((row) => <ResultRow key={row.id} row={row} />)
          )}
        </div>
      )}
    </div>
  )
}
