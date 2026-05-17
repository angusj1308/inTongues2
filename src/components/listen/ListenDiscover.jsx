import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { searchPodcasts, showIdOf, episodeIdOf } from '../../services/podcast'
import { searchMusic } from '../../services/music'
import { searchYouTube, importYoutubeVideo, dubYoutubeVideo } from '../../services/youtube'
import {
  subscribeFollowedChannels,
  followChannel,
  unfollowChannel,
} from '../../services/youtubeChannels'
import {
  resolveSupportedLanguageLabel,
  toLanguageCode,
} from '../../constants/languages'
import useListenLibraryData from './useListenLibraryData'
import DubConfirmModal from './DubConfirmModal'

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

// Long-form / video friendly: "2h 9min", "47min", "<1min". H:MM is too
// easy to misread as MM:SS when a 2-hour podcast lands beside a 2-minute
// clip in the same list.
const formatVideoDuration = (seconds) => {
  const total = Number(seconds) || 0
  if (total <= 0) return ''
  if (total < 60) return '<1min'
  const hr = Math.floor(total / 3600)
  const min = Math.floor((total % 3600) / 60)
  if (hr > 0) return min > 0 ? `${hr}h ${min}min` : `${hr}h`
  return `${min}min`
}

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

function ResultRow({ row }) {
  const handlePreview = (e) => {
    if (!row.onClick) return
    if (e.target.closest('[data-row-action]')) return
    row.onClick()
  }
  const action = row.action
  const renderAction = () => {
    if (!action) return null
    if (action.variant === 'follow') {
      return (
        <button
          type="button"
          data-row-action
          className={`media-follow-button small${action.active ? ' is-followed' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            action.onClick?.()
          }}
          disabled={action.disabled}
          aria-pressed={!!action.active}
          aria-label={action.ariaLabel || action.label}
        >
          {action.label}
        </button>
      )
    }
    if (action.variant === 'icon') {
      return (
        <button
          type="button"
          data-row-action
          className={`media-icon-button${action.done ? ' is-saved' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            action.onClick?.()
          }}
          disabled={action.disabled}
          aria-label={action.ariaLabel || 'Add'}
          aria-pressed={action.done || undefined}
        >
          {action.done ? <CheckIcon /> : <PlusIcon />}
        </button>
      )
    }
    return (
      <button
        type="button"
        data-row-action
        className={`listen-deep-action${action.active ? ' is-active' : ''}${action.done ? ' is-done' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          action.onClick?.()
        }}
        disabled={action.disabled}
        aria-label={action.ariaLabel || action.label}
      >
        {action.label}
      </button>
    )
  }
  return (
    <div className="listen-deep-row" onClick={handlePreview} role="button" tabIndex={0}>
      <div className={`listen-deep-thumb listen-deep-thumb--${row.shape || 'square'}`}>
        {row.coverUrl ? (
          <img src={row.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="listen-deep-thumb-fallback">{row.title?.[0] || '·'}</span>
        )}
      </div>
      <div className="listen-deep-meta">
        <p className="listen-deep-title">{row.title}</p>
        {row.subtitle && <p className="listen-deep-sub">{row.subtitle}</p>}
      </div>
      {row.trailing && (
        <span
          className={`listen-deep-trailing${row.trailingNatural ? ' listen-deep-trailing--natural' : ''}`}
        >
          {row.trailing}
        </span>
      )}
      {renderAction()}
    </div>
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
  const [results, setResults] = useState({
    podcasts: [],
    music: { artists: [], albums: [], tracks: [] },
    youtube: [],
    creditsPerMinute: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingImports, setPendingImports] = useState(() => new Set())
  const [sessionImported, setSessionImported] = useState(() => new Set())
  const [followedChannels, setFollowedChannels] = useState([])
  const [pendingFollow, setPendingFollow] = useState(() => new Set())
  const [dubModal, setDubModal] = useState(null)
  const [dubPending, setDubPending] = useState(false)
  const requestId = useRef(0)

  const libraryData = useListenLibraryData(user?.uid)
  const importedVideoIds = useMemo(() => {
    const set = new Set()
    ;(libraryData.youtubeVideos || []).forEach((v) => {
      if (v.videoId) set.add(v.videoId)
    })
    return set
  }, [libraryData.youtubeVideos])

  const followedChannelIds = useMemo(() => {
    const set = new Set()
    followedChannels.forEach((c) => {
      if (c.channelId) set.add(c.channelId)
    })
    return set
  }, [followedChannels])

  useEffect(() => {
    if (!user?.uid) {
      setFollowedChannels([])
      return undefined
    }
    return subscribeFollowedChannels(user.uid, setFollowedChannels)
  }, [user?.uid])

  const activeLanguage = useMemo(
    () => resolveSupportedLanguageLabel(profile?.lastUsedLanguage, ''),
    [profile?.lastUsedLanguage],
  )
  const targetLangCode = useMemo(
    () => toLanguageCode(profile?.lastUsedLanguage) || '',
    [profile?.lastUsedLanguage],
  )

  const hasQuery = query.trim().length > 0

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault?.()
    const q = query.trim()
    if (!q) {
      setResults({ podcasts: [], music: { artists: [], albums: [], tracks: [] }, youtube: [], creditsPerMinute: 0 })
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const [podcastResults, musicResults, youtubeResponse] = await Promise.all([
        searchPodcasts({ query: q, language: activeLanguage || undefined }).catch(() => []),
        searchMusic({ query: q, language: activeLanguage || undefined, uid: user?.uid }).catch(
          () => ({ artists: [], albums: [], tracks: [] }),
        ),
        searchYouTube({ query: q }).catch(() => ({ results: [], creditsPerMinute: 0 })),
      ])
      if (id !== requestId.current) return
      setResults({
        podcasts: podcastResults || [],
        music: musicResults || { artists: [], albums: [], tracks: [] },
        youtube: youtubeResponse?.results || [],
        creditsPerMinute: youtubeResponse?.creditsPerMinute || 0,
      })
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
      setResults({ podcasts: [], music: { artists: [], albums: [], tracks: [] }, youtube: [], creditsPerMinute: 0 })
      setActiveFilter('All')
      return undefined
    }
    const handle = setTimeout(() => {
      handleSubmit()
    }, 400)
    return () => clearTimeout(handle)
  }, [query, hasQuery, handleSubmit])

  const markPending = (videoId, on) => {
    setPendingImports((prev) => {
      const next = new Set(prev)
      if (on) next.add(videoId)
      else next.delete(videoId)
      return next
    })
  }

  const fireImport = useCallback(async (v, { sourceLanguage, targetLanguage }) => {
    if (!user?.uid) return
    markPending(v.videoId, true)
    try {
      await importYoutubeVideo({
        title: v.title || 'Untitled video',
        youtubeUrl: v.youtubeUrl,
        uid: user.uid,
        language: targetLanguage || 'auto',
      })
      setSessionImported((prev) => new Set(prev).add(v.videoId))
    } catch (err) {
      console.error('Import failed', err)
      setError('Import failed. Try again.')
    } finally {
      markPending(v.videoId, false)
    }
  }, [user?.uid])

  const fireDub = useCallback(async (v, { sourceLanguage, targetLanguage }) => {
    if (!user?.uid) return
    setDubPending(true)
    try {
      await dubYoutubeVideo({
        title: v.title || 'Untitled video',
        youtubeUrl: v.youtubeUrl,
        uid: user.uid,
        sourceLanguage: sourceLanguage || 'auto',
        targetLanguage,
      })
      setSessionImported((prev) => new Set(prev).add(v.videoId))
      setDubModal(null)
    } catch (err) {
      console.error('Dub failed', err)
      setError('Dub failed. Try again.')
    } finally {
      setDubPending(false)
    }
  }, [user?.uid])

  const handleVideoAdd = useCallback((v) => {
    if (!user?.uid || !v?.videoId) return
    const target = targetLangCode || 'auto'
    const rawSrc = v.defaultAudioLanguage || v.defaultLanguage || v.detectedLanguage || ''
    const normSrc = rawSrc ? toLanguageCode(rawSrc) : ''
    if (!normSrc || !target || normSrc === target) {
      fireImport(v, { sourceLanguage: 'auto', targetLanguage: target })
    } else {
      setDubModal({
        video: v,
        sourceLanguage: normSrc,
        targetLanguage: target,
      })
    }
  }, [user?.uid, targetLangCode, fireImport])

  const handleChannelFollow = useCallback(async (c) => {
    if (!user?.uid || !c?.channelId) return
    const channelId = c.channelId
    setPendingFollow((prev) => new Set(prev).add(channelId))
    try {
      if (followedChannelIds.has(channelId)) {
        await unfollowChannel(user.uid, channelId)
      } else {
        await followChannel(user.uid, {
          id: channelId,
          title: c.title || '',
          description: c.description || '',
          coverUrl: c.thumbnailUrl || '',
        })
      }
    } catch (err) {
      console.error('Channel follow toggle failed', err)
    } finally {
      setPendingFollow((prev) => {
        const next = new Set(prev)
        next.delete(channelId)
        return next
      })
    }
  }, [user?.uid, followedChannelIds])

  // Flatten search results into one row list keyed by medium, then filter by chip
  const resultRows = useMemo(() => {
    const rows = []
    // Podcasts: split show vs episode
    ;(results.podcasts || []).forEach((p) => {
      const cover = p.coverArtUrl || p.coverUrl || p.image || ''
      if (p.type === 'episode') {
        const episodeId = episodeIdOf(p)
        const showName = p.showTitle || p.collectionName || p.showName || ''
        const epSeconds = typeof p.duration === 'number'
          ? p.duration
          : (typeof p.durationMs === 'number' ? Math.round(p.durationMs / 1000) : 0)
        rows.push({
          id: `pod-ep-${episodeId || Math.random()}`,
          medium: 'Podcasts',
          coverUrl: cover,
          title: p.title || 'Untitled episode',
          subtitle: showName,
          shape: 'square',
          trailing: formatVideoDuration(epSeconds),
          trailingNatural: true,
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
    // YouTube. Row click previews on youtube.com in a new tab; the trailing
    // action button is the actual import / follow trigger.
    ;(results.youtube || []).forEach((v) => {
      if (v.kind === 'channel') {
        const isFollowed = followedChannelIds.has(v.channelId)
        const isPending = pendingFollow.has(v.channelId)
        rows.push({
          id: `yt-ch-${v.channelId}`,
          medium: 'YouTube',
          coverUrl: v.thumbnailUrl || '',
          title: v.title || 'Unknown channel',
          subtitle: 'Channel',
          shape: 'square',
          onClick: () => v.channelId && navigate(`/youtube/channel/${v.channelId}`),
          action: {
            variant: 'follow',
            label: isPending ? '…' : (isFollowed ? 'Following' : 'Follow'),
            active: isFollowed,
            disabled: isPending,
            ariaLabel: isFollowed ? `Unfollow ${v.title}` : `Follow ${v.title}`,
            onClick: () => handleChannelFollow(v),
          },
        })
        return
      }
      const alreadyImported = importedVideoIds.has(v.videoId) || sessionImported.has(v.videoId)
      const isPending = pendingImports.has(v.videoId)
      rows.push({
        id: `yt-${v.videoId}`,
        medium: 'YouTube',
        coverUrl: v.thumbnailUrl || '',
        title: v.title || 'Untitled video',
        subtitle: v.channelTitle || '',
        shape: 'wide',
        trailing: formatVideoDuration(v.durationSeconds),
        trailingNatural: true,
        onClick: () => v.youtubeUrl && window.open(v.youtubeUrl, '_blank', 'noopener,noreferrer'),
        action: {
          variant: 'icon',
          done: alreadyImported,
          disabled: alreadyImported || isPending,
          ariaLabel: alreadyImported ? 'Already in your library' : 'Add to library',
          onClick: () => handleVideoAdd(v),
        },
      })
    })
    return rows
  }, [
    results,
    navigate,
    importedVideoIds,
    sessionImported,
    pendingImports,
    followedChannelIds,
    pendingFollow,
    handleVideoAdd,
    handleChannelFollow,
  ])

  const visibleRows = useMemo(() => {
    if (activeFilter === 'All') return resultRows
    return resultRows.filter((r) => r.medium === activeFilter)
  }, [resultRows, activeFilter])

  const dubEstimate = useMemo(() => {
    if (!dubModal?.video) return { credits: 0, minutes: 0 }
    const dur = Number(dubModal.video.durationSeconds) || 0
    const minutes = Math.ceil(dur / 60)
    const credits = minutes * (Number(results.creditsPerMinute) || 0)
    return { credits, minutes }
  }, [dubModal, results.creditsPerMinute])

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

      <DubConfirmModal
        open={!!dubModal}
        video={dubModal?.video}
        estimatedCredits={dubEstimate.credits}
        durationMin={dubEstimate.minutes}
        pending={dubPending}
        onCancel={() => !dubPending && setDubModal(null)}
        onConfirm={() => dubModal && fireDub(dubModal.video, {
          sourceLanguage: dubModal.sourceLanguage,
          targetLanguage: dubModal.targetLanguage,
        })}
      />
    </div>
  )
}
