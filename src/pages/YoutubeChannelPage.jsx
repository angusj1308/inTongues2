import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import FollowButton from '../components/podcast/FollowButton'
import DubConfirmModal from '../components/listen/DubConfirmModal'
import useListenLibraryData from '../components/listen/useListenLibraryData'
import { useAuth } from '../context/AuthContext'
import {
  fetchYoutubeChannel,
  fetchYoutubeChannelVideos,
  importYoutubeVideo,
  dubYoutubeVideo,
} from '../services/youtube'
import {
  subscribeFollowedChannels,
  followChannel,
  unfollowChannel,
} from '../services/youtubeChannels'
import { toLanguageCode } from '../constants/languages'

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

// Decodes the handful of HTML entities the YouTube API returns in titles /
// descriptions (e.g. &#39; &amp; &quot;).
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

const formatCount = (n) => {
  if (n == null) return ''
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
}

const YoutubeChannelPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [channel, setChannel] = useState(null)
  const [videos, setVideos] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [creditsPerMinute, setCreditsPerMinute] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [sort, setSort] = useState('newest') // 'newest' | 'oldest'
  const [lengthFilter, setLengthFilter] = useState('all') // 'all' | 'long' | 'short'
  const [filterOpen, setFilterOpen] = useState(false)

  const [followedChannels, setFollowedChannels] = useState([])
  const [pendingFollow, setPendingFollow] = useState(false)
  const [pendingImports, setPendingImports] = useState(() => new Set())
  const [sessionImported, setSessionImported] = useState(() => new Set())
  const [dubModal, setDubModal] = useState(null)
  const [dubPending, setDubPending] = useState(false)
  const [actionError, setActionError] = useState('')

  const libraryData = useListenLibraryData(user?.uid)
  const importedByVideoId = useMemo(() => {
    const m = new Map()
    ;(libraryData.youtubeVideos || []).forEach((v) => {
      if (v.videoId) m.set(v.videoId, v.id)
    })
    return m
  }, [libraryData.youtubeVideos])

  const targetLangCode = useMemo(
    () => toLanguageCode(profile?.lastUsedLanguage) || '',
    [profile?.lastUsedLanguage],
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setLoadError('')
    setChannel(null)
    setVideos([])
    setNextCursor(null)
    ;(async () => {
      let channelData = null
      let channelErr = null
      try {
        channelData = await fetchYoutubeChannel(id)
      } catch (err) {
        channelErr = err
        console.error('fetchYoutubeChannel failed', err)
      }
      let videosData = { videos: [], nextCursor: null, creditsPerMinute: 0 }
      try {
        videosData = await fetchYoutubeChannelVideos(id, {})
      } catch (err) {
        console.error('fetchYoutubeChannelVideos failed', err)
      }
      if (cancelled) return
      if (!channelData) {
        if (channelErr) {
          setLoadError(`Couldn't load channel: ${channelErr.message || 'network error'}`)
        } else {
          setNotFound(true)
        }
        setLoading(false)
        return
      }
      setChannel(channelData)
      setVideos(videosData.videos || [])
      setNextCursor(videosData.nextCursor || null)
      setCreditsPerMinute(videosData.creditsPerMinute || 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!user?.uid) {
      setFollowedChannels([])
      return undefined
    }
    return subscribeFollowedChannels(user.uid, setFollowedChannels)
  }, [user?.uid])

  const followed = useMemo(
    () => followedChannels.some((c) => c.channelId === id),
    [followedChannels, id],
  )

  const handleFollow = useCallback(async () => {
    if (!user?.uid || !channel || pendingFollow) return
    setPendingFollow(true)
    try {
      await followChannel(user.uid, {
        id: channel.channelId,
        title: channel.title,
        description: channel.description,
        coverUrl: channel.coverUrl,
      })
    } catch (err) {
      console.error('Follow failed', err)
    } finally {
      setPendingFollow(false)
    }
  }, [user?.uid, channel, pendingFollow])

  const handleUnfollow = useCallback(async () => {
    if (!user?.uid || !channel || pendingFollow) return
    setPendingFollow(true)
    try {
      await unfollowChannel(user.uid, channel.channelId)
    } catch (err) {
      console.error('Unfollow failed', err)
    } finally {
      setPendingFollow(false)
    }
  }, [user?.uid, channel, pendingFollow])

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const more = await fetchYoutubeChannelVideos(id, { cursor: nextCursor })
      setVideos((prev) => [...prev, ...(more.videos || [])])
      setNextCursor(more.nextCursor || null)
    } catch (err) {
      console.error('Load more failed', err)
    } finally {
      setLoadingMore(false)
    }
  }, [id, nextCursor, loadingMore])

  const markPending = (videoId, on) => {
    setPendingImports((prev) => {
      const next = new Set(prev)
      if (on) next.add(videoId)
      else next.delete(videoId)
      return next
    })
  }

  const fireImport = useCallback(async (v, { targetLanguage }) => {
    if (!user?.uid) return
    markPending(v.videoId, true)
    setActionError('')
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
      setActionError('Import failed. Try again.')
    } finally {
      markPending(v.videoId, false)
    }
  }, [user?.uid])

  const fireDub = useCallback(async (v, { sourceLanguage, targetLanguage }) => {
    if (!user?.uid) return
    setDubPending(true)
    setActionError('')
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
      setActionError('Dub failed. Try again.')
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
      fireImport(v, { targetLanguage: target })
    } else {
      setDubModal({ video: v, sourceLanguage: normSrc, targetLanguage: target })
    }
  }, [user?.uid, targetLangCode, fireImport])

  const visibleVideos = useMemo(() => {
    const LONG_MIN_SECONDS = 20 * 60
    const filtered = videos.filter((v) => {
      const d = Number(v.durationSeconds) || 0
      if (lengthFilter === 'long') return d >= LONG_MIN_SECONDS
      if (lengthFilter === 'short') return d > 0 && d < LONG_MIN_SECONDS
      return true
    })
    if (sort === 'oldest') return [...filtered].reverse()
    return filtered
  }, [videos, sort, lengthFilter])

  const filterActive = sort !== 'newest' || lengthFilter !== 'all'

  useEffect(() => {
    if (!filterOpen) return undefined
    const onDocClick = (e) => {
      if (e.target.closest('[data-filter-root]')) return
      setFilterOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setFilterOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [filterOpen])

  const dubEstimate = useMemo(() => {
    if (!dubModal?.video) return { credits: 0, minutes: 0 }
    const dur = Number(dubModal.video.durationSeconds) || 0
    const minutes = Math.ceil(dur / 60)
    const credits = minutes * (Number(creditsPerMinute) || 0)
    return { credits, minutes }
  }, [dubModal, creditsPerMinute])

  const handleTabChange = (tab) => {
    if (tab === 'listen') navigate('/listen/library')
    else if (tab === 'read') navigate('/read/library')
    else navigate('/dashboard', { state: { initialTab: tab } })
  }

  return (
    <DashboardLayout activeTab="listen" onTabChange={handleTabChange}>
      <div className="media-page media-page--bare">
        <main className="media-main">
          <div className="media-show-page">
            <Link to="/listen/discover" className="media-back-link ui-text">
              ← Discover
            </Link>

            {loading ? (
              <p className="media-placeholder">Loading…</p>
            ) : loadError ? (
              <p className="media-placeholder">{loadError}</p>
            ) : notFound || !channel ? (
              <p className="media-placeholder">Channel not found.</p>
            ) : (
              <>
                <header className="media-show-header">
                  <div className="yt-channel-cover">
                    {channel.coverUrl ? (
                      <img src={channel.coverUrl} alt="" />
                    ) : (
                      <span className="yt-channel-cover-fallback">{channel.title?.[0] || '·'}</span>
                    )}
                  </div>
                  <div className="media-show-header-meta">
                    <h1 className="media-show-title">{decodeHtmlEntities(channel.title)}</h1>
                    {channel.customUrl && (
                      <p className="media-show-host">@{channel.customUrl.replace(/^@/, '')}</p>
                    )}
                    {channel.description && (
                      <p className="media-show-description">{decodeHtmlEntities(channel.description)}</p>
                    )}
                    <div className="media-show-actions">
                      <FollowButton
                        isFollowed={followed}
                        isPinned={false}
                        onFollow={handleFollow}
                        onUnfollow={handleUnfollow}
                      />
                    </div>
                    <dl className="media-show-stats">
                      {!channel.hiddenSubscriberCount && channel.subscriberCount != null && (
                        <div>
                          <dt>Subscribers</dt>
                          <dd>{formatCount(channel.subscriberCount)}</dd>
                        </div>
                      )}
                      {channel.videoCount != null && (
                        <div>
                          <dt>Videos</dt>
                          <dd>{formatCount(channel.videoCount)}</dd>
                        </div>
                      )}
                      {channel.country && (
                        <div>
                          <dt>Country</dt>
                          <dd>{channel.country}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </header>

                <section className="media-section">
                  <div className="media-section-row">
                    <h2 className="media-section-header">Videos</h2>
                    <div className="yt-filter-root" data-filter-root>
                      <button
                        type="button"
                        className={`yt-filter-trigger${filterActive ? ' is-active' : ''}`}
                        aria-haspopup="true"
                        aria-expanded={filterOpen}
                        aria-label="Sort and filter videos"
                        onClick={() => setFilterOpen((o) => !o)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                          <line x1="4" y1="6" x2="20" y2="6" />
                          <line x1="7" y1="12" x2="17" y2="12" />
                          <line x1="10" y1="18" x2="14" y2="18" />
                        </svg>
                        {filterActive && <span className="yt-filter-dot" aria-hidden="true" />}
                      </button>
                      {filterOpen && (
                        <div className="yt-filter-pop" role="menu">
                          <div className="yt-filter-group">
                            <div className="yt-filter-label">Sort</div>
                            {[
                              { v: 'newest', l: 'Newest first' },
                              { v: 'oldest', l: 'Oldest first' },
                            ].map((opt) => (
                              <button
                                key={opt.v}
                                type="button"
                                role="menuitemradio"
                                aria-checked={sort === opt.v}
                                className={`yt-filter-opt${sort === opt.v ? ' is-selected' : ''}`}
                                onClick={() => setSort(opt.v)}
                              >
                                <span>{opt.l}</span>
                                {sort === opt.v && (
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                          <div className="yt-filter-divider" />
                          <div className="yt-filter-group">
                            <div className="yt-filter-label">Length</div>
                            {[
                              { v: 'all', l: 'All' },
                              { v: 'long', l: '20 min and over' },
                              { v: 'short', l: 'Under 20 min' },
                            ].map((opt) => (
                              <button
                                key={opt.v}
                                type="button"
                                role="menuitemradio"
                                aria-checked={lengthFilter === opt.v}
                                className={`yt-filter-opt${lengthFilter === opt.v ? ' is-selected' : ''}`}
                                onClick={() => setLengthFilter(opt.v)}
                              >
                                <span>{opt.l}</span>
                                {lengthFilter === opt.v && (
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {actionError && (
                    <p className="media-empty-line" style={{ color: '#a45252' }}>{actionError}</p>
                  )}

                  {visibleVideos.length === 0 ? (
                    <p className="media-empty-line">
                      {videos.length === 0
                        ? 'No videos available.'
                        : 'No videos match the current filters.'}
                    </p>
                  ) : (
                    <div className="yt-channel-video-list">
                      {visibleVideos.map((v) => {
                        const docId = importedByVideoId.get(v.videoId)
                        const alreadyImported = !!docId || sessionImported.has(v.videoId)
                        const isPending = pendingImports.has(v.videoId)
                        const dateLabel = formatPublished(v.publishedAt)
                        const durLabel = formatVideoDuration(v.durationSeconds)
                        return (
                          <div key={v.videoId} className="yt-channel-video-row">
                            <button
                              type="button"
                              className="yt-channel-video-thumb"
                              onClick={() => v.youtubeUrl && window.open(v.youtubeUrl, '_blank', 'noopener,noreferrer')}
                              aria-label={`Preview ${decodeHtmlEntities(v.title)} on YouTube`}
                            >
                              {v.thumbnailUrl ? (
                                <img src={v.thumbnailUrl} alt="" loading="lazy" />
                              ) : (
                                <span className="yt-channel-video-thumb-fallback">·</span>
                              )}
                            </button>
                            <div className="yt-channel-video-meta">
                              <h3 className="yt-channel-video-title">
                                {decodeHtmlEntities(v.title)}
                              </h3>
                              <p className="yt-channel-video-sub">
                                {[dateLabel, durLabel].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            <div className="yt-channel-video-actions">
                              <button
                                type="button"
                                className={`media-icon-button${alreadyImported ? ' is-saved' : ''}`}
                                onClick={() => !alreadyImported && handleVideoAdd(v)}
                                disabled={alreadyImported || isPending}
                                aria-label={alreadyImported ? 'In your library' : 'Add to library'}
                                aria-pressed={alreadyImported || undefined}
                              >
                                {alreadyImported ? <CheckIcon /> : <PlusIcon />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {nextCursor && (
                    <div className="media-load-more">
                      <button
                        type="button"
                        className="media-secondary-button ui-text"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? 'Loading…' : 'Load older videos'}
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </main>
      </div>

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
    </DashboardLayout>
  )
}

export default YoutubeChannelPage
