import React from 'react'

const ChunkTimeline = ({
  chunks = [],
  activeIndex = 0,
  completedSet = new Set(),
  onSelectChunk = () => {},
  isChunkLocked,
}) => (
  <div className="chunk-timeline" aria-label="Chunk timeline">
    <ul className="chunk-list">
      {chunks.map((chunk) => {
        const isActive = chunk.index === activeIndex
        const isCompleted = completedSet.has(chunk.index)
        const locked = typeof isChunkLocked === 'function' ? isChunkLocked(chunk.index) : chunk.index > activeIndex
        return (
          <li
            key={chunk.index}
            className={`chunk-list-item ${isActive ? 'is-current' : ''} ${isCompleted ? 'is-completed' : ''} ${
              locked ? 'is-future' : ''
            }`}
          >
            <button
              type="button"
              className="chunk-button"
              onClick={() => !locked && onSelectChunk(chunk.index)}
              disabled={locked}
              aria-label={locked ? `Chunk ${chunk.index + 1} unavailable` : `Go to chunk ${chunk.index + 1}`}
            >
              <div className="chunk-line">
                <span className="chunk-number">Chunk {String(chunk.index + 1).padStart(2, '0')}</span>
                <span className="chunk-time">
                  {chunk.labelStart} – {chunk.labelEnd}
                </span>
                {isCompleted && <span className="chunk-status" aria-hidden="true">✓</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  </div>
)

export default ChunkTimeline
