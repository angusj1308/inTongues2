import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { playPodcastEpisode } from '../../services/podcast'
import { getYouTubeThumbnailFromVideo } from '../../utils/youtube'
import useListenLibraryData from './useListenLibraryData'

const TITLES = {
  audiobooks: 'Audiobooks',
  podcasts: 'Podcasts',
  music: 'Music',
  youtube: 'YouTube',
}

const TABS = {
  audiobooks: ['All', 'In progress', 'Finished', 'Authors', 'Collections'],
  podcasts: ['Episodes', 'Shows'],
  music: ['Tracks', 'Albums', 'Artists', 'Playlists'],
  youtube: ['Videos', 'Channels'],
}

const stripArticles = (s) =>
  String(s || '').replace(/^(the|a|an|el|la|los|las|le|les|der|die|das|il|i|lo|gli|le|une|un)\s+/i, '').trim()

const sortByTitle = (rows) =>
  [...rows].sort((a, b) =>
    stripArticles(a.title).toLowerCase().localeCompare(stripArticles(b.title).toLowerCase()),
  )

const formatDuration = (ms) => {
  if (!ms) return ''
  const totalSec = Math.round(Number(ms) / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return `${min}:${sec.toString().padStart(2, '0')}`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return `${hr}:${remMin.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

function Row({ thumb, title, subtitle, trailing, shape = 'square', onClick }) {
  return (
    <button type="button" className="listen-deep-row" onClick={onClick}>
      <div className={`listen-deep-thumb listen-deep-thumb--${shape}`}>
        {thumb ? <img src={thumb} alt="" /> : <span className="listen-deep-thumb-fallback">{title?.[0] || '·'}</span>}
      </div>
      <div className="listen-deep-meta">
        <p className="listen-deep-title">{title}</p>
        {subtitle && <p className="listen-deep-sub">{subtitle}</p>}
      </div>
      {trailing && <span className="listen-deep-trailing">{trailing}</span>}
    </button>
  )
}

function EmptyState({ label }) {
  return <p className="listen-deep-empty">{label}</p>
}

export default function ListenDeepView({ medium }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const data = useListenLibraryData(user?.uid)
  const [activeTab, setActiveTab] = useState(TABS[medium]?.[0])

  const title = TITLES[medium]
  const tabs = TABS[medium] || []

  const rows = useMemo(() => buildRows({ medium, activeTab, data, navigate }), [medium, activeTab, data, navigate])

  if (!title) return null

  return (
    <div className="listen-deep-view">
      <div className="listen-deep-tabs" role="tablist" aria-label={`${title} sections`}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`listen-deep-tab${activeTab === tab ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="listen-deep-rows">
        {rows.length === 0 ? (
          <EmptyState label="Nothing here yet." />
        ) : (
          rows.map((row, idx) => <Row key={row.id || idx} {...row} />)
        )}
      </div>
    </div>
  )
}

function buildRows({ medium, activeTab, data, navigate }) {
  if (medium === 'audiobooks') {
    const books = data.audiobooks.map((b) => ({
      id: b.id,
      title: b.storyTitle || b.title || 'Untitled',
      author: b.author || '',
      coverUrl: b.coverImageUrlSquare || b.coverImageUrl || '',
      progress: Number(b.progress) || 0,
    }))
    if (activeTab === 'All') {
      return sortByTitle(books).map((b) => ({
        id: b.id,
        thumb: b.coverUrl,
        title: b.title,
        subtitle: b.author,
        shape: 'square',
        trailing: b.progress > 0 ? `${b.progress}%` : '',
        onClick: () => navigate(`/listen/${b.id}`),
      }))
    }
    if (activeTab === 'In progress') {
      return sortByTitle(books.filter((b) => b.progress > 0 && b.progress < 100)).map((b) => ({
        id: b.id,
        thumb: b.coverUrl,
        title: b.title,
        subtitle: b.author,
        shape: 'square',
        trailing: `${b.progress}%`,
        onClick: () => navigate(`/listen/${b.id}`),
      }))
    }
    if (activeTab === 'Finished') {
      return sortByTitle(books.filter((b) => b.progress >= 100)).map((b) => ({
        id: b.id,
        thumb: b.coverUrl,
        title: b.title,
        subtitle: b.author,
        shape: 'square',
        trailing: 'Finished',
        onClick: () => navigate(`/listen/${b.id}`),
      }))
    }
    if (activeTab === 'Authors') {
      const byAuthor = new Map()
      books.forEach((b) => {
        const key = b.author || 'Unknown'
        const existing = byAuthor.get(key) || { name: key, count: 0, coverUrl: '' }
        existing.count += 1
        if (!existing.coverUrl) existing.coverUrl = b.coverUrl
        byAuthor.set(key, existing)
      })
      return [...byAuthor.values()]
        .sort((a, b) => stripArticles(a.name).toLowerCase().localeCompare(stripArticles(b.name).toLowerCase()))
        .map((a) => ({
          id: a.name,
          thumb: a.coverUrl,
          title: a.name,
          subtitle: a.count === 1 ? '1 book' : `${a.count} books`,
          shape: 'square',
          trailing: '',
        }))
    }
    return [] // Collections — no backing data
  }

  if (medium === 'podcasts') {
    if (activeTab === 'Episodes') {
      return sortByTitle(data.episodeStates.map((e) => ({
        id: e.id,
        title: e.title || 'Untitled episode',
        showName: e.showName,
        showId: e.showId,
        coverUrl: e.coverUrl,
        durationMs: e.durationMs,
        episodeId: e.episodeId || e.id,
      }))).map((e) => ({
        id: e.id,
        thumb: e.coverUrl,
        title: e.title,
        subtitle: e.showName,
        shape: 'square',
        trailing: formatDuration(e.durationMs),
        onClick: () => playPodcastEpisode(
          {
            id: e.episodeId,
            episodeId: e.episodeId,
            title: e.title,
            showName: e.showName,
            showId: e.showId,
            coverUrl: e.coverUrl,
            durationMs: e.durationMs,
          },
          navigate,
        ),
      }))
    }
    if (activeTab === 'Shows') {
      return sortByTitle(data.followedShows.map((s) => ({
        id: s.id || s.showId,
        title: s.title || 'Untitled show',
        host: s.host || '',
        coverUrl: s.coverUrl,
        showId: s.showId || s.id,
      }))).map((s) => ({
        id: s.id,
        thumb: s.coverUrl,
        title: s.title,
        subtitle: s.host,
        shape: 'square',
        onClick: () => navigate(`/podcasts/show/${s.showId}`),
      }))
    }
    return []
  }

  if (medium === 'music') {
    if (activeTab === 'Tracks') {
      return sortByTitle(data.savedTracks.map((t) => ({
        id: t.id,
        title: t.title || 'Untitled track',
        artist: t.artistName || '',
        coverUrl: t.coverUrl,
        durationMs: t.durationMs,
        trackId: t.trackId || t.id,
      }))).map((t) => ({
        id: t.id,
        thumb: t.coverUrl,
        title: t.title,
        subtitle: t.artist,
        shape: 'square',
        trailing: formatDuration(t.durationMs),
        onClick: () => navigate(`/listen/${t.trackId}?source=music`),
      }))
    }
    if (activeTab === 'Albums') {
      return sortByTitle(data.savedAlbums.map((a) => ({
        id: a.id,
        title: a.title || 'Untitled album',
        artistName: a.artistName || '',
        coverUrl: a.coverUrl,
        albumId: a.albumId || a.id,
      }))).map((a) => ({
        id: a.id,
        thumb: a.coverUrl,
        title: a.title,
        subtitle: a.artistName,
        shape: 'square',
        onClick: () => navigate(`/music/album/${a.albumId}`),
      }))
    }
    if (activeTab === 'Artists') {
      return sortByTitle(data.followedArtists.map((a) => ({
        id: a.id,
        title: a.name || 'Unknown artist',
        coverUrl: a.coverUrl,
        artistId: a.artistId || a.id,
      }))).map((a) => ({
        id: a.id,
        thumb: a.coverUrl,
        title: a.title,
        shape: 'square',
        onClick: () => navigate(`/music/artist/${a.artistId}`),
      }))
    }
    return [] // Playlists — no backing data surfaced yet
  }

  if (medium === 'youtube') {
    if (activeTab === 'Videos') {
      return sortByTitle(data.youtubeVideos.map((v) => ({
        id: v.id,
        title: v.title || 'Untitled video',
        channelTitle: v.channelTitle || '',
        coverUrl: v.coverUrl || v.thumbnailUrl || getYouTubeThumbnailFromVideo(v),
      }))).map((v) => ({
        id: v.id,
        thumb: v.coverUrl,
        title: v.title,
        subtitle: v.channelTitle,
        shape: 'wide',
        onClick: () => navigate(`/cinema/${v.id}`),
      }))
    }
    if (activeTab === 'Channels') {
      return sortByTitle((data.followedYoutubeChannels || []).map((c) => ({
        id: c.id || c.channelId,
        channelId: c.channelId || c.id,
        title: c.title || 'Untitled channel',
        coverUrl: c.coverUrl || '',
      }))).map((c) => ({
        id: c.id,
        thumb: c.coverUrl,
        title: c.title,
        subtitle: 'Channel',
        shape: 'square',
        onClick: () => c.channelId && navigate(`/youtube/channel/${c.channelId}`),
      }))
    }
    return []
  }

  return []
}
