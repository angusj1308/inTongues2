import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Audio-reactive WebGL orb: a single full-quad fragment shader that combines
// multi-octave 3D simplex noise with a soft radial falloff. No defined edge,
// no solid surface — reads as drifting fog/breath caught in light. State,
// amplitude, and theme colour drive uniforms; the shader does the rest.

// State → target uniform values. The render loop lerps current values toward
// these every frame so transitions are smooth.
const STATE_TARGETS = {
  connecting:         { density: 0.48, drift: 0.28, breathe: 0.18, breatheRate: 0.45 },
  idle:               { density: 0.74, drift: 0.38, breathe: 0.12, breatheRate: 0.28 },
  'learner-speaking': { density: 0.98, drift: 1.25, breathe: 0.04, breatheRate: 0.0  },
  'agent-thinking':   { density: 0.78, drift: 0.62, breathe: 0.20, breatheRate: 1.40 },
  'agent-speaking':   { density: 0.98, drift: 1.25, breathe: 0.04, breatheRate: 0.0  },
  ending:             { density: 0.0,  drift: 0.20, breathe: 0.0,  breatheRate: 0.0  },
  error:              { density: 0.32, drift: 0.10, breathe: 0.0,  breatheRate: 0.0  },
}

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

// Fragment shader — combines public-domain 3D simplex noise (Ashima Arts,
// Stefan Gustavson) with a soft radial falloff to render an edgeless cloud.
const FRAGMENT = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDensity;
  uniform float uDrift;
  uniform float uAmplitude;
  uniform float uBreathe;
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
    // Centre UV in -1..1 range.
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);

    // Soft radial falloff. Amplitude expands the orb slightly so it visibly
    // grows when the speaker is loud. Breathe oscillates it during idle /
    // thinking states.
    float radius = 0.78 + uAmplitude * 0.14 + uBreathe * 0.05;
    float falloff = 1.0 - smoothstep(radius * 0.05, radius * 1.05, r);

    // Three octaves of drifting 3D noise. Time becomes the z-axis so the
    // pattern slides through 3D space — much more organic than 2D scrolling.
    float t = uTime * uDrift;
    float n  = snoise(vec3(p * 1.2, t * 0.40));
    n       += snoise(vec3(p * 2.6, t * 0.75)) * 0.55;
    n       += snoise(vec3(p * 5.0, t * 1.10)) * 0.28;
    // Map roughly into 0..1 — clamp later.
    n = n * 0.5 + 0.5;

    // Final alpha: falloff masks the noise; density + amplitude + breathe
    // raise the overall opacity; pow on falloff softens the apparent edge.
    float density = uDensity + uAmplitude * 0.22 + uBreathe * 0.06;
    float alpha = pow(falloff, 1.4) * mix(0.18, 1.0, n) * density;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(uColor, alpha);
  }
`

const Orb = ({ state, amplitude = 0, color, label }) => {
  const mountRef = useRef(null)
  // Refs let the render loop read latest props without restarting the effect.
  const stateRef = useRef(state)
  const colorRef = useRef(color)
  const ampRef = useRef(amplitude)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { ampRef.current = amplitude }, [amplitude])

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const initialWidth = container.clientWidth || 320
    const initialHeight = container.clientHeight || 320

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(initialWidth, initialHeight, false)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // Orthographic camera covering the -1..1 quad exactly. We use a full
    // viewport quad in NDC, so no camera math is needed beyond construction.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const initialColour = new THREE.Color(colorRef.current || '#1C1A17')
    const target = STATE_TARGETS[stateRef.current] || STATE_TARGETS.idle
    const uniforms = {
      uTime:      { value: 0 },
      uDensity:   { value: target.density },
      uDrift:     { value: target.drift },
      uAmplitude: { value: 0 },
      uBreathe:   { value: 0 },
      uColor:     { value: initialColour },
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
    let smoothedAmp = 0
    let breathePhase = 0
    const tickColour = new THREE.Color()

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.066, (now - lastT) / 1000)
      lastT = now

      uniforms.uTime.value += dt

      const stateTarget = STATE_TARGETS[stateRef.current] || STATE_TARGETS.idle

      // Lerp roughly 90% over ~400ms toward the target uniform values.
      // Time-base the lerp so the rate is framerate-independent.
      const lerpRate = 1 - Math.pow(0.003, dt)
      uniforms.uDensity.value += (stateTarget.density - uniforms.uDensity.value) * lerpRate
      uniforms.uDrift.value   += (stateTarget.drift   - uniforms.uDrift.value)   * lerpRate

      // Amplitude has its own faster smoothing so reactivity feels live.
      const ampRate = 1 - Math.pow(0.0005, dt)
      smoothedAmp += (ampRef.current - smoothedAmp) * ampRate
      uniforms.uAmplitude.value = smoothedAmp

      // Breathe is a slow sinusoidal oscillation whose rate depends on state.
      if (stateTarget.breatheRate > 0) {
        breathePhase += dt * stateTarget.breatheRate * Math.PI
        uniforms.uBreathe.value = Math.sin(breathePhase) * stateTarget.breathe
      } else {
        // Decay any leftover oscillation when we leave a breathing state.
        uniforms.uBreathe.value *= Math.pow(0.001, dt)
      }

      // Theme colour follows the prop — lerp so dark/light toggle isn't a snap.
      if (colorRef.current) {
        tickColour.set(colorRef.current)
        uniforms.uColor.value.lerp(tickColour, lerpRate)
      }

      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    tick()

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || 320
      const h = container.clientHeight || 320
      renderer.setSize(w, h, false)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={mountRef}
      className={`orb orb--${state}`}
      role="img"
      aria-label={label || state}
    />
  )
}

export default Orb
