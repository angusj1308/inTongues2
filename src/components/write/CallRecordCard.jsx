import { useEffect, useRef, useState } from 'react'

// Full-width call record card rendered inline in a thread. Plays back the
// stored call audio (if available) with custom controls + a transcript
// preview that expands inline. Visually distinct from chat bubbles — signals
// "review me" rather than "read me".

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const SPEEDS = [0.5, 1, 1.5, 2]
const MVP_SPEAKER_LABEL = 'Speaker'

const CallRecordCard = ({ record }) => {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(record?.durationSec || 0)
  const [speed, setSpeed] = useState(1)
  const [expanded, setExpanded] = useState(false)

  const audioUrl = record?.audioUrl || null
  const transcript = Array.isArray(record?.transcript) ? record.transcript : []
  // MVP: 4 turns visible, 2 per side. Brief flagged the speaker label as a
  // future LLM call — for now everything from the agent is "Speaker".
  const visibleTranscript = expanded ? transcript : transcript.slice(0, 4)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = speed
  }, [speed])

  useEffect(() => {
    if (!playing) return
    let raf
    const tick = () => {
      const audio = audioRef.current
      if (audio) {
        setCurrentTime(audio.currentTime)
        if (audio.duration && Number.isFinite(audio.duration)) {
          setDuration(audio.duration)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const handleTogglePlay = () => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    if (playing) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
  }

  const handleScrub = (e) => {
    const audio = audioRef.current
    const value = Number(e.target.value)
    if (audio && Number.isFinite(value)) {
      audio.currentTime = value
      setCurrentTime(value)
    }
  }

  const handleCycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed)
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length])
  }

  const totalDuration = duration || record?.durationSec || 0

  return (
    <div className="callrecord">
      <div className="callrecord-head">
        <span className="callrecord-title">Voice call</span>
      </div>

      <div className="callrecord-player">
        <button
          className="callrecord-play"
          onClick={handleTogglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!audioUrl}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          )}
        </button>
        <input
          className="callrecord-scrub"
          type="range"
          min={0}
          max={totalDuration || 1}
          step="0.1"
          value={currentTime}
          onChange={handleScrub}
          disabled={!audioUrl}
          aria-label="Scrub"
        />
        <span className="callrecord-time">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
        <button
          className="callrecord-speed"
          onClick={handleCycleSpeed}
          aria-label="Playback speed"
          disabled={!audioUrl}
        >
          {speed}×
        </button>
      </div>
      {!audioUrl && (
        <p className="callrecord-pending">Saving recording…</p>
      )}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration)
            }
          }}
        />
      )}

      {transcript.length > 0 && (
        <div className="callrecord-transcript">
          {visibleTranscript.map((turn, idx) => (
            <div
              key={idx}
              className={`callrecord-turn callrecord-turn--${turn.role === 'user' ? 'user' : 'agent'}`}
            >
              <span className="callrecord-turn-label">
                {turn.role === 'user' ? 'You' : MVP_SPEAKER_LABEL}
              </span>
              <span className="callrecord-turn-text">{turn.content}</span>
            </div>
          ))}
          {transcript.length > visibleTranscript.length && (
            <button className="callrecord-expand" onClick={() => setExpanded(true)}>
              Show full transcript
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default CallRecordCard
