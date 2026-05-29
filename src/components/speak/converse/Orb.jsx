import { useEffect, useRef } from 'react'

// Monochrome, motion-driven orb. Colour matches the page foreground —
// dark on light, ivory on dark — so meaning is carried by intensity,
// pulse rate, and amplitude reactivity, never by hue.
//
// state: 'connecting' | 'idle' | 'learner-speaking' | 'agent-thinking' | 'agent-speaking' | 'ending' | 'error'
// amplitude: 0..1 normalized RMS — drives scale during speaking states.
const Orb = ({ state, amplitude = 0, label }) => {
  // Smooth amplitude so the orb doesn't jitter on raw frame data.
  const smoothedRef = useRef(0)
  const targetRef = useRef(0)
  const rafRef = useRef(null)
  const innerRef = useRef(null)

  useEffect(() => {
    targetRef.current = amplitude
  }, [amplitude])

  useEffect(() => {
    const tick = () => {
      // Low-pass filter (~120ms time constant).
      smoothedRef.current += (targetRef.current - smoothedRef.current) * 0.18
      const node = innerRef.current
      if (node) {
        // Active scale ranges by state: speaking states react big,
        // idle/connecting only breathe gently.
        const reactive =
          state === 'learner-speaking' || state === 'agent-speaking'
            ? 0.35
            : 0
        const base = state === 'connecting' || state === 'idle' ? 0 : 0
        const s = 1 + base + smoothedRef.current * reactive
        node.style.transform = `scale(${s.toFixed(3)})`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state])

  return (
    <div className={`orb orb--${state}`} role="img" aria-label={label || state}>
      <span className="orb-ring orb-ring--outer" aria-hidden="true" />
      <span className="orb-ring orb-ring--mid" aria-hidden="true" />
      <span ref={innerRef} className="orb-core" aria-hidden="true" />
    </div>
  )
}

export default Orb
