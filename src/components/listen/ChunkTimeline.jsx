import React from 'react'

const ChunkTimeline = ({
  chunks = [],
  activeIndex = 0,
  completedSet = new Set(),
  onSelectChunk = () => {},
  isChunkLocked,
}) => (
  <div className="chunk-timeline" aria-label="Chunk timeline">
    <div className="chunk-timeline-heading">Chunks</div>
    <ul className="chunk-list">
      {chunks.map((chunk) => {
        const isActive = chunk.index === activeIndex
        const isCompleted = completedSet.has(chunk.index)
        const locked = typeof isChunkLocked === 'function' ? isChunkLocked(chunk.index) : chunk.index > activeIndex
        return (
          <li
            key={chunk.index}
            className={`chunk-list-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${
              locked ? 'locked' : ''
            }`}
          >
            <button
              type="button"
              className="chunk-button"
              onClick={() => !locked && onSelectChunk(chunk.index)}
              disabled={locked}
              aria-label={locked ? 'Chunk locked' : `Go to chunk ${chunk.index + 1}`}
            >
              <span className="chunk-rail-marker" aria-hidden="true" />
              <div className="chunk-line">
                <span className="chunk-number">{String(chunk.index + 1).padStart(2, '0')}</span>
                <span className="chunk-label">{chunk.labelStart}</span>
                <span className="chunk-divider" aria-hidden="true">·</span>
                <span className="chunk-label">{chunk.labelEnd}</span>
                {isCompleted && <span className="chunk-status" aria-hidden="true">✓</span>}
                {locked && !isCompleted && <span className="chunk-status" aria-hidden="true">🔒</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  </div>
)

export default ChunkTimeline
