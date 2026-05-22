import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { prewarmMusicPlayback } from '../../services/musicKit'
import { playPodcastEpisode } from '../../services/podcast'
import { incrementSharedAudiobookPopularity } from '../../services/sharedAudiobooks'
import { getYouTubeThumbnailFromVideo } from '../../utils/youtube'
import useListenLibraryData, { pickContinueListening } from './useListenLibraryData'
import MusicKitConnect from '../music/MusicKitConnect'

const SHELVES = [
  { key: 'podcasts', title: 'Podcasts', cover: 'square', cols: 6 },
  { key: 'youtube', title: 'YouTube', cover: 'wide', cols: 4 },
  { key: 'music', title: 'Music', cover: 'square', cols: 6 },
  { key: 'audiobooks', title: 'Audiobooks', cover: 'square', cols: 6 },
]

function continueSubtitle(item) {
  if (!item) return ''
  if (item.medium === 'audiobook') {
    return item.progress > 0 ? `${item.progress}% complete` : 'Just started'
  }
  if (item.medium === 'podcast') {
    if (!item.durationMs) return 'In progress'
    const remainingMs = Math.max(0, item.durationMs - item.progressMs)
    const remainingMin = Math.round(remainingMs / 60000)
    return `${remainingMin} min remaining`
  }
  if (item.medium === 'video') {
    return item.progress > 0 ? `${item.progress}% watched` : 'In your queue'
  }
  return ''
}

function continueCtaLabel(item) {
  if (!item) return 'Play →'
  if (item.medium === 'music') return 'Play →'
  return 'Resume →'
}

