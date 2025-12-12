import React from 'react'

const ChunkTimeline = ({ chunks = [], activeIndex = 0, completedSet = new Set() }) => (
  <div className="chunk-timeline" aria-label="Chunk timeline">
    <h3 className="muted tiny">Chunks</h3>
    <ul className="chunk-list">
      {chunks.map((chunk) => {
        const isActive = chunk.index === activeIndex
        const isCompleted = completedSet.has(chunk.index)
        return (
          <li
            key={chunk.index}
            className={`chunk-list-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
          >
            <div className="chunk-pill">
              <span className="chunk-number">{String(chunk.index + 1).padStart(2, '0')}</span>
              {isCompleted && <span className="chunk-status">✓</span>}
              {isActive && !isCompleted && <span className="chunk-status">▶</span>}
            </div>
            <div className="chunk-range muted tiny">
              {chunk.labelStart} – {chunk.labelEnd}
            </div>
          </li>
        )
      })}
    </ul>
  </div>
)

export default ChunkTimeline
