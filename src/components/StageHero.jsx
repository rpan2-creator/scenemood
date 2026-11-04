import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildHuman, setHumanStyle } from '../engine/humans.js'
import { SENSOR_W } from '../engine/checks.js'

// The landing stage: one stand-in on a black set, a ring light behind her and the cursor as
// the key light. Scrolling moves the camera through the setups a scene would be shot in,
// and the last beat rises overhead to show the same moment as a blocking diagram.
export const BEATS = [
  { code: '1A', size: 'Wide', mm: 24, h: 1.35, off: 0.17, pos: [0.0, 1.35, 5.4], look: [0, 1.0, 0],
    title: ['See the shot', 'before the set exists.'], body: 'Describe the scene once. SceneMood builds the location in 3D at its real size, with the actors, the props and the lights your crew owns.' },
  { code: '1B', size: 'Medium', mm: 35, h: 1.45, off: 0.1, pos: [1.9, 1.45, 3.6], look: [0, 1.22, 0],
    title: ['Light it', 'with your own kit.'], body: 'Move your cursor: it is the key light. Every fixture in a plan is one you have, with its real output, so nothing on set comes as a surprise.' },
  { code: '1C', size: 'Close-up', mm: 75, h: 1.58, off: 0.12, pos: [1.05, 1.58, 2.9], look: [0, 1.5, 0],
    title: ['Frame', 'every lens.'], body: 'Each camera is a real focal length at a real height. What you see through it is what it will record on the day.' },
  { code: '1D', size: 'Overhead', mm: 24, h: 8.5, off: 0.14, pos: [0.01, 8.5, 0.5], look: [0, 0, 0.3],
    title: ['Hand the crew', 'a storyboard.'], body: 'Every camera becomes a panel in shooting order, with the blocking diagram and what has to change between setups.' },
]

const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const vfov = (mm, aspect) => 2 * Math.atan(Math.tan(Math.atan(SENSOR_W / (2 * mm))) / aspect) * 180 / Math.PI

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')
  const r = g.createRadialGradient(128, 128, 60, 128, 128, 128)
  r.addColorStop(0, 'rgba(255,250,240,0)'); r.addColorStop(0.42, 'rgba(255,250,240,0.55)'); r.addColorStop(0.5, 'rgba(255,250,240,0.9)'); r.addColorStop(0.58, 'rgba(255,250,240,0.35)'); r.addColorStop(1, 'rgba(255,250,240,0)')
  g.fillStyle = r; g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Floor marks the crew would put down: an actor's T-mark and the camera positions, drawn as tape.
function tapeMarks() {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0xf3f1ec, transparent: true, opacity: 0 })
  const bar = (w, d, x, z, rot = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, 0.003, z); g.add(m) }
  bar(0.5, 0.05, 0, 0.18); bar(0.05, 0.36, 0, 0.0)
  for (const b of BEATS.slice(0, 3)) {
    const a = Math.atan2(b.pos[0], b.pos[2])
    const r = Math.hypot(b.pos[0], b.pos[2])
    const x = Math.sin(a) * Math.min(r, 3.4), z = Math.cos(a) * Math.min(r, 3.4)
    bar(0.34, 0.04, x, z, -a); bar(0.04, 0.34, x, z, -a)
    const len = Math.min(r, 3.4) - 0.45
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.012, len), mat)
    line.rotation.x = -Math.PI / 2; line.rotation.z = -a
    line.position.set(Math.sin(a) * (len / 2 + 0.3), 0.003, Math.cos(a) * (len / 2 + 0.3)); g.add(line)
  }
  g.userData.mat = mat
  return g
}

