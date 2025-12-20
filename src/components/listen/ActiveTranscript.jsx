import React, { useEffect, useRef } from 'react'

const ActiveTranscript = ({
  segments = [],
  activeSegmentIndex = -1,
  showWordStatus = false,
  allowEditing = false,
}) => {
  const containerRef = useRef(null)

  useEffect(() => {
    if (activeSegmentIndex < 0) return
    const container = containerRef.current
    if (!container) return
    const activeEl = container.querySelector(`[data-index="${activeSegmentIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSegmentIndex])

  if (!segments.length) {
    return <p className="muted">Transcript not available for this chunk.</p>
  }

  return (
    <div className="active-transcript-shell" ref={containerRef}>
      {segments.map((segment, index) => (
        <div
          key={`${segment.start ?? index}-${segment.text?.slice(0, 10) || index}`}
          data-index={index}
          className={`active-transcript-line ${index === activeSegmentIndex ? 'active' : ''}`}
        >
          <div className="active-transcript-text">{segment.text}</div>
          {showWordStatus && (
            <div className="active-transcript-status muted tiny">
              {allowEditing ? 'Adjust word statuses' : 'Word statuses locked'}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default ActiveTranscript
