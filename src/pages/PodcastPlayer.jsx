import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import useAuth from '../context/AuthContext'
import {
  fetchEpisodeProgress,
  saveEpisodeProgress,
  markEpisodePlayed,
} from '../services/podcast'
import PodcastShell from '../components/podcast/PodcastShell'
import CoverArt from '../components/podcast/CoverArt'

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
const SCRUB_SECONDS = 5
const PROGRESS_SAVE_INTERVAL_MS = 5000
const RESUME_TOLERANCE_S = 3 // don't try to resume from the very start
const END_TOLERANCE_S = 1 // count as "played" when within this much of the end

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Episode metadata for the player. Source of truth is `location.state.episode`
// from the Play call sites; we fall back to whatever's been persisted on the
// progress doc so a deep-link / refresh still has a title and cover.
const useEpisodeContext = () => {
  const { episodeId } = useParams()
  const location = useLocation()
  const stateEpisode = location.state?.episode || null
  return useMemo(
    () => ({
      episodeId,
      title: stateEpisode?.title || '',
      showName: stateEpisode?.showName || '',
      showId: stateEpisode?.showId || '',
      coverUrl: stateEpisode?.coverUrl || '',
      audioUrl: stateEpisode?.audioUrl || '',
      durationMsHint: stateEpisode?.durationMs || 0,
      transcriptUrl: stateEpisode?.transcriptUrl || '',
    }),
    [episodeId, stateEpisode],
  )
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" />
    <rect x="14" y="5" width="4" height="14" />
  </svg>
)

