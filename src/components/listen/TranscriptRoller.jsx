import { useEffect, useRef, useState } from 'react'

const TranscriptRoller = ({ segments = [], activeIndex = 0 }) => {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const itemRefs = useRef([])
  const [offset, setOffset] = useState(0)

  itemRefs.current = []

  const updateOffset = () => {
    const container = containerRef.current
    const track = trackRef.current
    const activeItem = itemRefs.current[activeIndex]

    if (!container || !track || !activeItem) return

    const containerHeight = container.clientHeight
    const trackHeight = track.scrollHeight
    const itemCenter = activeItem.offsetTop + activeItem.offsetHeight / 2
    const targetCenter = containerHeight * 0.45
    const desiredOffset = itemCenter - targetCenter

    const maxOffset = Math.max(0, trackHeight - containerHeight)
    const constrainedOffset = Math.min(Math.max(0, desiredOffset), maxOffset)

    setOffset(constrainedOffset)
  }

  useEffect(() => {
    updateOffset()
  }, [activeIndex, segments])

  useEffect(() => {
    const handleResize = () => updateOffset()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="transcript-roller" ref={containerRef}>
      <div
        className="transcript-track"
        ref={trackRef}
        style={{ transform: `translateY(-${offset}px)` }}
      >
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
    </div>
  )
}

export default TranscriptRoller
