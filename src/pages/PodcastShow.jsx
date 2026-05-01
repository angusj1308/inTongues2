import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchShow, fetchShowEpisodes } from '../services/podcast'
import PodcastShell from '../components/podcast/PodcastShell'
import CoverArt from '../components/podcast/CoverArt'
import EpisodeRow from '../components/podcast/EpisodeRow'
import FollowButton from '../components/podcast/FollowButton'
import usePodcastSubscriptions from '../components/podcast/usePodcastSubscriptions'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

const PodcastShowPage = () => {
  const { id } = useParams()
  const { episodeStates, isFollowed, isPinned, follow, unfollow } = usePodcastSubscriptions()
  const [show, setShow] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [sort, setSort] = useState('newest')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchShow(id), fetchShowEpisodes(id, { sort })]).then(([showData, eps]) => {
      if (cancelled) return
      setShow(showData)
      setEpisodes(eps?.episodes || [])
      setNextCursor(eps?.nextCursor || null)
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

  return (
    <PodcastShell>
      <div className="podcast-show-page">
        <Link to="/podcasts" className="podcast-back-link ui-text">
          ← Library
        </Link>

        {loading && !show ? (
          <p className="podcast-placeholder">Loading…</p>
        ) : !show ? (
          <p className="podcast-placeholder">Show not found.</p>
        ) : (
          <>
            <header className="podcast-show-header">
              <CoverArt src={show.coverUrl} title={show.title} size={220} />
              <div className="podcast-show-header-meta">
                <p className="podcast-eyebrow">Podcast</p>
                <h1 className="podcast-show-title">{show.title}</h1>
                {show.host && <p className="podcast-show-host">{show.host}</p>}
                {show.description && (
                  <p className="podcast-show-description">{show.description}</p>
                )}
                <div className="podcast-show-actions">
                  <FollowButton
                    isFollowed={followed}
                    isPinned={pinned}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                  />
                  <button type="button" className="podcast-primary-button ui-text">
                    Play Latest
                  </button>
                </div>
                <dl className="podcast-show-stats">
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

            <section className="podcast-section">
              <div className="podcast-section-row">
                <h2 className="podcast-section-header">Episodes</h2>
                <label className="podcast-sort-label ui-text">
                  Sort
                  <select
                    className="podcast-sort-select"
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
                <p className="podcast-empty-line">No episodes available.</p>
              ) : (
                <div className="podcast-episode-detail-list">
                  {episodes.map((ep) => {
                    const state = stateById.get(ep.id)
                    return (
                      <EpisodeRow
                        key={ep.id}
                        episode={{
                          ...ep,
                          coverUrl: ep.coverUrl || show.coverUrl,
                          progressMs: state?.progressMs || 0,
                        }}
                        variant="detail"
                      />
                    )
                  })}
                </div>
              )}

              {nextCursor && (
                <div className="podcast-load-more">
                  <button
                    type="button"
                    className="podcast-secondary-button ui-text"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load older episodes'}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PodcastShell>
  )
}

export default PodcastShowPage
