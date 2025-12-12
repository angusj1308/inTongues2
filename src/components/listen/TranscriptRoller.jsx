import { useEffect, useRef } from 'react'

const TranscriptRoller = ({ segments = [], activeIndex = 0 }) => {
  const containerRef = useRef(null)
  const itemRefs = useRef([])

  useEffect(() => {
    if (!containerRef.current) return
    const target = itemRefs.current[activeIndex]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex, segments])

  return (
    <div className="transcript-roller" ref={containerRef}>
      {segments.map((segment, index) => (
        <div
          key={`${segment.start ?? index}-${segment.text?.slice(0, 12) || index}`}
          ref={(el) => {
            itemRefs.current[index] = el
          }}
          className={`transcript-line ${index === activeIndex ? 'active' : ''}`}
        >
          {segment.text || ''}
        </div>
      ))}
    </div>
  )
}

export default TranscriptRoller
