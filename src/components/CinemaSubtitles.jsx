import { useMemo } from 'react'

const CinemaSubtitles = ({ transcript, currentTime, renderHighlightedText, onWordSelect }) => {
  const activeSegment = useMemo(() => {
    if (!Array.isArray(transcript) || transcript.length === 0) return null

    const currentMs = Math.max(0, Math.round((currentTime || 0) * 1000))

    return (
      transcript.find(
        (segment) =>
          typeof segment.startMs === 'number' &&
          typeof segment.endMs === 'number' &&
          currentMs >= segment.startMs &&
          currentMs < segment.endMs
      ) || null
    )
  }, [currentTime, transcript])

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h4>Subtitles</h4>
      {!transcript?.length ? (
        <p className="muted small">
          Subtitles will appear here once they are available for this YouTube video.
        </p>
      ) : (
        <>
          <p className="muted small">Auto-synced to your playback time.</p>
          <div className="page-text" onMouseUp={onWordSelect} style={{ cursor: 'pointer', userSelect: 'text' }}>
            {activeSegment ? (
              renderHighlightedText(activeSegment.text || '')
            ) : (
              <span className="muted small">Move the playhead to see the matching subtitle line.</span>
            )}
          </div>
          {activeSegment && (
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              Showing subtitle for {(activeSegment.startMs / 1000).toFixed(1)}s–
              {(activeSegment.endMs / 1000).toFixed(1)}s
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default CinemaSubtitles
