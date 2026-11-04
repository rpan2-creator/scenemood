import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { getAsset, instance, loadAsset } from '../data/assets.js'
import { SENSOR_W } from '../engine/checks.js'

// The landing stage: a living-room set built on a black sound stage, the way a crew sees it the
// night before. One flat with a window, the furniture on its marks, a ring light hanging behind.
// Scrolling walks the camera through the prep: the empty set, lighting it (the cursor moves the
// LED panel on its stand), looking through the lens, then overhead to the floor plan.
export const BEATS = [
  { code: '01', size: 'The set', mm: 28, off: 0.16, pos: [5.6, 3.1, 6.6], look: [0, 0.7, -0.4],
    title: ['See the shot', 'before the set exists.'], body: 'Describe the location once. SceneMood builds it in 3D at its real size, with the furniture on its marks and the lights your crew owns.' },
  { code: '02', size: 'Lighting', mm: 32, off: 0.12, pos: [-4.6, 2.3, 4.4], look: [-0.2, 0.8, -0.6],
    title: ['Light it', 'with your own kit.'], body: 'Move your cursor: the LED panel follows it on its stand. Every fixture in a plan is one you have, at its real output.' },
  { code: '03', size: 'The lens', mm: 28, off: 0.05, pos: [0.35, 1.2, 3.6], look: [0.05, 0.7, -1.3],
    title: ['Look through', 'every lens.'], body: 'Each camera is a real focal length at a real height. What you see through it is what it records on the day.' },
  { code: '04', size: 'Overhead', mm: 24, off: 0.14, pos: [0.01, 10.5, 1.2], look: [0, 0, 0.6],
    title: ['Hand the crew', 'a storyboard.'], body: 'Every camera becomes a panel in shooting order, with the floor plan and what changes between setups.' },
]

const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const vfov = (mm, aspect) => 2 * Math.atan(Math.tan(Math.atan(SENSOR_W / (2 * mm))) / aspect) * 180 / Math.PI

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')
  const r = g.createRadialGradient(128, 128, 70, 128, 128, 128)
  r.addColorStop(0, 'rgba(255,250,240,0)'); r.addColorStop(0.45, 'rgba(255,250,240,0.4)'); r.addColorStop(0.52, 'rgba(255,250,240,0.85)'); r.addColorStop(0.6, 'rgba(255,250,240,0.25)'); r.addColorStop(1, 'rgba(255,250,240,0)')
  g.fillStyle = r; g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

const SET = [
  ['rug', 0, -0.25, 0], ['sofa', 0, -1.15, 0], ['coffee_round', 0, -0.15, 0], ['floor_lamp', 2.15, -1.55, -0.6],
  ['plant_tall', -1.75, -1.35, 0], ['side_table', -1.2, -1.2, 0], ['books', 0.1, -0.12, 0], ['armchair', 1.55, 0.35, -2.2],
]
const W = 5.2, D = 4.2

// A set flat: the wall the camera sees, with a window cut out and the braces behind it.
function flat(mat, braceMat) {
  const g = new THREE.Group()
  const shape = new THREE.Shape()
  shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, 2.7); shape.lineTo(-W / 2, 2.7); shape.lineTo(-W / 2, 0)
  const hole = new THREE.Path(); hole.moveTo(-1.55, 0.9); hole.lineTo(-0.45, 0.9); hole.lineTo(-0.45, 2.2); hole.lineTo(-1.55, 2.2); hole.lineTo(-1.55, 0.9)
  shape.holes.push(hole)
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }), mat)
  wall.position.z = -D / 2 - 0.08; wall.castShadow = wall.receiveShadow = true; g.add(wall)
  const bar = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), braceMat); m.position.set(x, y, z); m.castShadow = true; g.add(m) }
  bar(0.05, 1.3, 0.05, -1.0, 1.55, -D / 2 - 0.02); bar(1.1, 0.05, 0.05, -1.0, 1.55, -D / 2 - 0.02)
  for (const x of [-2.2, 0.3, 2.2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), braceMat); b.position.set(x, 1.2, -D / 2 - 0.75); b.rotation.x = 0.55; g.add(b) }
  return g
}

