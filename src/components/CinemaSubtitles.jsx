import { useMemo } from 'react'

const normaliseSegments = (segments = []) =>
  (Array.isArray(segments) ? segments : [])
    .map((segment) => {
      const start = Number.isFinite(segment.start)
        ? Number(segment.start)
        : Number(segment.startMs) / 1000 || 0
      const end = Number.isFinite(segment.end)
        ? Number(segment.end)
        : Number(segment.endMs) / 1000 || start

      return {
        start,
        end: end > start ? end : start,
        text: segment.text || '',
      }
    })
    .filter((segment) => segment.text)

const CinemaSubtitles = ({ transcript, currentTime, renderHighlightedText, onWordSelect }) => {
  const normalisedTranscript = useMemo(() => normaliseSegments(transcript), [transcript])

  const activeSegment = useMemo(() => {
    if (!normalisedTranscript.length) return null

    const currentSeconds = Math.max(0, Number(currentTime) || 0)

    const index = normalisedTranscript.findIndex(
      (segment) => currentSeconds >= segment.start && currentSeconds < segment.end
    )

    return index >= 0 ? normalisedTranscript[index] : null
  }, [currentTime, normalisedTranscript])

  if (!normalisedTranscript.length) {
    return <span className="muted small">Subtitles will appear here once available.</span>
  }

  return (
    <div className="page-text" onMouseUp={onWordSelect} style={{ cursor: 'pointer', userSelect: 'text' }}>
      {activeSegment ? (
        renderHighlightedText(activeSegment.text || '')
      ) : (
        <span className="muted small">Move the playhead to see the matching subtitle line.</span>
      )}
    </div>
  )
}

export default CinemaSubtitles