function ContinueListeningHero({ item, onPlay }) {
  if (!item) return null
  const coverShape = item.medium === 'video' ? 'wide' : 'square'
  const coverClass = `listen-continue-cover listen-continue-cover--${coverShape}`
  const showProgress = item.medium !== 'music'
  const progressPct = Math.max(0, Math.min(100, Number(item.progress) || 0))

  return (
    <section className="listen-continue-section" aria-label="Continue listening">
      <div className="listen-continue-card">
        <button
          type="button"
          className={coverClass}
          onClick={() => onPlay(item)}
          aria-label={`Resume ${item.title}`}
        >
          {item.coverUrl ? (
            <img src={item.coverUrl} alt="" />
          ) : (
            <span className="listen-continue-cover-fallback">{item.title}</span>
          )}
        </button>
        <div className="listen-continue-body">
          <p className="listen-continue-eyebrow">Continue Listening</p>
          <p className="listen-continue-headline">
            <button
              type="button"
              className="listen-continue-title"
              onClick={() => onPlay(item)}
            >
              {item.title}
            </button>
            {item.creator && (
              <span className="listen-continue-byline">
                {' '}by <span className="listen-continue-creator">{item.creator}</span>
              </span>
            )}
          </p>
          {showProgress && (
            <div className="listen-continue-progress" aria-hidden="true">
              <div className="listen-continue-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          )}
          <div className="listen-continue-foot">
            <p className="listen-continue-meta">{continueSubtitle(item)}</p>
            <button
              type="button"
              className="listen-continue-button"
              onClick={() => onPlay(item)}
            >
              {continueCtaLabel(item)}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function ShelfCard({ shape, coverUrl, title, subtitle, trailing, onClick, ariaLabel, disabled }) {
  const metaParts = [subtitle, trailing].filter(Boolean)
  return (
    <button
      type="button"
      className={`listen-shelf-card listen-shelf-card--${shape}${disabled ? ' is-disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      aria-label={ariaLabel || title}
      disabled={disabled}
    >
      <div className={`listen-shelf-cover listen-shelf-cover--${shape}`}>
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <span className="listen-shelf-cover-fallback">{title}</span>
        )}
        <div className="listen-shelf-hover">
          <div className="listen-shelf-hover-title">{title}</div>
          {metaParts.length > 0 && (
            <div className="listen-shelf-hover-meta">{metaParts.join(' · ')}</div>
          )}
        </div>
      </div>
    </button>
  )
}

function AllMineTile({ shape, label, onClick }) {
  return (
    <button
      type="button"
      className={`listen-shelf-card listen-shelf-card--${shape} listen-shelf-allmine`}
      onClick={onClick}
    >
      <div className={`listen-shelf-cover listen-shelf-cover--${shape} listen-shelf-allmine-cover`}>
        <span className="listen-shelf-allmine-label">{label}</span>
        <span className="listen-shelf-allmine-arrow">View →</span>
      </div>
    </button>
  )
}

function MusicColdStart({ onBrowse }) {
  return (
    <div className="listen-shelf-coldstart">
      <p className="listen-shelf-coldstart-headline">No music yet.</p>
      <p className="listen-shelf-coldstart-sub">
        Connect your Apple Music to import your library, or browse to follow an artist.
      </p>
      <div className="listen-shelf-coldstart-actions">
        <MusicKitConnect />
        <button
          type="button"
          className="listen-shelf-coldstart-cta"
          onClick={onBrowse}
        >
          Browse music in Discover →
        </button>
      </div>
    </div>
  )
}

export default function ListenLibrary() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const activeLanguage = useMemo(
    () => resolveSupportedLanguageLabel(profile?.lastUsedLanguage, ''),
    [profile?.lastUsedLanguage],
  )
  const data = useListenLibraryData(user?.uid, activeLanguage)

  const continueItem = useMemo(() => pickContinueListening(data), [data])

  // -- Audiobooks shelf: books (unchanged) ----------------------------------
  const audiobookCards = useMemo(
    () => data.audiobooks
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        title: b.storyTitle || b.title || 'Untitled',
        subtitle: b.author || '',
        trailing: '',
        coverUrl: b.coverImageUrlSquare || b.coverImageUrl || '',
        onClick: () => {
          if (b.sharedAudiobookId) {
            incrementSharedAudiobookPopularity(b.sharedAudiobookId)
          }
          navigate(`/listen/${b.id}`)
        },
      })),
    [data.audiobooks, navigate],
  )

  // -- Podcasts shelf: subscribed shows -------------------------------------
  // Episode count per show comes from the user's episodeStates (the only
  // per-user episode signal we have client-side).
  const episodeCountByShow = useMemo(() => {
    const counts = {}
    data.episodeStates.forEach((e) => {
      const sid = e.showId || e.show_id || ''
      if (!sid) return
      counts[sid] = (counts[sid] || 0) + 1
    })
    return counts
  }, [data.episodeStates])

  const podcastCards = useMemo(
    () => [...data.followedShows]
      .sort((a, b) => {
        const at = a.followedAt?.toMillis?.() || 0
        const bt = b.followedAt?.toMillis?.() || 0
        return bt - at
      })
      .slice(0, 5)
      .map((s) => {
        const showId = s.showId || s.id
        const count = episodeCountByShow[showId] || 0
        return {
          id: s.id,
          title: s.title || 'Untitled show',
          subtitle: s.host || '',
          trailing: count > 0 ? (count === 1 ? '1 episode' : `${count} episodes`) : '',
          coverUrl: s.coverUrl || '',
          onClick: () => navigate(`/podcasts/show/${showId}`),
        }
      }),
    [data.followedShows, episodeCountByShow, navigate],
  )

  // -- YouTube shelf: saved playlists + followed channels (+ derived) -------
  // Cascade priority: saved playlists → explicitly-followed channels →
  // derived channels (grouped from imported videos, fallback for users
  // who haven't followed anyone yet). Cap at 4 total tiles so the row
  // stays one neat line.
  const YOUTUBE_SHELF_LIMIT = 4
  const channelCards = useMemo(() => {
    const playlistCards = (data.savedPlaylists || [])
      .slice()
      .sort((a, b) => (b.savedAt?.toMillis?.() || 0) - (a.savedAt?.toMillis?.() || 0))
      .map((p) => ({
        id: `yt-pl-${p.playlistId}`,
        title: p.title || 'Untitled playlist',
        subtitle: p.channelTitle || 'Playlist',
        trailing: Number.isFinite(p.videoCount)
          ? (p.videoCount === 1 ? '1 video' : `${p.videoCount} videos`)
          : 'Playlist',
        coverUrl: p.coverUrl,
        onClick: () => navigate(`/youtube/playlist/${p.playlistId}`),
      }))

    const followedChannelIds = new Set(
      (data.followedYoutubeChannels || []).map((c) => c.channelId).filter(Boolean),
    )

    const followedChannelCards = (data.followedYoutubeChannels || [])
      .slice()
      .sort((a, b) => (b.followedAt?.toMillis?.() || 0) - (a.followedAt?.toMillis?.() || 0))
      .map((c) => ({
        id: `yt-ch-${c.channelId || c.id}`,
        title: c.title || 'Untitled channel',
        subtitle: 'Channel',
        trailing: '',
        coverUrl: c.coverUrl || '',
        onClick: () => c.channelId && navigate(`/youtube/channel/${c.channelId}`),
      }))

    // Derived channels only fill in gaps where the user has imported
    // videos from a channel they haven't explicitly followed.
    const derivedMap = new Map()
    data.youtubeVideos.forEach((v) => {
      const key = v.channelId || v.channelTitle || 'Unknown'
      if (followedChannelIds.has(key)) return
      const thumb = v.coverUrl || v.thumbnailUrl || getYouTubeThumbnailFromVideo(v)
      const existing = derivedMap.get(key) || {
        id: key,
        title: v.channelTitle || 'Unknown channel',
        coverUrl: thumb,
        count: 0,
      }
      existing.count += 1
      if (!existing.coverUrl) existing.coverUrl = thumb
      derivedMap.set(key, existing)
    })
    const derivedChannelCards = [...derivedMap.values()]
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        id: `yt-ch-derived-${c.id}`,
        title: c.title,
        subtitle: '',
        trailing: c.count === 1 ? '1 video' : `${c.count} videos`,
        coverUrl: c.coverUrl,
        // Derived channels (no follow doc) don't have a channelId we can
        // trust for the channel page route — defer to the deep view's
        // Videos tab so the user still has somewhere to land.
        onClick: () => navigate('/listen/library/youtube'),
      }))

    return [...playlistCards, ...followedChannelCards, ...derivedChannelCards]
      .slice(0, YOUTUBE_SHELF_LIMIT)
  }, [data.savedPlaylists, data.followedYoutubeChannels, data.youtubeVideos, navigate])

  // -- Music shelf: cascade ------------------------------------------------
  // Albums → followed artists → saved tracks, all visible together in the
  // shelf row (capped at 5 total tiles). Playlists slot in between artists
  // and tracks once a playlist data source exists.
  const MUSIC_SHELF_LIMIT = 5
  const musicShelf = useMemo(() => {
    const albumCards = [...data.savedAlbums]
      .sort((a, b) => (b.savedAt?.toMillis?.() || 0) - (a.savedAt?.toMillis?.() || 0))
      .map((a) => ({
        id: `mus-al-${a.id}`,
        title: a.title || 'Untitled album',
        subtitle: a.artistName || '',
        trailing: a.year ? String(a.year) : '',
        coverUrl: a.coverUrl || '',
        onClick: () => navigate(`/music/album/${a.albumId || a.id}`),
      }))
    const artistCards = [...data.followedArtists]
      .sort((a, b) => (b.followedAt?.toMillis?.() || 0) - (a.followedAt?.toMillis?.() || 0))
      .map((a) => ({
        id: `mus-ar-${a.id}`,
        title: a.name || 'Unknown artist',
        subtitle: 'Artist',
        trailing: '',
        coverUrl: a.coverUrl || '',
        onClick: () => navigate(`/music/artist/${a.artistId || a.id}`),
      }))
    const sortedTracks = [...data.savedTracks]
      .sort((a, b) => (b.savedAt?.toMillis?.() || 0) - (a.savedAt?.toMillis?.() || 0))
    const trackQueue = sortedTracks.map((t) => t.trackId || t.id).filter(Boolean)
    const trackCards = sortedTracks
      .map((t, index) => ({
        id: `mus-tr-${t.id}`,
        title: t.title || 'Untitled track',
        subtitle: t.artistName || '',
        trailing: t.albumName || '',
        coverUrl: t.coverUrl || '',
        onClick: () => {
          const trackId = t.trackId || t.id
          prewarmMusicPlayback(trackId, { queue: trackQueue })
          navigate(`/listen/${trackId}?source=music`, {
            state: { queue: trackQueue, startIndex: index, contextLabel: 'My Music' },
          })
        },
      }))
    const cards = [...albumCards, ...artistCards, ...trackCards].slice(0, MUSIC_SHELF_LIMIT)
    return { kind: cards.length ? 'mixed' : 'empty', cards }
  }, [data.savedAlbums, data.followedArtists, data.savedTracks, navigate])

  const shelfData = {
    audiobooks: audiobookCards,
    podcasts: podcastCards,
    music: musicShelf.cards,
    youtube: channelCards,
  }

  const handlePlayContinue = (item) => {
    if (!item) return
    // Podcasts need the RSS-resolve-then-pass-state dance so the AudioPlayer
    // gets the audioUrl. Other mediums can take the direct navigate path.
    if (item.medium === 'podcast') {
      playPodcastEpisode(
        {
          id: item.episodeId,
          episodeId: item.episodeId,
          title: item.title,
          showName: item.creator,
          showId: item.showId,
          coverUrl: item.coverUrl,
          durationMs: item.durationMs,
        },
        navigate,
      )
      return
    }
    // Music: prewarm MusicKit in the click gesture (same flow as the
    // saved-tracks shelf) so the "preparing" overlay can show and the
    // player doesn't fall back to the previously-queued track.
    if (item.medium === 'music' && item.id) {
      prewarmMusicPlayback(item.id, { queue: [item.id] })
      navigate(`/listen/${item.id}?source=music`, {
        state: { queue: [item.id], startIndex: 0, contextLabel: 'Continue Listening' },
      })
      return
    }
    if (item.playHref) navigate(item.playHref)
  }

  return (
    <div className="listen-library">
      <ContinueListeningHero item={continueItem} onPlay={handlePlayContinue} />

      {SHELVES.map((shelf) => {
        const cards = shelfData[shelf.key] || []
        const isMusicEmpty = shelf.key === 'music' && musicShelf.kind === 'empty'
        return (
          <section key={shelf.key} className="listen-shelf">
            <header className="listen-shelf-header">
              <h2 className="listen-shelf-heading">{shelf.title}</h2>
              {!isMusicEmpty && (
                <button
                  type="button"
                  className="listen-shelf-allmine-link ui-text"
                  onClick={() => navigate(`/listen/library/${shelf.key}`)}
                >
                  All my {shelf.title} →
                </button>
              )}
            </header>
            {isMusicEmpty ? (
              <MusicColdStart onBrowse={() => navigate('/listen/discover')} />
            ) : (
              <div className={`listen-shelf-grid listen-shelf-grid--cols-${shelf.cols}`}>
                {cards.map((card) => (
                  <ShelfCard
                    key={card.id}
                    shape={shelf.cover}
                    coverUrl={card.coverUrl}
                    title={card.title}
                    subtitle={card.subtitle}
                    trailing={card.trailing}
                    onClick={card.onClick}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
