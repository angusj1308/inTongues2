import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import useListenLibraryData, { pickContinueListening } from './useListenLibraryData'

const MEDIUM_TO_HREF = {
  audiobook: (item) => `/listen/${item.id}`,
  podcast: (item) => `/listen/${item.episodeId || item.id}?source=podcast`,
  music: (item) => `/listen/${item.trackId || item.id}?source=music`,
  video: (item) => `/cinema/${item.id}`,
}

const SHELVES = [
  { key: 'audiobooks', title: 'Audiobooks', cover: 'portrait', cols: 6 },
  { key: 'podcasts', title: 'Podcasts', cover: 'square', cols: 6 },
  { key: 'music', title: 'Music', cover: 'square', cols: 6 },
  { key: 'youtube', title: 'YouTube', cover: 'wide', cols: 4 },
]

function continueLabel(item) {
  if (!item) return 'Continue Listening'
  return 'Continue Listening'
}

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
  const coverClass = `listen-continue-cover listen-continue-cover--${item.medium === 'audiobook' ? 'portrait' : item.medium === 'video' ? 'wide' : 'square'}`
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
          <p className="listen-continue-eyebrow">{continueLabel(item)}</p>
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

function ShelfCard({ shape, coverUrl, title, subtitle, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className={`listen-shelf-card listen-shelf-card--${shape}`}
      onClick={onClick}
      aria-label={ariaLabel || title}
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

export default function ListenLibrary() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const data = useListenLibraryData(user?.uid)

  const continueItem = useMemo(() => pickContinueListening(data), [data])

  const audiobookCards = useMemo(
    () => data.audiobooks
      .filter((b) => b.coverImageUrl || b.title)
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        title: b.storyTitle || b.title || 'Untitled',
        subtitle: b.author || '',
        coverUrl: b.coverImageUrl || '',
        onClick: () => navigate(MEDIUM_TO_HREF.audiobook(b)),
      })),
    [data.audiobooks, navigate],
  )

  const episodeCards = useMemo(
    () => [...data.episodeStates]
      .sort((a, b) => {
        const at = a.lastPlayedAt?.toMillis?.() || 0
        const bt = b.lastPlayedAt?.toMillis?.() || 0
        return bt - at
      })
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        title: e.title || 'Untitled episode',
        subtitle: e.showName || '',
        coverUrl: e.coverUrl || '',
        onClick: () => navigate(MEDIUM_TO_HREF.podcast(e)),
      })),
    [data.episodeStates, navigate],
  )

  const trackCards = useMemo(
    () => [...data.savedTracks]
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
        coverUrl: t.coverUrl || '',
        onClick: () => navigate(MEDIUM_TO_HREF.music(t)),
      })),
    [data.savedTracks, navigate],
  )

  const videoCards = useMemo(
    () => data.youtubeVideos
      .slice(0, 3)
      .map((v) => ({
        id: v.id,
        title: v.title || 'Untitled video',
        subtitle: v.channelTitle || '',
        coverUrl: v.coverUrl || v.thumbnailUrl || '',
        onClick: () => navigate(MEDIUM_TO_HREF.video(v)),
      })),
    [data.youtubeVideos, navigate],
  )

  const shelfData = {
    audiobooks: audiobookCards,
    podcasts: episodeCards,
    music: trackCards,
    youtube: videoCards,
  }

  const handlePlayContinue = (item) => {
    if (item?.playHref) navigate(item.playHref)
  }

  return (
    <div className="listen-library">
      <ContinueListeningHero item={continueItem} onPlay={handlePlayContinue} />

      {SHELVES.map((shelf) => {
        const cards = shelfData[shelf.key] || []
        return (
          <section key={shelf.key} className="listen-shelf">
            <header className="listen-shelf-header">
              <h2 className="listen-shelf-heading">{shelf.title}</h2>
            </header>
            <div
              className={`listen-shelf-grid listen-shelf-grid--cols-${shelf.cols}`}
            >
              {cards.map((card) => (
                <ShelfCard
                  key={card.id}
                  shape={shelf.cover}
                  coverUrl={card.coverUrl}
                  title={card.title}
                  subtitle={card.subtitle}
                  onClick={card.onClick}
                />
              ))}
              <AllMineTile
                shape={shelf.cover}
                label={`All my ${shelf.title}`}
                onClick={() => navigate(`/listen/library/${shelf.key}`)}
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}