export default function StageHero({ onProgress, children }) {
  const wrap = useRef(null)
  const canvas = useRef(null)
  const [beat, setBeat] = useState(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let renderer
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, powerPreference: 'high-performance' }) } catch { setFailed(true); return }
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x030303)
    scene.fog = new THREE.Fog(0x030303, 7, 16)
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 60)

    // a black stage floor that catches the light and the actor's shadow
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.55, metalness: 0.0 }))
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
    const marks = tapeMarks(); scene.add(marks)

    // ring light behind the actor: an emissive ring, a glow and a soft back light
    const ring = new THREE.Group(); ring.position.set(0, 1.5, -1.05)
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.014, 12, 160), new THREE.MeshBasicMaterial({ color: 0xfffaf0 })))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }))
    glow.scale.set(2.7, 2.7, 1); glow.material.opacity = 0.6; ring.add(glow)
    scene.add(ring)
    const rim = new THREE.SpotLight(0xfff2e0, 60, 9, 0.75, 0.6, 2); rim.position.set(-0.6, 2.4, -2.2); rim.target.position.set(0, 1.3, 0); scene.add(rim, rim.target)
    const rim2 = new THREE.SpotLight(0xe8efff, 35, 9, 0.7, 0.7, 2); rim2.position.set(1.1, 2.0, -2.0); rim2.target.position.set(0, 1.3, 0); scene.add(rim2, rim2.target)
    // the key light: follows the cursor across a dome in front of the actor
    const key = new THREE.SpotLight(0xffe6c4, 70, 12, 0.42, 0.55, 2)
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004
    key.position.set(-1.6, 2.2, 2.4); key.target.position.set(0, 1.35, 0); scene.add(key, key.target)
    scene.add(new THREE.HemisphereLight(0x8a8f99, 0x000000, 0.06))

    let actor
    setHumanStyle('real')
    buildHuman({ id: 'actor_b', model: 'female', pose: 'stand', tone: 'medium' }).then((g) => {
      actor = g; g.rotation.y = 0.35
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      scene.add(g); setReady(true)
    }).catch(() => setFailed(true))

    const ptr = { x: -0.45, y: 0.25, tx: -0.45, ty: 0.25 }
    const onMove = (e) => { const r = wrap.current.getBoundingClientRect(); ptr.tx = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.ty = 1 - ((e.clientY - r.top) / Math.min(r.height, window.innerHeight)) * 2 }
    window.addEventListener('pointermove', onMove)

    let size = [0, 0]
    const resize = () => {
      const w = canvas.current.clientWidth, h = canvas.current.clientHeight
      if (w === size[0] && h === size[1]) return
      size = [w, h]; renderer.setSize(w, h, false); cam.aspect = w / h
      // compose off-centre: the actor sits right of frame, the titles get the left third
    }
    let progress = 0, last = -1, raf, visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(wrap.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible) return
      resize()
      const r = wrap.current.getBoundingClientRect()
      const span = Math.max(1, r.height - window.innerHeight)
      const target = Math.min(1, Math.max(0, -r.top / span))
      progress = reduce ? target : lerp(progress, target, 0.12)
      const f = progress * (BEATS.length - 1)
      const i = Math.min(BEATS.length - 2, Math.floor(f))
      // hold on each setup, then move: the camera dwells before travelling to the next mark
      const raw = f - i
      const t = ease(Math.min(1, Math.max(0, (raw - 0.35) / 0.65)))
      const a = BEATS[i], b = BEATS[i + 1]
      cam.position.set(lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t))
      const look = [lerp(a.look[0], b.look[0], t), lerp(a.look[1], b.look[1], t), lerp(a.look[2], b.look[2], t)]
      // a slight handheld drift so the frame feels like a camera, not a render
      const tt = performance.now() / 1000
      if (!reduce) { cam.position.x += Math.sin(tt * 0.6) * 0.012; cam.position.y += Math.sin(tt * 0.83) * 0.008 }
      cam.fov = vfov(lerp(a.mm, b.mm, t), cam.aspect)
      // landscape: actor right of frame, titles on the left. Portrait: actor above the titles.
      const portrait = cam.aspect < 0.9
      if (portrait) { cam.position.lerp(new THREE.Vector3(...look), 0.35); cam.fov = vfov(lerp(a.mm, b.mm, t) * 0.62, cam.aspect) }
      const off = cam.aspect > 1.2 ? lerp(a.off, b.off, t) : 0
      if (off) cam.setViewOffset(size[0], size[1], -size[0] * off, 0, size[0], size[1])
      else if (portrait) cam.setViewOffset(size[0], size[1], 0, size[1] * 0.2, size[0], size[1])
      else cam.clearViewOffset()
      cam.lookAt(look[0], look[1], look[2])
      cam.updateProjectionMatrix()
      const nb = Math.round(f)
      if (nb !== last) { last = nb; setBeat(nb); onProgress?.(nb) }
      marks.userData.mat.opacity = Math.max(0, (f - 2.2) / 0.8) * 0.85
      ptr.x = lerp(ptr.x, ptr.tx, 0.08); ptr.y = lerp(ptr.y, ptr.ty, 0.08)
      const az = ptr.x * 1.25, el = 0.25 + Math.max(-0.2, ptr.y) * 0.6
      key.position.set(Math.sin(az) * 3, 1.3 + Math.sin(el) * 2.2, Math.cos(az) * 3)
      if (actor) actor.rotation.y = 0.35 + Math.sin(tt * 0.25) * 0.03
      renderer.render(scene, cam)
    }
    tick()
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('pointermove', onMove); renderer.dispose() }
  }, [])

  const b = BEATS[beat]
  return (
    <section className="stage" ref={wrap} aria-label="SceneMood in four setups">
      <div className="stage-pin">
        <canvas ref={canvas} className={'stage-canvas' + (ready ? ' on' : '')} aria-hidden="true" />
        {failed && <img className="stage-fallback" src="hero/apartment.jpg" alt="" />}
        {!ready && !failed && <div className="stage-load mono">Building the set…</div>}
        <div className="stage-vf" aria-hidden="true"><i /><i /><i /><i /></div>
        <ol className="stage-codes" aria-label="Setups">
          {BEATS.map((x, i) => <li key={x.code} className={i === beat ? 'on' : i < beat ? 'done' : ''}><span className="mono">{x.code}</span><em>{x.size}</em></li>)}
        </ol>
        <div className="stage-copy" key={beat}>
          <h1 className="stage-t">{b.title.map((l) => <span key={l}>{l}</span>)}</h1>
          <p>{b.body}</p>
        </div>
        <div className="stage-cta">{children}</div>
        <div className="stage-hud mono" aria-hidden="true">
          <span className="rec"><i />Cam A</span><span>{b.mm} mm</span><span>{b.h.toFixed(2)} m</span><span>T2.8</span><span>ISO 800</span><span>{b.size}</span>
        </div>
        <div className="stage-hint mono" aria-hidden="true">{beat === 1 ? 'Move the cursor to light her' : 'Scroll to change setup'}</div>
      </div>
    </section>
  )
}
