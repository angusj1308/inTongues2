import { useEffect, useRef } from 'react'

// Plain monochrome circle. Colour matches the page foreground (passed via
// the `color` prop) and state drives a CSS animation; amplitude drives a
// small scale pulse during the speaking states.
const Orb = ({ state, amplitude = 0, color, label }) => {
  const ref = useRef(null)
  const smoothedRef = useRef(0)
  const rafRef = useRef(0)
  // Keep latest amplitude in a ref so the rAF loop can read it without
  // re-running on every prop change (~60Hz). The loop runs continuously
  // and only restarts on state changes.
  const ampRef = useRef(amplitude)
  useEffect(() => { ampRef.current = amplitude }, [amplitude])

  useEffect(() => {
    const tick = () => {
      const node = ref.current
      // Smooth the amplitude so the pulse doesn't jitter on raw frame data.
      smoothedRef.current += (ampRef.current - smoothedRef.current) * 0.2
      if (node) {
        const reactive = state === 'learner-speaking' || state === 'agent-speaking'
        const scale = reactive ? 1 + smoothedRef.current * 0.18 : 1
        node.style.transform = `scale(${scale.toFixed(3)})`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state])

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
