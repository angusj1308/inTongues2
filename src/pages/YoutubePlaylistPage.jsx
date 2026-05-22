import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import LoadingScreen from '../components/LoadingScreen'
import useListenLibraryData from '../components/listen/useListenLibraryData'
import { useAuth } from '../context/AuthContext'
import { fetchYoutubePlaylist, fetchYoutubePlaylistVideos, savePlaylist, unsavePlaylist } from '../services/youtubePlaylists'
import { importYoutubeVideo } from '../services/youtube'
import { resolveSupportedLanguageLabel, toLanguageCode } from '../constants/languages'

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

const decodeHtmlEntities = (raw) => {
  const s = String(raw || '')
  if (!s) return ''
  return s
    .replace(/&#39;/g, "'")
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
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

const formatPublished = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const YoutubePlaylistPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [playlist, setPlaylist] = useState(null)
  const [videos, setVideos] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [pendingSave, setPendingSave] = useState(false)
  const [pendingImports, setPendingImports] = useState(() => new Set())
  const [sessionImported, setSessionImported] = useState(() => new Set())
  const [actionError, setActionError] = useState('')

  const activeLanguage = useMemo(
    () => resolveSupportedLanguageLabel(profile?.lastUsedLanguage, ''),
    [profile?.lastUsedLanguage],
  )
  const targetLangCode = useMemo(
    () => toLanguageCode(profile?.lastUsedLanguage) || '',
    [profile?.lastUsedLanguage],
  )

  const libraryData = useListenLibraryData(user?.uid, activeLanguage)
  const importedByVideoId = useMemo(() => {
    const m = new Map()
    ;(libraryData.youtubeVideos || []).forEach((v) => {
      if (v.videoId) m.set(v.videoId, v.id)
    })
    return m
  }, [libraryData.youtubeVideos])

  // The library's savedPlaylists collection is the source of truth for
  // "is this playlist saved" — same pattern as followed channels.
  const isSaved = useMemo(
    () => (libraryData.savedPlaylists || []).some((p) => p.playlistId === id),
    [libraryData.savedPlaylists, id],
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setLoadError('')
    setPlaylist(null)
    setVideos([])
    setNextCursor(null)
    ;(async () => {
      let meta = null
      try {
        meta = await fetchYoutubePlaylist(id)
      } catch (err) {
        if (!cancelled) setLoadError(`Couldn't load playlist: ${err.message || 'network error'}`)
      }
      let videosData = { videos: [], nextCursor: null }
      try {
        videosData = await fetchYoutubePlaylistVideos(id, {})
      } catch (err) {
        console.error('fetchYoutubePlaylistVideos failed', err)
      }
      if (cancelled) return
      if (!meta) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setPlaylist(meta)
      setVideos(videosData.videos || [])
      setNextCursor(videosData.nextCursor || null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchYoutubePlaylistVideos(id, { cursor: nextCursor })
      setVideos((prev) => [...prev, ...(data.videos || [])])
      setNextCursor(data.nextCursor || null)
    } catch (err) {
      console.error('Load more failed', err)
    } finally {
      setLoadingMore(false)
    }
  }, [id, nextCursor, loadingMore])

  const handleToggleSave = useCallback(async () => {
    if (!user?.uid || !playlist?.playlistId || pendingSave) return
    setPendingSave(true)
    try {
      if (isSaved) {
        await unsavePlaylist(user.uid, playlist.playlistId)
      } else {
        await savePlaylist(user.uid, {
          id: playlist.playlistId,
          title: playlist.title || '',
          channelTitle: playlist.channelTitle || '',
          channelId: playlist.channelId || '',
          coverUrl: playlist.coverUrl || '',
          videoCount: playlist.videoCount,
        }, activeLanguage)
      }
    } catch (err) {
      console.error('Save toggle failed', err)
      setActionError(err.message || 'Failed to update saved status')
    } finally {
      setPendingSave(false)
    }
  }, [user?.uid, playlist, pendingSave, isSaved, activeLanguage])

  const handleVideoImport = useCallback(async (v) => {
    if (!user?.uid || !v?.videoId) return
    const videoId = v.videoId
    if (importedByVideoId.has(videoId) || sessionImported.has(videoId) || pendingImports.has(videoId)) {
      return
    }
    setPendingImports((prev) => new Set(prev).add(videoId))
    setActionError('')
    try {
      await importYoutubeVideo({
        uid: user.uid,
        videoId,
        youtubeUrl: v.youtubeUrl,
        sourceLanguage: 'auto',
        targetLanguage: targetLangCode || 'auto',
      })
      setSessionImported((prev) => new Set(prev).add(videoId))
    } catch (err) {
      console.error('Import failed', err)
      setActionError(err.message || 'Import failed')
    } finally {
      setPendingImports((prev) => {
        const next = new Set(prev)
        next.delete(videoId)
        return next
      })
    }
  }, [user?.uid, targetLangCode, importedByVideoId, sessionImported, pendingImports])

  if (loading) return <LoadingScreen />
  if (notFound) {
    return (
      <DashboardLayout activeTab="listen">
        <div className="yt-channel-page">
          <p className="yt-channel-empty">Playlist not found.</p>
        </div>
      </DashboardLayout>
    )
  }
  if (!playlist) {
    return (
      <DashboardLayout activeTab="listen">
        <div className="yt-channel-page">
          <p className="yt-channel-empty">{loadError || 'Couldn\'t load this playlist.'}</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout activeTab="listen">
      <div className="yt-channel-page">
        <header className="yt-channel-header">
          {playlist.coverUrl && (
            <div className="yt-channel-avatar">
              <img src={playlist.coverUrl} alt="" />
            </div>
          )}
          <div className="yt-channel-meta">
            <p className="yt-channel-eyebrow">Playlist</p>
            <h1 className="yt-channel-title">{decodeHtmlEntities(playlist.title)}</h1>
            <p className="yt-channel-sub">
              {playlist.channelTitle ? decodeHtmlEntities(playlist.channelTitle) : ''}
              {Number.isFinite(playlist.videoCount) && (
                <> · {playlist.videoCount === 1 ? '1 video' : `${playlist.videoCount} videos`}</>
              )}
            </p>
            <div className="yt-channel-actions">
              <button
                type="button"
                className={`yt-channel-follow${isSaved ? ' is-following' : ''}`}
                onClick={handleToggleSave}
                disabled={pendingSave}
              >
                {pendingSave ? '…' : isSaved ? (<><CheckIcon /> Saved</>) : (<><PlusIcon /> Save</>)}
              </button>
            </div>
          </div>
        </header>

        {actionError && <p className="yt-channel-error">{actionError}</p>}

        <section className="yt-channel-videos">
          {videos.length === 0 ? (
            <p className="yt-channel-empty">No videos in this playlist.</p>
          ) : (
            <div className="yt-channel-video-grid">
              {videos.map((v) => {
                const alreadyImported = importedByVideoId.has(v.videoId) || sessionImported.has(v.videoId)
                const isPending = pendingImports.has(v.videoId)
                return (
                  <article key={v.videoId} className="yt-channel-video-card">
                    <button
                      type="button"
                      className="yt-channel-video-thumb"
                      onClick={() => v.youtubeUrl && window.open(v.youtubeUrl, '_blank', 'noopener,noreferrer')}
                      aria-label={`Preview ${v.title} on YouTube`}
                    >
                      {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" />}
                    </button>
                    <div className="yt-channel-video-body">
                      <p className="yt-channel-video-title">{decodeHtmlEntities(v.title)}</p>
                      <p className="yt-channel-video-meta">
                        {[formatPublished(v.publishedAt), formatVideoDuration(v.durationSeconds)].filter(Boolean).join(' · ')}
                      </p>
                      <button
                        type="button"
                        className="yt-channel-video-add"
                        onClick={() => handleVideoImport(v)}
                        disabled={alreadyImported || isPending}
                      >
                        {alreadyImported ? (<><CheckIcon /> In library</>) : isPending ? '…' : (<><PlusIcon /> Add</>)}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          {nextCursor && (
            <div className="yt-channel-load-more">
              <button type="button" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

export default YoutubePlaylistPage
