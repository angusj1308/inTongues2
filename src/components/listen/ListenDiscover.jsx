import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  searchPodcasts,
  showIdOf,
  episodeIdOf,
  followShow,
  unfollowShow,
  saveEpisode,
  fetchShowEpisodes,
  dubPodcastEpisode,
} from '../../services/podcast'
import { searchMusic } from '../../services/music'
import { listPopularSharedAudiobooks } from '../../services/sharedAudiobooks'
import { listPopularMedia, MEDIA_KIND } from '../../services/sharedMedia'
import { prewarmMusicPlayback } from '../../services/musicKit'
import useMusicSubscriptions from '../music/useMusicSubscriptions'
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
const formatPublishedDate = (raw) => {
  if (!raw) return ''
  let d
  if (typeof raw === 'number') {
    d = new Date(raw < 1e12 ? raw * 1000 : raw)
  } else {
    d = new Date(raw)
  }
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

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
  const eyebrowParts = Array.isArray(row.eyebrow)
    ? row.eyebrow.filter(Boolean)
    : (row.eyebrow ? [row.eyebrow] : [])
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
        {eyebrowParts.length > 0 && (
          <div className="listen-deep-eyebrow">
            {eyebrowParts.map((part, i) => <span key={i}>{part}</span>)}
          </div>
        )}
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

// Shape a recommendations bucket into the { id, title, subtitle,
// coverUrl, onClick } items the Rail component renders. Each rail kind
// maps onClick to the existing detail route for that media type, so a
// recommendation click lands on the same page as a library or search
// click would.
function buildRailItems(railKey, recommendations, navigate) {
  if (railKey === 'audiobooks') {
    return (recommendations.audiobooks || []).map((b) => ({
      id: b.id,
      title: b.title || 'Untitled',
      subtitle: b.author || '',
      coverUrl: b.coverImageUrlSquare || b.coverImageUrl || '',
      onClick: () => navigate(`/listen/${b.id}`),
    }))
  }
  if (railKey === 'podcasts') {
    return (recommendations.podcasts || []).map((p) => ({
      id: p.id,
      title: p.title || 'Untitled show',
      subtitle: p.subtitle || '',
      coverUrl: p.coverUrl || '',
      onClick: () => navigate(`/podcasts/show/${p.externalId}`),
    }))
  }
  if (railKey === 'music') {
    return (recommendations.music || []).map((a) => ({
      id: a.id,
      title: a.title || 'Unknown artist',
      subtitle: a.subtitle || 'Artist',
      coverUrl: a.coverUrl || '',
      onClick: () => navigate(`/music/artist/${a.externalId}`),
    }))
  }
  if (railKey === 'youtube') {
    return (recommendations.youtube || []).map((c) => ({
      id: c.id,
      title: c.title || 'Unknown channel',
      subtitle: c.subtitle || '',
      coverUrl: c.coverUrl || '',
      onClick: () => navigate(`/youtube/channel/${c.externalId}`),
    }))
  }
  return []
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
  const {
    follow: musicFollow,
    unfollow: musicUnfollow,
    toggleAlbum: musicToggleAlbum,
    toggleTrack: musicToggleTrack,
    isFollowedArtist,
    isSavedAlbum,
    isSavedTrack,
  } = useMusicSubscriptions()
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
  const [recommendations, setRecommendations] = useState({
    audiobooks: [],
    podcasts: [],
    music: [],
    youtube: [],
  })
  const requestId = useRef(0)

  const activeLanguage = useMemo(
    () => resolveSupportedLanguageLabel(profile?.lastUsedLanguage, ''),
    [profile?.lastUsedLanguage],
  )
  const targetLangCode = useMemo(
    () => toLanguageCode(profile?.lastUsedLanguage) || '',
    [profile?.lastUsedLanguage],
  )

  const libraryData = useListenLibraryData(user?.uid, activeLanguage)
  const importedVideoIds = useMemo(() => {
    const set = new Set()
    ;(libraryData.youtubeVideos || []).forEach((v) => {
      if (v.videoId) set.add(v.videoId)
    })
    return set
  }, [libraryData.youtubeVideos])

  const followedShowIds = useMemo(() => {
    const set = new Set()
    ;(libraryData.followedShows || []).forEach((s) => {
      const id = s.showId || s.id
      if (id) set.add(String(id))
    })
    return set
  }, [libraryData.followedShows])

  const savedEpisodeIds = useMemo(() => {
    const set = new Set()
    ;(libraryData.episodeStates || []).forEach((e) => {
      const id = e.episodeId || e.id
      if (id) set.add(String(id))
    })
    return set
  }, [libraryData.episodeStates])

  const [pendingShowFollow, setPendingShowFollow] = useState(() => new Set())
  const [pendingEpisodeSave, setPendingEpisodeSave] = useState(() => new Set())

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

  // Load popularity-ranked recommendations for each Discover rail. Fires
  // on language change and on mount. Empty arrays are fine — the Rail
  // component falls back to "Recommendations coming soon." when nothing
  // has accumulated popularity yet in this language.
  useEffect(() => {
    if (!activeLanguage) {
      setRecommendations({ audiobooks: [], podcasts: [], music: [], youtube: [] })
      return
    }
    let cancelled = false
    ;(async () => {
      const [audiobooks, podcasts, music, youtube] = await Promise.all([
        listPopularSharedAudiobooks({ language: activeLanguage, max: 12 }),
        listPopularMedia({ kind: MEDIA_KIND.PODCAST_SHOW, language: activeLanguage, max: 12 }),
        listPopularMedia({ kind: MEDIA_KIND.MUSIC_ARTIST, language: activeLanguage, max: 12 }),
        listPopularMedia({ kind: MEDIA_KIND.YOUTUBE_CHANNEL, language: activeLanguage, max: 12 }),
      ])
      if (cancelled) return
      setRecommendations({ audiobooks, podcasts, music, youtube })
    })()
    return () => {
      cancelled = true
    }
  }, [activeLanguage])

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
        publishedAt: v.publishedAt || '',
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
        publishedAt: v.publishedAt || '',
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
        }, activeLanguage)
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

  const handleShowFollow = useCallback(async (p, showId) => {
    if (!user?.uid || !showId) return
    setPendingShowFollow((prev) => new Set(prev).add(showId))
    try {
      if (followedShowIds.has(showId)) {
        await unfollowShow(user.uid, showId)
      } else {
        await followShow(user.uid, {
          id: showId,
          title: p.title || '',
          host: p.author || '',
          coverUrl: p.coverArtUrl || p.coverUrl || p.image || '',
          language: p.language || '',
          category: p.primaryGenre || p.category || '',
        }, activeLanguage)
      }
    } catch (err) {
      console.error('Show follow toggle failed', err)
    } finally {
      setPendingShowFollow((prev) => {
        const next = new Set(prev)
        next.delete(showId)
        return next
      })
    }
  }, [user?.uid, followedShowIds])

  const handleEpisodeSave = useCallback(async (p, episodeId) => {
    if (!user?.uid || !episodeId) return
    if (savedEpisodeIds.has(episodeId)) return
    setPendingEpisodeSave((prev) => new Set(prev).add(episodeId))
    try {
      const durSeconds = typeof p.duration === 'number'
        ? p.duration
        : (typeof p.durationMs === 'number' ? Math.round(p.durationMs / 1000) : 0)
      const publishedAt = p.publishDate
        ? new Date(p.publishDate * 1000).toISOString()
        : (p.publishedAt || '')
      const showId = p.itunesCollectionId || p.collectionId || ''
      const baseMeta = {
        id: episodeId,
        title: p.title || '',
        showName: p.showTitle || p.collectionName || p.showName || '',
        showId,
        coverUrl: p.coverArtUrl || p.coverUrl || p.image || '',
        durationMs: durSeconds * 1000,
        publishedAt,
      }

      // iTunes Search doesn't expose language. Fetch the show's RSS so we
      // can decide silent-save vs. dub-confirm. Server caches the RSS for
      // 1h, so subsequent clicks on the same show return ~instantly.
      let showLang = ''
      let rssAudioUrl = ''
      let creditsPerMin = 0
      if (showId) {
        try {
          const data = await fetchShowEpisodes(showId)
          const match = (data.episodes || []).find(
            (e) => String(e.id) === String(episodeId),
          )
            || (data.episodes || []).find((e) => e.title === p.title)
          if (match) {
            showLang = match.language || ''
            rssAudioUrl = match.audioUrl || ''
          }
          creditsPerMin = data.creditsPerMinute || 0
        } catch (err) {
          console.warn('RSS lookup failed', err)
        }
      }

      const target = targetLangCode || 'auto'
      const normSrc = showLang ? toLanguageCode(showLang) : ''
      if (!normSrc || !target || normSrc === target) {
        // Same language (or unknown) → silent save with the metadata we have.
        await saveEpisode(user.uid, baseMeta, activeLanguage)
      } else {
        // Cross-language → open dub modal with credit estimate. Pre-fill
        // audioUrl from RSS so the modal's Continue path can fire the dub.
        setDubModal({
          kind: 'podcast',
          episode: {
            id: episodeId,
            title: p.title || '',
            audioUrl: rssAudioUrl,
            showName: baseMeta.showName,
            showId,
            coverUrl: baseMeta.coverUrl,
            durationMs: baseMeta.durationMs,
            publishedAt,
          },
          sourceLanguage: normSrc,
          targetLanguage: target,
          creditsPerMinute: creditsPerMin,
        })
      }
    } catch (err) {
      console.error('Episode save failed', err)
    } finally {
      setPendingEpisodeSave((prev) => {
        const next = new Set(prev)
        next.delete(episodeId)
        return next
      })
    }
  }, [user?.uid, savedEpisodeIds, targetLangCode])

  // Flatten search results into one row list keyed by medium, then filter by chip
  const resultRows = useMemo(() => {
    const rows = []
    // Podcasts: split show vs episode
    ;(results.podcasts || []).forEach((p) => {
      const cover = p.coverArtUrl || p.coverUrl || p.image || ''
      if (p.type === 'episode') {
        const episodeId = episodeIdOf(p)
        const showName = p.showTitle || p.collectionName || p.showName || ''
        const episodeShowId = p.itunesCollectionId || p.collectionId || p.showId || ''
        const epSeconds = typeof p.duration === 'number'
          ? p.duration
          : (typeof p.durationMs === 'number' ? Math.round(p.durationMs / 1000) : 0)
        const alreadySaved = savedEpisodeIds.has(String(episodeId))
        const savePending = pendingEpisodeSave.has(episodeId)
        const epDateRaw = p.publishDate || p.publishedAt || p.releaseDate || ''
        rows.push({
          id: `pod-ep-${episodeId || Math.random()}`,
          medium: 'Podcasts',
          coverUrl: cover,
          title: p.title || 'Untitled episode',
          subtitle: showName,
          shape: 'square',
          eyebrow: [formatPublishedDate(epDateRaw), formatVideoDuration(epSeconds)],
          // No in-app play from browse surfaces. Tapping the row navigates
          // to the show page where the user can use '+' to add the episode.
          onClick: () => episodeShowId && navigate(`/podcasts/show/${episodeShowId}`),
          action: episodeId ? {
            variant: 'icon',
            done: alreadySaved,
            disabled: alreadySaved || savePending,
            ariaLabel: alreadySaved ? 'Already in your library' : 'Add to library',
            onClick: () => handleEpisodeSave(p, episodeId),
          } : undefined,
        })
      } else {
        const showId = showIdOf(p)
        const metaParts = []
        if (p.author) metaParts.push(p.author)
        if (p.episodeCount > 0) {
          metaParts.push(p.episodeCount === 1 ? '1 episode' : `${p.episodeCount} episodes`)
        }
        const isFollowed = followedShowIds.has(String(showId))
        const followPending = pendingShowFollow.has(showId)
        rows.push({
          id: `pod-show-${showId || Math.random()}`,
          medium: 'Podcasts',
          coverUrl: cover,
          title: p.title || 'Untitled show',
          subtitle: metaParts.join(' · '),
          shape: 'square',
          onClick: () => showId && navigate(`/podcasts/show/${showId}`),
          action: showId ? {
            variant: 'follow',
            label: followPending ? '…' : (isFollowed ? 'Following' : 'Follow'),
            active: isFollowed,
            disabled: followPending,
            ariaLabel: isFollowed ? `Unfollow ${p.title}` : `Follow ${p.title}`,
            onClick: () => handleShowFollow(p, showId),
          } : undefined,
        })
      }
    })
    // Music: artists → albums → tracks (artist match leads when query is a name).
    ;(results.music?.artists || []).forEach((ar) => {
      const followed = ar.id ? isFollowedArtist(ar.id) : false
      rows.push({
        id: `mus-ar-${ar.id || Math.random()}`,
        medium: 'Music',
        coverUrl: ar.coverUrl || '',
        title: ar.name || 'Unknown artist',
        subtitle: 'Artist',
        shape: 'square',
        onClick: () => ar.id && navigate(`/music/artist/${ar.id}`),
        action: ar.id ? {
          variant: 'follow',
          label: followed ? 'Following' : 'Follow',
          active: followed,
          ariaLabel: followed ? `Unfollow ${ar.name}` : `Follow ${ar.name}`,
          onClick: () => {
            if (followed) musicUnfollow(ar.id)
            else musicFollow({ id: ar.id, name: ar.name, coverUrl: ar.coverUrl, genres: ar.genres })
          },
        } : undefined,
      })
    })
    ;(results.music?.albums || []).forEach((a) => {
      const saved = a.id ? isSavedAlbum(a.id) : false
      rows.push({
        id: `mus-al-${a.id || Math.random()}`,
        medium: 'Music',
        coverUrl: a.coverUrl || '',
        title: a.title || 'Untitled album',
        subtitle: [a.artistName, a.year].filter(Boolean).join(' · '),
        shape: 'square',
        onClick: () => a.id && navigate(`/music/album/${a.id}`),
        action: a.id ? {
          variant: 'icon',
          done: saved,
          ariaLabel: saved ? 'Saved to your library' : 'Save album',
          onClick: () => musicToggleAlbum(a, !saved),
        } : undefined,
      })
    })
    const musicTrackQueue = (results.music?.tracks || []).map((t) => t.id).filter(Boolean)
    ;(results.music?.tracks || []).forEach((t, index) => {
      const saved = t.id ? isSavedTrack(t.id) : false
      rows.push({
        id: `mus-tr-${t.id || Math.random()}`,
        medium: 'Music',
        coverUrl: t.coverUrl || '',
        title: t.title || 'Untitled track',
        subtitle: [t.artistName, t.albumName].filter(Boolean).join(' · '),
        shape: 'square',
        trailing: formatDuration(t.durationMs),
        onClick: () => {
          if (!t.id) return
          prewarmMusicPlayback(t.id, { queue: musicTrackQueue })
          navigate(`/listen/${t.id}?source=music`, {
            state: { queue: musicTrackQueue, startIndex: index, contextLabel: 'Search results' },
          })
        },
        action: t.id ? {
          variant: 'icon',
          done: saved,
          ariaLabel: saved ? 'Saved to your library' : 'Save track',
          onClick: () => musicToggleTrack(t, !saved),
        } : undefined,
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
        eyebrow: [formatPublishedDate(v.publishedAt), formatVideoDuration(v.durationSeconds)],
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
    followedShowIds,
    pendingShowFollow,
    savedEpisodeIds,
    pendingEpisodeSave,
    handleVideoAdd,
    handleChannelFollow,
    handleShowFollow,
    handleEpisodeSave,
    isFollowedArtist,
    isSavedAlbum,
    isSavedTrack,
    musicFollow,
    musicUnfollow,
    musicToggleAlbum,
    musicToggleTrack,
  ])

  const visibleRows = useMemo(() => {
    if (activeFilter === 'All') return resultRows
    return resultRows.filter((r) => r.medium === activeFilter)
  }, [resultRows, activeFilter])

  const dubEstimate = useMemo(() => {
    if (!dubModal) return { credits: 0, minutes: 0 }
    if (dubModal.kind === 'podcast' && dubModal.episode) {
      const ms = Number(dubModal.episode.durationMs) || 0
      const minutes = Math.ceil(ms / 60000)
      const credits = minutes * (Number(dubModal.creditsPerMinute) || 0)
      return { credits, minutes }
    }
    if (dubModal.video) {
      const dur = Number(dubModal.video.durationSeconds) || 0
      const minutes = Math.ceil(dur / 60)
      const credits = minutes * (Number(results.creditsPerMinute) || 0)
      return { credits, minutes }
    }
    return { credits: 0, minutes: 0 }
  }, [dubModal, results.creditsPerMinute])

  const firePodcastDub = useCallback(async () => {
    if (!user?.uid || !dubModal?.episode || dubModal.kind !== 'podcast') return
    setDubPending(true)
    try {
      await dubPodcastEpisode({
        uid: user.uid,
        episode: dubModal.episode,
        sourceLanguage: dubModal.sourceLanguage,
        targetLanguage: dubModal.targetLanguage,
      })
      setDubModal(null)
    } catch (err) {
      console.error('Podcast dub failed', err)
      setError('Dub failed. Try again.')
    } finally {
      setDubPending(false)
    }
  }, [user?.uid, dubModal])

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
          {RAILS.map((rail) => {
            const items = buildRailItems(rail.key, recommendations, navigate)
            return (
              <Rail
                key={rail.key}
                title={rail.title}
                cols={rail.cols}
                shape={rail.shape}
                items={items}
                emptyLabel="Recommendations coming soon."
              />
            )
          })}
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
        video={dubModal?.kind === 'podcast' ? dubModal.episode : dubModal?.video}
        estimatedCredits={dubEstimate.credits}
        durationMin={dubEstimate.minutes}
        pending={dubPending}
        onCancel={() => !dubPending && setDubModal(null)}
        onConfirm={() => {
          if (!dubModal) return
          if (dubModal.kind === 'podcast') {
            firePodcastDub()
          } else {
            fireDub(dubModal.video, {
              sourceLanguage: dubModal.sourceLanguage,
              targetLanguage: dubModal.targetLanguage,
            })
          }
        }}
      />
    </div>
  )
}