// An LED panel on a C-stand, and a camera on sticks: drawn simply, like props from the gear room.
function rod(mat, a, b, r = 0.012) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 10), mat)
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())
  m.castShadow = true
  return m
}
// A light on a combo stand: three splayed legs, a riser, a yoke and a softbox with a glowing face.
function standLight(mat, faceMat) {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; g.add(rod(mat, [0, 0.42, 0], [Math.sin(a) * 0.42, 0.01, Math.cos(a) * 0.42], 0.011)) }
  g.add(rod(mat, [0, 0.01, 0], [0, 1.75, 0], 0.016))
  const head = new THREE.Group(); head.position.y = 1.75; g.add(head)
  head.add(rod(mat, [-0.3, 0, 0], [-0.3, 0.12, 0], 0.01), rod(mat, [0.3, 0, 0], [0.3, 0.12, 0], 0.01), rod(mat, [-0.3, 0, 0], [0.3, 0, 0], 0.01))
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.12, 0.34, 4, 1, true), mat)
  box.rotation.set(Math.PI / 2, Math.PI / 4, 0); box.position.set(0, 0.12, 0.05); box.material.side = THREE.DoubleSide; box.castShadow = true; head.add(box)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.47), faceMat); face.position.set(0, 0.12, 0.225); head.add(face)
  g.userData.head = head; g.userData.face = face
  return g
}
function cameraRig(mat) {
  const g = new THREE.Group()
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.01, 1.3), mat); const a = i * Math.PI * 2 / 3 + 0.5; l.position.set(Math.sin(a) * 0.22, 0.58, Math.cos(a) * 0.22); l.rotation.set(Math.cos(a) * 0.33, 0, -Math.sin(a) * 0.33); g.add(l) }
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.26), mat); body.position.set(0, 1.25, 0); g.add(body)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.16, 24), mat); lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.25, -0.2); g.add(lens)
  const tally = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshBasicMaterial({ color: 0xff453a })); tally.position.set(0.06, 1.35, -0.1); g.add(tally)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

// The floor plan the crew tapes down: furniture outlines, the camera's field of view, the light's mark.
function planLines(mat) {
  const g = new THREE.Group()
  const rect = (w, d, x, z) => {
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([a, b]) => new THREE.Vector3(x + a, 0.006, z + b))
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
  }
  rect(W, D, 0, 0); rect(2.2, 0.95, 0, -1.15); rect(0.9, 0.9, 0, -0.15)
  const cam = [0.35, 3.05], half = Math.atan(SENSOR_W / (2 * 32)), dir = Math.atan2(-0.3, -4.15)
  const fov = [dir - half, dir + half].map((a) => new THREE.Vector3(cam[0] + Math.sin(a) * 4.4, 0.006, cam[1] + Math.cos(a) * 4.4))
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([fov[0], new THREE.Vector3(cam[0], 0.006, cam[1]), fov[1]]), mat))
  const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2) * 0.32, 0.006, Math.sin(i / 64 * Math.PI * 2) * 0.32))), mat)
  circle.position.set(-2.35, 0, 1.6); g.add(circle)
  return g
}

