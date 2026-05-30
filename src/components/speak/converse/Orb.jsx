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
  connecting:         { scale: 0.88, drift: 0.10 },
  idle:               { scale: 0.88, drift: 0.10 },
  'learner-speaking': { scale: 1.00, drift: 0.10 },
  'agent-thinking':   { scale: 0.88, drift: 0.10 },
  'agent-speaking':   { scale: 1.00, drift: 0.55 },
  ending:             { scale: 0.70, drift: 0.08 },
  error:              { scale: 0.85, drift: 0.0  },
}

// Per-language palette: each language is its own "planet" with three tones
// derived from its flag. `deep` dominates the surface, `mid` is the
// transitional band, `light` is the bright highlight.
const FALLBACK_PALETTE = { light: '#FBFAF8', mid: '#A8A29E', deep: '#3D3934' }
const RED_PALETTE   = { light: '#FFFFFF', mid: '#F2A0A0', deep: '#C8102E' }
const BLUE_PALETTE  = { light: '#FFFFFF', mid: '#6A93D6', deep: '#0A3D8F' }
const GREEN_PALETTE = { light: '#FFFFFF', mid: '#7FC79A', deep: '#008C45' }

export const LANGUAGE_PALETTES = {
  English: RED_PALETTE,
  Spanish: RED_PALETTE,
  Russian: RED_PALETTE,
  French:  BLUE_PALETTE,
  Italian: GREEN_PALETTE,
}
export const paletteForLanguage = (language) =>
  LANGUAGE_PALETTES[language] || FALLBACK_PALETTE

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

// Hard-edged polychrome disc — Jupiter-from-orbit aesthetic. One octave of
// low-frequency 3D simplex noise (smooth, no high-frequency detail) gets
// gently domain-warped for slow drift, then mapped through three colour
// stops via smoothstep so the surface reads as soft atmospheric bands.
const FRAGMENT = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDrift;
  uniform vec3  uLight;
  uniform vec3  uMid;
  uniform vec3  uDeep;

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

    // Latitudinal stretch: squash Y so noise features compress into
    // horizontal bands like a rotating planet's atmosphere — not isotropic
    // round blobs. Then a tiny domain warp (much smaller than before) gives
    // the bands a gentle living waver without curling them into marble.
    float t = uTime * uDrift;
    vec2 sampleP = vec2(p.x, p.y * 1.7);
    vec2 warp = vec2(
      snoise(vec3(sampleP * 0.55, t * 0.20)),
      snoise(vec3(sampleP * 0.55 + vec2(31.7, 19.3), t * 0.20))
    ) * 0.07;

    float n = snoise(vec3((sampleP + warp) * 0.95, t * 0.32));
    n = n * 0.5 + 0.5;

    // Continuous, overlapping gradient between the three palette stops — no
    // plateaus, no boundary edges. Both blends span the full noise range so
    // the colour evolves smoothly from one extreme to the other across the
    // surface.
    vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.75, n));
    col = mix(col, uLight, smoothstep(0.55, 1.0, n));

    gl_FragColor = vec4(col, edge);
  }
`

const Orb = ({ state, palette, label }) => {
  const containerRef = useRef(null)
  // Latest values for the rAF loop to read without restarting on prop churn.
  const stateRef = useRef(state)
  const paletteRef = useRef(palette || FALLBACK_PALETTE)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { paletteRef.current = palette || FALLBACK_PALETTE }, [palette])

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

    const initialPalette = paletteRef.current
    const initialTarget = STATE_TARGETS[stateRef.current] || STATE_TARGETS.idle

    const uniforms = {
      uTime:  { value: 0 },
      uDrift: { value: initialTarget.drift },
      uLight: { value: new THREE.Color(initialPalette.light) },
      uMid:   { value: new THREE.Color(initialPalette.mid) },
      uDeep:  { value: new THREE.Color(initialPalette.deep) },
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
    const tickLight = new THREE.Color()
    const tickMid = new THREE.Color()
    const tickDeep = new THREE.Color()

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.066, (now - lastT) / 1000)
      lastT = now

      uniforms.uTime.value += dt

      const target = STATE_TARGETS[stateRef.current] || STATE_TARGETS.idle

      // Two-variable / three-state plan: drift (swirl speed) should belong
      // to the *current* state, not the transition. Snap it almost instantly
      // toward the target so the swirl never reads as a mid-speed in-between.
      // Scale keeps its slow settle (~450ms) so size visibly transitions.
      const scaleLerp = 1 - Math.pow(0.006, dt)
      const driftLerp = 1 - Math.pow(0.000001, dt) // ~150ms to target
      uniforms.uDrift.value += (target.drift - uniforms.uDrift.value) * driftLerp
      currentScale += (target.scale - currentScale) * scaleLerp
      canvas.style.transform = `scale(${currentScale.toFixed(3)})`

      const pal = paletteRef.current
      tickLight.set(pal.light)
      tickMid.set(pal.mid)
      tickDeep.set(pal.deep)
      uniforms.uLight.value.lerp(tickLight, scaleLerp)
      uniforms.uMid.value.lerp(tickMid, scaleLerp)
      uniforms.uDeep.value.lerp(tickDeep, scaleLerp)

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
