import React from 'react'
import ActiveStepGate from './ActiveStepGate'
import ActiveTranscript from './ActiveTranscript'
import ChunkTimeline from './ChunkTimeline'

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const floored = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(floored / 60)
  const secs = floored % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const ActiveMode = ({
  storyMeta,
  chunks = [],
  activeChunkIndex = 0,
  completedChunks = new Set(),
  activeStep = 1,
  isPlaying = false,
  playbackPositionSeconds = 0,
  playbackDurationSeconds = 0,
  onPlayPause,
  onSeek,
  transcriptSegments = [],
  activeTranscriptIndex = -1,
  onBeginFinalListen,
  onRestartChunk,
}) => {
  const currentChunk = chunks[activeChunkIndex]
  const chunkStart = currentChunk?.start ?? 0
  const chunkEnd = currentChunk?.end ?? playbackDurationSeconds
  const chunkProgress = chunkEnd
    ? Math.min(100, ((playbackPositionSeconds - chunkStart) / (chunkEnd - chunkStart)) * 100)
    : 0

  const withinChunk = (delta) => {
    if (!currentChunk) return playbackPositionSeconds + delta
    return Math.min(chunkEnd, Math.max(chunkStart, playbackPositionSeconds + delta))
  }

  const stepAllowsTranscript = activeStep === 2 || activeStep === 3
  const allowEditing = activeStep === 3
  const showWordStatus = activeStep === 2 || activeStep === 3

  const filteredSegments = transcriptSegments.filter((segment) => {
    if (typeof segment.start !== 'number' || typeof segment.end !== 'number') return true
    return segment.start >= chunkStart && segment.start < chunkEnd
  })

  return (
    <div className="active-mode-grid">
      <div className="active-sidebar">
        <ChunkTimeline chunks={chunks} activeIndex={activeChunkIndex} completedSet={completedChunks} />
      </div>

      <div className="active-main">
        <ActiveStepGate step={activeStep} />

        <div className="active-audio-card">
          <div className="active-meta">
            <div className="muted tiny">Chunk {String((currentChunk?.index || 0) + 1).padStart(2, '0')}</div>
            <div className="active-range">
              {formatTime(chunkStart)} – {formatTime(chunkEnd)}
            </div>
            <h3 className="active-title">{storyMeta.title || 'Audiobook'}</h3>
          </div>

          <div className="progress-shell">
            <span className="muted tiny">{formatTime(playbackPositionSeconds)}</span>
            <input
              type="range"
              min={chunkStart}
              max={chunkEnd}
              step="0.1"
              value={Math.min(Math.max(playbackPositionSeconds, chunkStart), chunkEnd)}
              onChange={(event) => onSeek(Number(event.target.value))}
              aria-label="Chunk progress"
            />
            <span className="muted tiny">{formatTime(chunkEnd)}</span>
          </div>

          <div className="transport-row">
            <button type="button" className="transport-btn" onClick={() => onSeek(chunkStart)}>
              Start chunk
            </button>
            <button type="button" className="transport-btn" onClick={() => onSeek(withinChunk(-10))}>
              −10s
            </button>
            <button type="button" className="transport-btn transport-btn-primary" onClick={onPlayPause}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="transport-btn" onClick={() => onSeek(withinChunk(10))}>
              +10s
            </button>
            <button type="button" className="transport-btn" onClick={onRestartChunk}>
              Restart
            </button>
          </div>

          <div className="active-progress-indicator">
            <div className="active-progress-bar">
              <div className="active-progress-fill" style={{ width: `${chunkProgress}%` }} />
            </div>
            <div className="muted tiny">
              {Math.round(chunkProgress)}% of this chunk | {chunks.length} chunks total
            </div>
          </div>
        </div>
      </div>

      <div className="active-transcript-pane">
        {!stepAllowsTranscript ? (
          <div className="transcript-locked">Subtitles are off for this pass.</div>
        ) : (
          <ActiveTranscript
            segments={filteredSegments}
            activeSegmentIndex={activeTranscriptIndex}
            showWordStatus={showWordStatus}
            allowEditing={allowEditing}
          />
        )}

        {activeStep === 3 && (
          <div className="active-cta">
            <button type="button" className="button" onClick={onBeginFinalListen}>
              Begin final listen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ActiveMode