export default function StageHero({ children }) {
  const wrap = useRef(null)
  const canvas = useRef(null)
  const matte = useRef(null)
  const [beat, setBeat] = useState(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let renderer
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, powerPreference: 'high-performance' }) } catch { setFailed(true); return }
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.3
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x030303)
    scene.fog = new THREE.Fog(0x030303, 9, 22)
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 80)

    const stageFloor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.8 }))
    stageFloor.rotation.x = -Math.PI / 2; stageFloor.position.y = -0.001; stageFloor.receiveShadow = true; scene.add(stageFloor)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 0.6 }))
    deck.receiveShadow = true; scene.add(deck)
    scene.add(flat(new THREE.MeshStandardMaterial({ color: 0x6a665f, roughness: 0.92 }), new THREE.MeshStandardMaterial({ color: 0x6b5a46, roughness: 0.8 })))

    // furniture on its marks
    const props = new THREE.Group(); props.position.y = 0.03; scene.add(props)
    Promise.all(SET.map(([id]) => loadAsset(id))).then(() => {
      for (const [id, x, z, rot] of SET) {
        const g = instance(id, { h: 2.7 })
        g.position.set(x, getAsset(id)?.onTable ? 0.42 : 0, z); g.rotation.y = rot
        g.traverse((o) => {
          if (!o.isMesh) return
          o.castShadow = true; o.receiveShadow = true
          const ms = Array.isArray(o.material) ? o.material : [o.material]
          ms.forEach((m) => { if (m.emissiveIntensity > 3) m.emissiveIntensity = 1.6 })
        })
        props.add(g)
      }
      setReady(true)
    }).catch(() => setFailed(true))

    // ring light hanging behind the set
    const ring = new THREE.Group(); ring.position.set(-3.3, 2.3, -3.3); ring.rotation.y = 0.45
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.018, 12, 200), new THREE.MeshBasicMaterial({ color: 0xfffaf0 })))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }))
    glow.scale.set(3.9, 3.9, 1); ring.add(glow); scene.add(ring)
    const back = new THREE.SpotLight(0xfff4e6, 40, 14, 0.9, 0.7, 2); back.position.set(-3.0, 2.6, -2.9); back.target.position.set(0.4, 0.6, -0.4); scene.add(back, back.target)

    // the practical lamp and moonlight through the window
    const lamp = new THREE.PointLight(0xffc98a, 7, 6, 2); lamp.position.set(1.7, 1.6, -1.3); scene.add(lamp)
    const moon = new THREE.SpotLight(0xc9d6ff, 30, 12, 0.35, 0.6, 2); moon.position.set(-2.0, 2.6, -4.6); moon.target.position.set(0.1, 0.4, -0.6); scene.add(moon, moon.target)

    // the LED panel on its stand: the cursor moves it
    const standMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.5, metalness: 0.6 })
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x222222 })
    const panel = standLight(standMat, faceMat); scene.add(panel)
    const key = new THREE.SpotLight(0xffe7c8, 0, 14, 0.62, 0.45, 1.6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004
    key.target.position.set(0, 0.6, -1.0); scene.add(key, key.target)
    // a faint visible beam from the softbox to the set, so you can see where the light falls
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    const beamGeo = new THREE.CylinderGeometry(0.25, 1.4, 1, 32, 1, true); beamGeo.rotateX(Math.PI / 2)
    const beam = new THREE.Mesh(beamGeo, beamMat); scene.add(beam)
    const rig = cameraRig(standMat); rig.position.set(0.35, 0, 3.05); rig.rotation.y = Math.atan2(0.3, 4.15); scene.add(rig)
    const planMat = new THREE.LineBasicMaterial({ color: 0xf3f1ec, transparent: true, opacity: 0 })
    const plan = planLines(planMat); plan.position.y = 0.04; scene.add(plan)
    scene.add(new THREE.HemisphereLight(0x9aa1ad, 0x1a1612, 0.32))

    const ptr = { x: -0.5, y: 0.2, tx: -0.5, ty: 0.2 }
    const onMove = (e) => { const r = wrap.current.getBoundingClientRect(); ptr.tx = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.ty = 1 - ((e.clientY - Math.max(0, r.top)) / window.innerHeight) * 2 }
    window.addEventListener('pointermove', onMove)

    let size = [0, 0]
    const resize = () => {
      const w = canvas.current.clientWidth, h = canvas.current.clientHeight
      if (w === size[0] && h === size[1]) return
      size = [w, h]; renderer.setSize(w, h, false); cam.aspect = w / h
    }
    let progress = 0, last = -1, raf, visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(wrap.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const look = new THREE.Vector3()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible) return
      resize()
      const r = wrap.current.getBoundingClientRect()
      const span = Math.max(1, r.height - window.innerHeight)
      const target = Math.min(1, Math.max(0, -r.top / span))
      progress = reduce ? target : lerp(progress, target, 0.09)
      const f = progress * (BEATS.length - 1)
      const i = Math.min(BEATS.length - 2, Math.floor(f))
      const t = ease(Math.min(1, Math.max(0, (f - i - 0.3) / 0.7)))
      const a = BEATS[i], b = BEATS[i + 1]
      const tt = performance.now() / 1000
      cam.position.set(lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t))
      look.set(lerp(a.look[0], b.look[0], t), lerp(a.look[1], b.look[1], t), lerp(a.look[2], b.look[2], t))
      // a slow drift on the first frame, like a crane settling
      if (!reduce && f < 1) { const k = 1 - f; cam.position.x += Math.sin(tt * 0.18) * 0.35 * k; cam.position.z += Math.cos(tt * 0.18) * 0.2 * k }
      const portrait = cam.aspect < 0.9
      let mm = lerp(a.mm, b.mm, t)
      if (portrait) mm *= 0.6
      cam.fov = vfov(mm, cam.aspect)
      const off = cam.aspect > 1.2 ? lerp(a.off, b.off, t) : 0
      if (off) cam.setViewOffset(size[0], size[1], -size[0] * off, 0, size[0], size[1])
      else if (portrait) cam.setViewOffset(size[0], size[1], 0, size[1] * 0.18, size[0], size[1])
      else cam.clearViewOffset()
      cam.lookAt(look); cam.updateProjectionMatrix()

      // lighting comes up during beat 02 and stays
      const lit = Math.min(1, Math.max(0, (f - 0.55) / 0.6))
      ptr.x = lerp(ptr.x, ptr.tx, 0.07); ptr.y = lerp(ptr.y, ptr.ty, 0.07)
      // the stand travels round the set on the far side from the camera, so it never blocks the shot
      const az = 0.95 + ptr.x * 0.65
      panel.position.set(Math.sin(az) * 3.0, 0.03, Math.cos(az) * 3.0 - 0.9)
      panel.userData.head.position.y = 1.55 + Math.max(-0.35, Math.min(0.45, ptr.y * 0.5))
      panel.userData.head.lookAt(key.target.position)
      panel.userData.head.updateMatrixWorld(); panel.userData.head.getWorldPosition(key.position)
      key.intensity = 80 * lit
      faceMat.color.setScalar(0.13 + 0.87 * lit)
      beamMat.opacity = 0.07 * lit
      beam.position.copy(key.position).lerp(key.target.position, 0.5); beam.lookAt(key.target.position); beam.scale.z = key.position.distanceTo(key.target.position)
      // the camera on sticks disappears as we move into it
      rig.visible = !(f > 1.7 && f < 2.6)
      planMat.opacity = Math.max(0, (f - 2.3) / 0.7) * 0.9
      if (matte.current) matte.current.style.setProperty('--m', String(Math.max(0, 1 - Math.abs(f - 2) * 1.6)))
      const nb = Math.round(f)
      if (nb !== last) { last = nb; setBeat(nb) }
      renderer.render(scene, cam)
    }
    tick()
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('pointermove', onMove); renderer.dispose() }
  }, [])

  const b = BEATS[beat]
  return (
    <section className="stage" ref={wrap} aria-label="SceneMood, from the set to the storyboard">
      <div className="stage-pin">
        <canvas ref={canvas} className={'stage-canvas' + (ready ? ' on' : '')} aria-hidden="true" />
        {failed && <img className="stage-fallback" src="story/overview-work.jpg" alt="" />}
        {!ready && !failed && <div className="stage-load mono">Building the set…</div>}
        <div className="stage-matte" ref={matte} aria-hidden="true"><i /><i /></div>
        <div className="stage-vf" aria-hidden="true"><i /><i /><i /><i /></div>
        <ol className="stage-codes" aria-label="Steps">
          {BEATS.map((x, i) => <li key={x.code} className={i === beat ? 'on' : i < beat ? 'done' : ''}><span className="mono">{x.code}</span><em>{x.size}</em></li>)}
        </ol>
        <div className="stage-copy" key={beat}>
          <h1 className="stage-t">{b.title.map((l) => <span key={l}>{l}</span>)}</h1>
          <p>{b.body}</p>
        </div>
        <div className="stage-cta">{children}</div>
        <div className="stage-hud mono" aria-hidden="true">
          <span className="rec"><i />Cam A</span><span>{b.mm} mm</span><span>T2.8</span><span>ISO 800</span><span>2.39:1</span>
        </div>
        <div className={'stage-hint mono' + (beat === 1 ? ' strong' : '')} aria-hidden="true">{beat === 1 ? 'Move your cursor: the light follows it' : beat === 3 ? 'Keep scrolling' : 'Scroll to walk the set'}</div>
      </div>
    </section>
  )
}