const PodcastPlayer = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const ctx = useEpisodeContext()
  const audioRef = useRef(null)
  const lastSaveRef = useRef(0)
  const hasResumedRef = useRef(false)

  const [audioUrl, setAudioUrl] = useState(ctx.audioUrl || '')
  const [title, setTitle] = useState(ctx.title || '')
  const [showName, setShowName] = useState(ctx.showName || '')
  const [showId, setShowId] = useState(ctx.showId || '')
  const [coverUrl, setCoverUrl] = useState(ctx.coverUrl || '')
  const [transcriptUrl] = useState(ctx.transcriptUrl || '')
  const [durationSeconds, setDurationSeconds] = useState(
    ctx.durationMsHint ? ctx.durationMsHint / 1000 : 0,
  )
  const [progressSeconds, setProgressSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [error, setError] = useState('')

  // Hydrate missing metadata from the persisted progress doc (e.g. on refresh
  // when location.state is gone).
  useEffect(() => {
    if (!user?.uid || !ctx.episodeId) return
    let cancelled = false
    fetchEpisodeProgress(user.uid, ctx.episodeId).then((prog) => {
      if (cancelled || !prog) return
      if (!title && prog.title) setTitle(prog.title)
      if (!showName && prog.showName) setShowName(prog.showName)
      if (!showId && prog.showId) setShowId(prog.showId)
      if (!coverUrl && prog.coverUrl) setCoverUrl(prog.coverUrl)
      if (!durationSeconds && prog.durationMs) setDurationSeconds(prog.durationMs / 1000)
      // Seek to last known position once metadata is loaded — handled in the
      // <audio> onLoadedMetadata callback.
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, ctx.episodeId])

  const persistProgress = useCallback(
    async (overrides = {}) => {
      if (!user?.uid || !ctx.episodeId) return
      const audio = audioRef.current
      const now = audio?.currentTime ?? progressSeconds
      const dur = audio?.duration && Number.isFinite(audio.duration) ? audio.duration : durationSeconds
      try {
        await saveEpisodeProgress(user.uid, ctx.episodeId, {
          progressMs: now * 1000,
          durationMs: dur * 1000,
          coverUrl,
          title,
          showName,
          showId,
          ...overrides,
        })
      } catch (err) {
        console.error('Episode progress save failed', err)
      }
    },
    [user?.uid, ctx.episodeId, progressSeconds, durationSeconds, coverUrl, title, showName, showId],
  )

  // Save on tab close.
  useEffect(() => {
    const onBeforeUnload = () => {
      const audio = audioRef.current
      if (!audio || !user?.uid || !ctx.episodeId) return
      // Use sendBeacon-style synchronous Firestore write isn't available here;
      // setDoc is async but Firestore SDK queues the request and flushes it
      // before unload in most browsers.
      saveEpisodeProgress(user.uid, ctx.episodeId, {
        progressMs: audio.currentTime * 1000,
        durationMs: (audio.duration || durationSeconds) * 1000,
        coverUrl,
        title,
        showName,
        showId,
      })
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [user?.uid, ctx.episodeId, coverUrl, title, showName, showId, durationSeconds])

  // Save also when the page unmounts (route change inside the SPA).
  useEffect(
    () => () => {
      const audio = audioRef.current
      if (!audio || !user?.uid || !ctx.episodeId) return
      saveEpisodeProgress(user.uid, ctx.episodeId, {
        progressMs: audio.currentTime * 1000,
        durationMs: (audio.duration || durationSeconds) * 1000,
        coverUrl,
        title,
        showName,
        showId,
      })
    },
    // We intentionally only want this to fire on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handleLoadedMetadata = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (Number.isFinite(audio.duration)) setDurationSeconds(audio.duration)
    if (hasResumedRef.current) return
    hasResumedRef.current = true
    if (!user?.uid || !ctx.episodeId) return
    try {
      const prog = await fetchEpisodeProgress(user.uid, ctx.episodeId)
      if (!prog?.progressMs || prog.played) return
      const seconds = prog.progressMs / 1000
      const dur = audio.duration || (prog.durationMs ? prog.durationMs / 1000 : 0)
      if (seconds > RESUME_TOLERANCE_S && (!dur || seconds < dur - END_TOLERANCE_S)) {
        audio.currentTime = seconds
        setProgressSeconds(seconds)
      }
    } catch (err) {
      console.warn('Resume position fetch failed', err)
    }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    setProgressSeconds(audio.currentTime)
    const now = Date.now()
    if (now - lastSaveRef.current > PROGRESS_SAVE_INTERVAL_MS) {
      lastSaveRef.current = now
      persistProgress()
    }
  }

  const handleEnded = async () => {
    setIsPlaying(false)
    setProgressSeconds(durationSeconds)
    if (!user?.uid || !ctx.episodeId) return
    try {
      await markEpisodePlayed(user.uid, ctx.episodeId, durationSeconds * 1000, {
        coverUrl,
        title,
        showName,
        showId,
      })
    } catch (err) {
      console.error('Mark played failed', err)
    }
  }

  const handlePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch((err) => {
        console.error('Play failed', err)
        setError('Audio playback failed. The feed may be temporarily unavailable.')
      })
    } else {
      audio.pause()
      persistProgress()
    }
  }

  const handleSeek = (event) => {
    const audio = audioRef.current
    if (!audio) return
    const next = Number(event.target.value)
    audio.currentTime = next
    setProgressSeconds(next)
    persistProgress({ progressMs: next * 1000 })
  }

  const handleScrub = (delta) => {
    const audio = audioRef.current
    if (!audio) return
    const next = Math.max(0, Math.min(durationSeconds || audio.duration || 0, audio.currentTime + delta))
    audio.currentTime = next
    setProgressSeconds(next)
  }

  const handleSpeedChange = (event) => {
    const rate = Number(event.target.value) || 1
    setPlaybackRate(rate)
    if (audioRef.current) audioRef.current.playbackRate = rate
  }

  const remaining = Math.max(0, (durationSeconds || 0) - progressSeconds)

  return (
    <PodcastShell>
      <div className="media-show-page">
        <Link
          to={showId ? `/podcasts/show/${showId}` : '/podcasts'}
          className="media-back-link ui-text"
        >
          ← {showId ? 'Show' : 'Library'}
        </Link>

        {!audioUrl ? (
          <p className="media-placeholder">
            No audio available for this episode.
          </p>
        ) : (
          <div className="media-podcast-player">
            <CoverArt src={coverUrl} title={title} size={260} />

            <div className="media-podcast-player-meta">
              {showName && <p className="media-eyebrow">{showName}</p>}
              <h1 className="media-show-title">{title}</h1>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(1, durationSeconds || 0)}
              step={1}
              value={Math.min(progressSeconds, durationSeconds || progressSeconds)}
              onChange={handleSeek}
              className="media-podcast-scrubber"
              aria-label="Seek"
            />

            <div className="media-podcast-times ui-text">
              <span>{formatTime(progressSeconds)}</span>
              <span>−{formatTime(remaining)}</span>
            </div>

            <div className="media-podcast-controls">
              <button
                type="button"
                className="media-icon-button"
                onClick={() => handleScrub(-SCRUB_SECONDS)}
                aria-label={`Back ${SCRUB_SECONDS} seconds`}
                title={`Back ${SCRUB_SECONDS}s`}
              >
                ◁ {SCRUB_SECONDS}
              </button>
              <button
                type="button"
                className="media-podcast-play"
                onClick={handlePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                className="media-icon-button"
                onClick={() => handleScrub(SCRUB_SECONDS)}
                aria-label={`Forward ${SCRUB_SECONDS} seconds`}
                title={`Forward ${SCRUB_SECONDS}s`}
              >
                {SCRUB_SECONDS} ▷
              </button>
            </div>

            <div className="media-podcast-secondary ui-text">
              <label className="media-sort-label">
                Speed
                <select
                  className="media-sort-select"
                  value={playbackRate}
                  onChange={handleSpeedChange}
                >
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}×
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="media-secondary-button ui-text"
                disabled
                title={
                  transcriptUrl
                    ? 'Transcript view coming soon'
                    : 'Transcript not yet available for this episode'
                }
              >
                Transcript
              </button>
            </div>

            {error && <p className="media-pin-error">{error}</p>}

            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => setError('Could not load audio.')}
            />
          </div>
        )}
      </div>
    </PodcastShell>
  )
}

export default PodcastPlayer
