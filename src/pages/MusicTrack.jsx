import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import useAuth from '../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../constants/languages'
import { fetchTrack } from '../services/music'
import { getMusicKit } from '../services/musicKit'
import CoverArt from '../components/podcast/CoverArt'

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const MusicTrackPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const language = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')

  const [track, setTrack] = useState(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [instance, setInstance] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadingMeta(true)
    fetchTrack(id, { language }).then((data) => {
      if (cancelled) return
      setTrack(data)
      setLoadingMeta(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, language])

  useEffect(() => {
    if (!id) return undefined
    let cancelled = false
    let cleanup = null
    getMusicKit()
      .then(async (inst) => {
        if (cancelled) return
        setInstance(inst)
        try {
          await inst.setQueue({ song: id })
        } catch (err) {
          if (!cancelled) setError(err?.message || 'Could not queue track')
          return
        }
        const onState = () => {
          // MusicKit playback states: 0 none, 1 loading, 2 playing, 3 paused, 4 stopped, 5 ended.
          if (!cancelled) setPlaying(inst.playbackState === 2)
        }
        const onTime = () => {
          if (cancelled) return
          setPosition(inst.currentPlaybackTime || 0)
          setDuration(inst.currentPlaybackDuration || 0)
        }
        inst.addEventListener('playbackStateDidChange', onState)
        inst.addEventListener('playbackTimeDidChange', onTime)
        onState()
        onTime()
        cleanup = () => {
          inst.removeEventListener('playbackStateDidChange', onState)
          inst.removeEventListener('playbackTimeDidChange', onTime)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'MusicKit unavailable')
      })
    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [id])

  const togglePlay = async () => {
    if (!instance) return
    try {
      if (playing) await instance.pause()
      else await instance.play()
    } catch (err) {
      setError(err?.message || 'Playback failed')
    }
  }

  const handleSeek = async (event) => {
    if (!instance || !duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    try {
      await instance.seekToTime(pct * duration)
    } catch (err) {
      console.warn('seekToTime failed', err)
    }
  }

  const handleTabChange = (tab) => {
    if (tab === 'listen') navigate('/listen/library')
    else if (tab === 'read') navigate('/read/library')
    else navigate('/dashboard', { state: { initialTab: tab } })
  }

  const pct = duration ? (position / duration) * 100 : 0

  return (
    <DashboardLayout activeTab="listen" onTabChange={handleTabChange}>
      <div className="media-page media-page--bare">
        <main className="media-main">
          <div className="media-show-page">
            <Link to="/listen/library/music" className="media-back-link ui-text">
              ← My Music
            </Link>

            {loadingMeta && !track ? (
              <p className="media-placeholder">Loading…</p>
            ) : !track ? (
              <p className="media-placeholder">Track not found.</p>
            ) : (
              <>
                <header className="media-show-header">
                  <CoverArt src={track.coverUrl} title={track.title} size={220} />
                  <div className="media-show-header-meta">
                    <p className="media-eyebrow">Track</p>
                    <h1 className="media-show-title">{track.title}</h1>
                    <p className="media-show-host">
                      {track.artistId ? (
                        <Link
                          to={`/music/artist/${track.artistId}`}
                          className="media-show-artist-link"
                        >
                          {track.artistName}
                        </Link>
                      ) : (
                        track.artistName
                      )}
                      {track.albumName ? ' · ' : ''}
                      {track.albumId && track.albumName ? (
                        <Link
                          to={`/music/album/${track.albumId}`}
                          className="media-show-artist-link"
                        >
                          {track.albumName}
                        </Link>
                      ) : (
                        track.albumName
                      )}
                    </p>
                    <div className="media-show-actions">
                      <button
                        type="button"
                        className="media-primary-button ui-text"
                        onClick={togglePlay}
                      >
                        {playing ? 'Pause' : 'Play'}
                      </button>
                    </div>
                    {error && <p className="error small ui-text">{error}</p>}
                  </div>
                </header>

                <section className="media-section">
                  <div
                    className="music-track-scrubber"
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(position)}
                    onClick={handleSeek}
                  >
                    <div className="music-track-scrubber-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="music-track-times ui-text">
                    <span>{formatTime(position)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  )
}

export default MusicTrackPage
