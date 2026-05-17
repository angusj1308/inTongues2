import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchShow,
  fetchShowEpisodes,
  saveEpisode,
  unsaveEpisode,
  dubPodcastEpisode,
} from '../services/podcast'
import CoverArt from '../components/podcast/CoverArt'
import EpisodeRow from '../components/podcast/EpisodeRow'
import FollowButton from '../components/podcast/FollowButton'
import UnavailableShowMessage from '../components/podcast/UnavailableShowMessage'
import usePodcastSubscriptions from '../components/podcast/usePodcastSubscriptions'
import DashboardLayout from '../components/layout/DashboardLayout'
import DubConfirmModal from '../components/listen/DubConfirmModal'
import { toLanguageCode } from '../constants/languages'
import { useAuth } from '../context/AuthContext'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

const PodcastShowPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { user, followedShows, episodeStates, isFollowed, isPinned, follow, unfollow } =
    usePodcastSubscriptions()
  const [show, setShow] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [sort, setSort] = useState('newest')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [creditsPerMinute, setCreditsPerMinute] = useState(0)
  const [dubModal, setDubModal] = useState(null)
  const [dubPending, setDubPending] = useState(false)

  const targetLangCode = useMemo(
    () => toLanguageCode(profile?.lastUsedLanguage) || '',
    [profile?.lastUsedLanguage],
  )

  // Land at the top of the show page rather than wherever the previous page
  // was scrolled (React Router doesn't reset scroll on navigation by default).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchShow(id), fetchShowEpisodes(id, { sort })]).then(([showData, eps]) => {
      if (cancelled) return
      setShow(showData)
      setEpisodes(eps?.episodes || [])
      setNextCursor(eps?.nextCursor || null)
      setCreditsPerMinute(eps?.creditsPerMinute || 0)
      setUnavailable(showData?.available === false || eps?.available === false)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, sort])

  const followed = isFollowed(id)
  const pinned = isPinned(id)

  const stateById = useMemo(() => {
    const map = new Map()
    episodeStates.forEach((s) => map.set(s.id, s))
    return map
  }, [episodeStates])

  const handleFollow = async () => {
    if (!show) return
    await follow({
      id,
      title: show.title,
      host: show.host,
      coverUrl: show.coverUrl,
      language: show.language,
      category: show.category,
    })
  }

  const handleUnfollow = async () => {
    await unfollow(id)
  }

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const more = await fetchShowEpisodes(id, { sort, cursor: nextCursor })
    setEpisodes((prev) => [...prev, ...(more?.episodes || [])])
    setNextCursor(more?.nextCursor || null)
    setLoadingMore(false)
  }

  const handleTabChange = (tab) => {
    if (tab === 'listen') {
      navigate('/listen/library')
    } else if (tab === 'read') {
      navigate('/read/library')
    } else {
      navigate('/dashboard', { state: { initialTab: tab } })
    }
  }

  const handleSaveToLibrary = async (target) => {
    if (!user?.uid || !target?.id) return
    const isSaved = stateById.has(target.id)
    if (isSaved) {
      try {
        await unsaveEpisode(user.uid, target.id)
      } catch (err) {
        console.error('Failed to unsave', err)
      }
      return
    }

    const rawSrc = toLanguageCode(target.language || show?.language || '')
    if (targetLangCode && rawSrc && rawSrc !== targetLangCode) {
      // Cross-language → confirm credit spend before dubbing.
      setDubModal({
        episode: target,
        sourceLanguage: rawSrc,
        targetLanguage: targetLangCode,
      })
      return
    }

    try {
      await saveEpisode(user.uid, {
        id: target.id,
        title: target.title,
        showName: show?.title || '',
        showId: id,
        coverUrl: target.coverUrl || show?.coverUrl || '',
        durationMs: target.durationMs,
        publishedAt: target.publishedAt || '',
      })
    } catch (err) {
      console.error('Failed to save', err)
    }
  }

  const fireDub = useCallback(async () => {
    if (!user?.uid || !dubModal?.episode) return
    setDubPending(true)
    try {
      await dubPodcastEpisode({
        uid: user.uid,
        episode: {
          id: dubModal.episode.id,
          audioUrl: dubModal.episode.audioUrl,
          title: dubModal.episode.title,
          showName: show?.title || '',
          showId: id,
          coverUrl: dubModal.episode.coverUrl || show?.coverUrl || '',
          durationMs: dubModal.episode.durationMs,
          publishedAt: dubModal.episode.publishedAt || '',
        },
        sourceLanguage: dubModal.sourceLanguage,
        targetLanguage: dubModal.targetLanguage,
      })
      setDubModal(null)
    } catch (err) {
      console.error('Dub failed', err)
    } finally {
      setDubPending(false)
    }
  }, [user?.uid, dubModal, show?.title, show?.coverUrl, id])

  const dubEstimate = useMemo(() => {
    if (!dubModal?.episode) return { credits: 0, minutes: 0 }
    const ms = Number(dubModal.episode.durationMs) || 0
    const minutes = Math.ceil(ms / 60000)
    const credits = minutes * (Number(creditsPerMinute) || 0)
    return { credits, minutes }
  }, [dubModal, creditsPerMinute])

  return (
    <DashboardLayout activeTab="listen" onTabChange={handleTabChange}>
      <div className="media-page media-page--bare">
        <main className="media-main">
          <div className="media-show-page">
            <Link to="/listen/library/podcasts" className="media-back-link ui-text">
          ← Library
        </Link>

        {loading && !show ? (
          <p className="media-placeholder">Loading…</p>
        ) : !show ? (
          (() => {
            const stale = followedShows.find((s) => s.id === id)
            if (followed && stale) {
              return (
                <div className="media-unavailable">
                  <p className="media-unavailable-text">
                    "{stale.title || 'This show'}" is no longer reachable in our catalogue
                    (likely a stale follow from an older catalogue source). You can remove it
                    from My Shows below.
                  </p>
                  <div className="media-unavailable-actions">
                    <button
                      type="button"
                      className="media-secondary-button ui-text"
                      onClick={async () => {
                        await unfollow(id)
                        navigate('/podcasts')
                      }}
                    >
                      Remove from My Shows
                    </button>
                    <button
                      type="button"
                      className="media-text-button ui-text"
                      onClick={() => navigate('/podcasts')}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )
            }
            return <p className="media-placeholder">Show not found.</p>
          })()
        ) : (
          <>
            <header className="media-show-header">
              <CoverArt src={show.coverUrl} title={show.title} size={440} />
              <div className="media-show-header-meta">
                <h1 className="media-show-title">{show.title}</h1>
                {show.host && <p className="media-show-host">{show.host}</p>}
                {show.description && (
                  <p className="media-show-description">{show.description}</p>
                )}
                <div className="media-show-actions">
                  <FollowButton
                    isFollowed={followed}
                    isPinned={pinned}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                  />
                </div>
                <dl className="media-show-stats">
                  {show.episodeCount != null && (
                    <div>
                      <dt>Episodes</dt>
                      <dd>{show.episodeCount}</dd>
                    </div>
                  )}
                  {show.language && (
                    <div>
                      <dt>Language</dt>
                      <dd>{show.language}</dd>
                    </div>
                  )}
                  {show.category && (
                    <div>
                      <dt>Category</dt>
                      <dd>{show.category}</dd>
                    </div>
                  )}
                  {show.cadence && (
                    <div>
                      <dt>Updates</dt>
                      <dd>{show.cadence}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </header>

            {unavailable ? (
              <section className="media-section">
                <UnavailableShowMessage
                  title={show.title}
                  onBack={() => navigate('/podcasts/discover')}
                />
              </section>
            ) : (
              <section className="media-section">
                <div className="media-section-row">
                  <h2 className="media-section-header">Episodes</h2>
                  <label className="media-sort-label ui-text">
                    Sort
                    <select
                      className="media-sort-select"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {episodes.length === 0 ? (
                  <p className="media-empty-line">No episodes available.</p>
                ) : (
                  <div className="media-episode-detail-list">
                    {episodes.map((ep) => {
                      const state = stateById.get(ep.id)
                      return (
                        <div key={ep.id} className="media-episode-detail-wrapper">
                          <EpisodeRow
                            episode={{
                              ...ep,
                              coverUrl: ep.coverUrl || show.coverUrl,
                              progressMs: state?.progressMs || 0,
                            }}
                            variant="detail"
                            descriptionLang={show.language || ep.language || ''}
                            isSaved={stateById.has(ep.id)}
                            playable={false}
                            onSaveToLibrary={handleSaveToLibrary}
                            onPlay={(target) =>
                              navigate(
                                `/listen/${encodeURIComponent(target.id)}?source=podcast`,
                                {
                                  state: {
                                    episode: {
                                      ...target,
                                      showId: id,
                                      showName: show.title,
                                      coverUrl: target.coverUrl || show.coverUrl,
                                    },
                                  },
                                },
                              )
                            }
                          />
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
                      {loadingMore ? 'Loading…' : 'Load older episodes'}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
          </div>
        </main>
      </div>

      <DubConfirmModal
        open={!!dubModal}
        video={dubModal?.episode}
        estimatedCredits={dubEstimate.credits}
        durationMin={dubEstimate.minutes}
        pending={dubPending}
        onCancel={() => !dubPending && setDubModal(null)}
        onConfirm={fireDub}
      />
    </DashboardLayout>
  )
}

export default PodcastShowPage
