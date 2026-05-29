import { useEffect, useRef } from 'react'

// Plain monochrome circle. Colour matches the page foreground (passed via
// the `color` prop) and state drives a CSS animation; amplitude drives a
// small scale pulse during the speaking states.
const Orb = ({ state, amplitude = 0, color, label }) => {
  const ref = useRef(null)
  const smoothedRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const tick = () => {
      const node = ref.current
      // Smooth the amplitude so the pulse doesn't jitter on raw frame data.
      smoothedRef.current += (amplitude - smoothedRef.current) * 0.2
      if (node) {
        const reactive = state === 'learner-speaking' || state === 'agent-speaking'
        const scale = reactive ? 1 + smoothedRef.current * 0.18 : 1
        node.style.transform = `scale(${scale.toFixed(3)})`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, amplitude])

  return (
    <div className={`orb orb--${state}`} role="img" aria-label={label || state}>
      <span
        ref={ref}
        className="orb-disc"
        style={color ? { backgroundColor: color } : undefined}
      />
    </div>
  )
}

export default Orb
