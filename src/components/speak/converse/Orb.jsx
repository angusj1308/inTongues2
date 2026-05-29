import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Two binary inputs give us the three visible states:
//   transmission  (any sound) → orb sits at the "bigger" size
//   none / silent             → orb sits at the "smaller" size
//   agent-speaking            → swirl runs fast
//   anything else             → swirl runs slow
//
// State combinations:
//   silent          → small  + slow swirl
//   learner-speaking→ bigger + slow swirl
//   agent-speaking  → bigger + fast swirl
//
// Transitions lerp toward target each frame so the orb settles, no pulsing.
const STATE_TARGETS = {
  connecting:         { scale: 0.88, drift: 0.25 },
  idle:               { scale: 0.88, drift: 0.25 },
  'learner-speaking': { scale: 1.00, drift: 0.25 },
  'agent-thinking':   { scale: 0.88, drift: 0.25 },
  'agent-speaking':   { scale: 1.00, drift: 1.55 },
  ending:             { scale: 0.70, drift: 0.20 },
  error:              { scale: 0.85, drift: 0.0  },
}

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

// Hard-edged monochrome disc with internal swirling motion via domain-warped
// 3D simplex noise. Edge is essentially binary (tiny smoothstep for AA),
// interior alpha modulates between ~0.55 and 1.0 so the swirls read clearly
// without the disc losing its solid presence.
const FRAGMENT = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDrift;
  uniform vec3  uColor;

  // --- Simplex 3D noise (Ashima / Stefan Gustavson, public domain) ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 =   v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);

    // Hard circular boundary with a one-pixel smoothstep for anti-aliasing.
    float edge = 1.0 - smoothstep(0.97, 1.0, r);
    if (edge < 0.001) discard;

    // Domain-warped noise creates the swirling, gel-like internal motion.
    // The warp offset is itself a noise field that drifts with time; sampling
    // primary noise at the warped position produces curling, eddying patterns
    // instead of straight scrolling.
    float t = uTime * uDrift;
    vec2 warp = vec2(
      snoise(vec3(p * 1.4, t * 0.40)),
      snoise(vec3(p * 1.4 + vec2(31.7, 19.3), t * 0.40))
    ) * 0.50;

    float n  = snoise(vec3((p + warp) * 1.9, t * 0.55));
    n       += snoise(vec3((p + warp) * 3.8, t * 0.85)) * 0.55;
    n       += snoise(vec3((p + warp) * 6.5, t * 1.20)) * 0.28;
    n = n * 0.5 + 0.5;

    // Keep the disc reading as a solid object — internal alpha never drops
    // below 0.55 so the silhouette is always defined.
    float alpha = edge * mix(0.55, 1.0, n);

    gl_FragColor = vec4(uColor, alpha);
  }
`

const Orb = ({ state, color, label }) => {
  const containerRef = useRef(null)
  // Latest values for the rAF loop to read without restarting on prop churn.
  const stateRef = useRef(state)
  const colorRef = useRef(color)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { colorRef.current = color }, [color])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const sizePx = container.clientWidth || 160
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(sizePx, sizePx, false)
    renderer.setClearColor(0x000000, 0)
    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.transformOrigin = 'center center'
    canvas.style.willChange = 'transform'
    container.appendChild(canvas)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const initialColour = new THREE.Color(colorRef.current || '#1C1A17')
    const initialTarget = STATE_TARGETS[stateRef.current] || STATE_TARGETS.idle

    const uniforms = {
      uTime:  { value: 0 },
      uDrift: { value: initialTarget.drift },
      uColor: { value: initialColour },
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
      transparent: true,
      depthWrite: false,
    })
    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    let rafId = 0
    let lastT = performance.now()
    let currentScale = initialTarget.scale
    const tickColour = new THREE.Color()

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.066, (now - lastT) / 1000)
      lastT = now

      uniforms.uTime.value += dt

      const target = STATE_TARGETS[stateRef.current] || STATE_TARGETS.idle

      // Lerp roughly 90% over ~450ms toward the target — smooth settle, no
      // pulse. Time-based so it's framerate-independent.
      const lerpRate = 1 - Math.pow(0.006, dt)
      uniforms.uDrift.value += (target.drift - uniforms.uDrift.value) * lerpRate
      currentScale += (target.scale - currentScale) * lerpRate
      canvas.style.transform = `scale(${currentScale.toFixed(3)})`

      if (colorRef.current) {
        tickColour.set(colorRef.current)
        uniforms.uColor.value.lerp(tickColour, lerpRate)
      }

      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    tick()

    const ro = new ResizeObserver(() => {
      const s = container.clientWidth || 160
      renderer.setSize(s, s, false)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`orb orb--${state}`}
      role="img"
      aria-label={label || state}
    />
  )
}

export default Orb
