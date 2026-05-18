import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { playPodcastEpisode } from '../../services/podcast'
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
      </div>
      <div className="listen-shelf-meta">
        <p className="listen-shelf-title">{title}</p>
        {subtitle && <p className="listen-shelf-sub">{subtitle}</p>}
        {trailing && <p className="listen-shelf-trailing">{trailing}</p>}
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
  const { user } = useAuth()
  const data = useListenLibraryData(user?.uid)

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
        onClick: () => navigate(`/listen/${b.id}`),
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

  // -- YouTube shelf: derived channels --------------------------------------
  // No channel-follow API exists; channels are derived by grouping the user's
  // imported videos by channelTitle. Card art is the first video's thumb;
  // trailing detail is the user's video count for that channel.
  const channelCards = useMemo(() => {
    const channels = new Map()
    data.youtubeVideos.forEach((v) => {
      const key = v.channelId || v.channelTitle || 'Unknown'
      const thumb = v.coverUrl || v.thumbnailUrl || getYouTubeThumbnailFromVideo(v)
      const existing = channels.get(key) || {
        id: key,
        title: v.channelTitle || 'Unknown channel',
        coverUrl: thumb,
        count: 0,
      }
      existing.count += 1
      if (!existing.coverUrl) {
        existing.coverUrl = thumb
      }
      channels.set(key, existing)
    })
    return [...channels.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: '',
        trailing: c.count === 1 ? '1 video' : `${c.count} videos`,
        coverUrl: c.coverUrl,
        // No channel landing page exists today — defer to the deep view's
        // Channels tab so the user still has somewhere to go.
        onClick: () => navigate('/listen/library/youtube'),
      }))
  }, [data.youtubeVideos, navigate])

  // -- Music shelf: tiered fallback -----------------------------------------
  // 1) saved albums  2) followed artists  3) saved tracks  4) cold-start
  // Playlists tier omitted: no playlist data source exists today.
  const musicShelf = useMemo(() => {
    if (data.savedAlbums.length > 0) {
      return {
        kind: 'albums',
        cards: [...data.savedAlbums]
          .sort((a, b) => {
            const at = a.savedAt?.toMillis?.() || 0
            const bt = b.savedAt?.toMillis?.() || 0
            return bt - at
          })
          .slice(0, 5)
          .map((a) => ({
            id: a.id,
            title: a.title || 'Untitled album',
            subtitle: a.artistName || '',
            trailing: a.year ? String(a.year) : '',
            coverUrl: a.coverUrl || '',
            onClick: () => navigate(`/music/album/${a.albumId || a.id}`),
          })),
      }
    }
    if (data.followedArtists.length > 0) {
      return {
        kind: 'artists',
        cards: [...data.followedArtists]
          .sort((a, b) => {
            const at = a.followedAt?.toMillis?.() || 0
            const bt = b.followedAt?.toMillis?.() || 0
            return bt - at
          })
          .slice(0, 5)
          .map((a) => ({
            id: a.id,
            title: a.name || 'Unknown artist',
            subtitle: 'Artist',
            trailing: '',
            coverUrl: a.coverUrl || '',
            onClick: () => navigate(`/music/artist/${a.artistId || a.id}`),
          })),
      }
    }
    if (data.savedTracks.length > 0) {
      return {
        kind: 'tracks',
        cards: [...data.savedTracks]
          .sort((a, b) => {
            const at = a.savedAt?.toMillis?.() || 0
            const bt = b.savedAt?.toMillis?.() || 0
            return bt - at
          })
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            title: t.title || 'Untitled track',
            subtitle: t.artistName || '',
            trailing: t.albumName || '',
            coverUrl: t.coverUrl || '',
            onClick: () => navigate(`/listen/${t.trackId || t.id}?source=music`),
          })),
      }
    }
    return { kind: 'empty', cards: [] }
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
                <AllMineTile
                  shape={shelf.cover}
                  label={`All my ${shelf.title}`}
                  onClick={() => navigate(`/listen/library/${shelf.key}`)}
                />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
