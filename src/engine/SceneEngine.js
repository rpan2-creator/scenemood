import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { getAsset, ASSETS } from '../data/assets.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { wallFrame, openingCenter } from '../data/rooms.js'
import { hfov, ASPECTS, actorFace } from './checks.js'

// Physical light units: SpotLight intensity is in candela, so exposure follows
// the same ISO / T-stop math the feasibility checks use.
const BASE_EXPOSURE = 0.035
const EMISSIVE_K = 1 / BASE_EXPOSURE
const HELPER = 1 // layer for gizmos that never appear through the lens

const SKIN = { light: '#e3bc98', medium: '#b27b54', deep: '#6a432c' }
const WARDROBE = { actor_a: '#2b323c', actor_b: '#7a6a5e', actor_c: '#55624b' }
const TUNGSTEN = new THREE.Color('#ffb15c')
const DAYLIGHT = new THREE.Color('#7cc8f0')

function onLayer(obj, layer) { obj.traverse((o) => o.layers.set(layer)); return obj }

function labelSprite(text, { color = '#ecebe6', bg = 'rgba(20,22,21,0.78)', accent } = {}) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const font = '500 26px Geist, system-ui, sans-serif'
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + (accent ? 44 : 28)
  c.width = w; c.height = 44
  ctx.font = font
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.roundRect(0, 0, w, 44, 10); ctx.fill()
  if (accent) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(20, 22, 7, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, accent ? 34 : 14, 23)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false, toneMapped: false })
  const s = new THREE.Sprite(m)
  s.scale.set((w / 44) * 0.019, 0.019, 1)
  s.renderOrder = 10
  s.center.set(0.5, 0)
  return onLayer(s, HELPER)
}

function plankTexture(color) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const g = c.getContext('2d')
  const base = new THREE.Color(color)
  for (let i = 0; i < 16; i++) {
    const k = 0.85 + ((i * 73) % 11) / 40
    const col = base.clone().multiplyScalar(k)
    g.fillStyle = '#' + col.getHexString()
    g.fillRect(0, i * 32, 512, 32)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(0, i * 32, 512, 1.5)
    const off = ((i * 197) % 512)
    g.fillRect(off, i * 32, 1.5, 32)
    for (let n = 0; n < 40; n++) {
      g.fillStyle = `rgba(${n % 2 ? 255 : 0},${n % 2 ? 230 : 0},${n % 2 ? 200 : 0},0.035)`
      g.fillRect(Math.random() * 512, i * 32 + Math.random() * 32, 40 + Math.random() * 120, 1)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

// ---------- shared asset prototypes ----------
const protoCache = new Map()
function assetInstance(assetId, room) {
  const a = getAsset(assetId)
  if (!a) return new THREE.Group()
  const key = a.hang ? assetId + room.h : assetId
  if (!protoCache.has(key)) {
    const g = a.build(room)
    g.traverse((o) => {
      if (o.isMesh && o.material.emissive && !o.material.userData.scaled && o.material.emissiveIntensity > 0 && o.material.emissive.getHex() !== 0) {
        o.material.userData.scaled = true
        o.material.userData.baseEmissive = o.material.emissiveIntensity
        o.material.emissiveIntensity *= EMISSIVE_K * 0.05
      }
    })
    protoCache.set(key, g)
  }
  const inst = protoCache.get(key).clone(true)
  // practical shades get their own material so they can be switched off per instance
  inst.traverse((o) => { if (o.isMesh && o.userData.practicalShade) o.material = o.material.clone() })
  return inst
}

// ---------- fixtures ----------
function standGeometry(height, color = '#2b2d2f') {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.6 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, height, 8), m)
  pole.position.y = height / 2
  pole.castShadow = true
  g.add(pole)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.62, 6), m)
    leg.position.set(Math.cos(a) * 0.22, 0.24, Math.sin(a) * 0.22)
    leg.lookAt(0, 0.6, 0)
    leg.rotateX(Math.PI / 2)
    leg.castShadow = true
    g.add(leg)
  }
  return g
}

function fixtureHead(fixture, cct, on, intensity) {
  const g = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.45, metalness: 0.5 })
  const glow = new THREE.MeshStandardMaterial({ color: '#000', emissive: on ? cctToHex(cct) : '#000', emissiveIntensity: on ? EMISSIVE_K * (0.15 + intensity * 0.5) : 0, roughness: 0.4 })
  if (fixture === 'led_panel') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), body); g.add(b)
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), glow); f.position.z = 0.026; g.add(f)
  } else if (fixture === 'fresnel') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.26, 20), body); b.rotation.x = Math.PI / 2; g.add(b)
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), glow); f.position.z = 0.131; g.add(f)
    for (const [x, y, rz] of [[0, 0.15, 0], [0, -0.15, 0], [0.15, 0, Math.PI / 2], [-0.15, 0, Math.PI / 2]]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.12), body)
      d.position.set(x, y, 0.19); d.rotation.z = rz; g.add(d)
    }
  } else if (fixture === 'tube') {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 12), glow); g.add(f)
  } else if (fixture === 'reflector') {
    const r = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), new THREE.MeshStandardMaterial({ color: '#e4e6e8', roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide }))
    g.add(r)
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

function coneMesh(length, angle, color, intensity) {
  const radius = Math.tan(angle) * length
  const geo = new THREE.ConeGeometry(radius, length, 40, 1, true)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, 0, length / 2)
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.015 + intensity * 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const cone = new THREE.Mesh(geo, m)
  const ringGeo = new THREE.EdgesGeometry(new THREE.CircleGeometry(radius, 40))
  const ring = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45, toneMapped: false }))
  ring.position.z = length
  const g = new THREE.Group()
  g.add(cone, ring)
  return onLayer(g, HELPER)
}

// ---------- actors and cameras ----------
function mannequin(actor) {
  const g = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[actor.tone] || SKIN.medium, roughness: 0.6 })
  const cloth = new THREE.MeshStandardMaterial({ color: WARDROBE[actor.id] || '#444', roughness: 0.9 })
  const trousers = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.9 })
  const sit = actor.pose === 'sit'
  const hip = sit ? 0.47 : 0.92
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.38, 6, 16), cloth)
  torso.position.y = hip + 0.3
  torso.scale.z = 0.72
  g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), skin)
  head.position.y = hip + 0.66
  head.scale.set(0.92, 1.08, 1)
  g.add(head)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ color: actor.id === 'actor_b' ? '#2a1c16' : '#3a2a20', roughness: 0.85 }))
  hair.position.set(0, hip + 0.675, -0.018)
  hair.rotation.x = -0.95
  hair.scale.set(0.95, 1.08, 1.02)
  g.add(hair)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 8), skin)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, hip + 0.65, 0.105)
  g.add(nose)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), skin)
  neck.position.y = hip + 0.55
  g.add(neck)
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.42, 4, 10), cloth)
    arm.position.set(s * 0.2, hip + 0.24, sit ? 0.08 : 0)
    arm.rotation.x = sit ? -0.6 : 0
    g.add(arm)
    if (sit) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.36, 4, 10), trousers)
      thigh.rotation.x = Math.PI / 2
      thigh.position.set(s * 0.09, hip, 0.2)
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.36, 4, 10), trousers)
      shin.position.set(s * 0.09, hip / 2, 0.42)
      g.add(thigh, shin)
    } else {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.78, 4, 10), trousers)
      leg.position.set(s * 0.09, 0.46, 0)
      g.add(leg)
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return g
}

function cameraModel() {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color: '#202224', roughness: 0.4, metalness: 0.4 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.22), m)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 20), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.3, metalness: 0.6 }))
  lens.rotation.x = Math.PI / 2
  lens.position.z = 0.17
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.01), m)
  mon.position.set(0.1, 0.08, -0.06)
  mon.rotation.y = -0.5
  g.add(body, lens, mon)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

function frustumLines(cam, aspect, color, depth = 2.6) {
  const th = Math.tan(hfov(cam.focal) / 2), tv = th / aspect
  const pts = [[-th, -tv], [th, -tv], [th, tv], [-th, tv]].map(([x, y]) => new THREE.Vector3(x * depth, y * depth, depth))
  const o = new THREE.Vector3()
  const arr = []
  for (const p of pts) arr.push(o, p)
  for (let i = 0; i < 4; i++) arr.push(pts[i], pts[(i + 1) % 4])
  const geo = new THREE.BufferGeometry().setFromPoints(arr)
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }))
  const planeGeo = new THREE.PlaneGeometry(2 * th * depth, 2 * tv * depth)
  const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }))
  plane.position.z = depth
  const g = new THREE.Group()
  g.add(lines, plane)
  return onLayer(g, HELPER)
}

// ======================================================================

export class SceneEngine {
  constructor(container, { mode = 'studio', onSelect, onTransform, onFrameRect } = {}) {
    this.container = container
    this.mode = mode
    this.onSelect = onSelect
    this.onTransform = onTransform
    this.onFrameRect = onFrameRect
    this.view = mode === 'studio' ? 'split' : 'set'
    this.ui = { cones: true, frameGuides: true }

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }))
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = BASE_EXPOSURE
    r.outputColorSpace = THREE.SRGBColorSpace
    r.setScissorTest(true)
    container.appendChild(r.domElement)
    r.domElement.style.display = 'block'

    this.scene = new THREE.Scene()
    this.bg = new THREE.Color('#121413')
    this.scene.background = this.bg
    this.scene.fog = new THREE.Fog('#121413', 16, 34)

    this.setCam = new THREE.PerspectiveCamera(38, 1, 0.05, 80)
    this.setCam.position.set(6.2, 5.4, 7.4)
    this.setCam.layers.enable(HELPER)
    this.frameCam = new THREE.PerspectiveCamera(30, 2.39, 0.05, 60)

    this.controls = new OrbitControls(this.setCam, r.domElement)
    this.controls.target.set(0, 0.8, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.minDistance = 2.5
    this.controls.maxDistance = 20
    if (mode === 'showcase') {
      this.controls.autoRotate = true
      this.controls.autoRotateSpeed = 0.35
      this.controls.enableZoom = false
      this.controls.enablePan = false
    }

    this.hemi = new THREE.HemisphereLight('#a9b6c4', '#2a2420', 6)
    this.scene.add(this.hemi)

    const grid = new THREE.GridHelper(30, 60, '#262b29', '#1b1e1d')
    grid.material.toneMapped = false
    grid.position.y = -0.002
    if (mode !== 'showcase') this.scene.add(onLayer(grid, HELPER))
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#161817', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.01
    ground.receiveShadow = true
    this.scene.add(ground)

    this.roomGroup = new THREE.Group()
    this.dyn = new THREE.Group()
    this.scene.add(this.roomGroup, this.dyn)
    this.walls = []
    this.pickables = []
    this.byId = new Map()

    if (mode === 'studio') {
      this.tc = new TransformControls(this.setCam, r.domElement)
      this.tc.setSize(0.75)
      this.tc.showY = false
      this.tcHelper = this.tc.getHelper()
      onLayer(this.tcHelper, HELPER)
      this.scene.add(this.tcHelper)
      this.tc.addEventListener('dragging-changed', (e) => {
        this.controls.enabled = !e.value
        this.dragging = e.value
        if (!e.value && this.tc.object) {
          const o = this.tc.object
          const pick = o.userData.pick
          if (pick && this.onTransform) {
            const changes = { x: +o.position.x.toFixed(2), z: +o.position.z.toFixed(2) }
            if (pick.kind === 'lights' || pick.kind === 'cameras') changes.y = +o.position.y.toFixed(2)
            if (pick.kind === 'objects' && o.userData.baseY !== undefined) changes.y = +(o.position.y).toFixed(2)
            this.onTransform(pick.kind, pick.id, changes)
          }
        }
      })
      this.bindPicking()
    }

    this.dirty = true
    this.controls.addEventListener('change', () => { this.dirty = true })
    this.tc?.addEventListener('change', () => { this.dirty = true })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    this.t0 = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.controls.dispose()
    // TransformControls.dispose() in three r169 calls this.traverse, which no longer exists
    if (this.tc) {
      this.tc.detach()
      this.tc.disconnect()
      this.tcHelper?.traverse((c) => { c.geometry?.dispose(); c.material?.dispose?.() })
    }
    this.renderer.dispose()
    this.aux?.dispose()
    this.renderer.domElement.remove()
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.w = w; this.h = h
    this.dirty = true
  }

  setView(v) { this.view = v; this.dirty = true }
  setUI(ui) { this.ui = { ...this.ui, ...ui }; this.dirty = true }
  invalidate() { this.dirty = true }

  // ---------------- scene sync ----------------
  setScene(scene, { pending, selection } = {}) {
    const show = pending?.scene || scene
    if (!show) return
    this.current = show
    const roomKey = JSON.stringify([show.room, show.time])
    if (roomKey !== this.roomKey) { this.roomKey = roomKey; this.buildRoom(show.room, show.time) }
    const dynKey = JSON.stringify([show.objects, show.actors, show.lights, show.cameras, show.activeCam, show.aspect, pending?.changed])
    if (dynKey !== this.dynKey) { this.dynKey = dynKey; this.buildDynamic(show, new Set(pending?.changed || [])) }
    // work lights: an unlit set is shown evenly so the layout can be read
    if (this.baseHemi !== undefined) this.hemi.intensity = show.lights.length ? this.baseHemi : 55
    const ev = (show.iso || 800) / 800 * Math.pow(2.8 / (show.tstop || 2.8), 2)
    this.renderer.toneMappingExposure = BASE_EXPOSURE * ev
    this.selection = selection
    this.applySelection()
    this.dirty = true
  }

  buildRoom(room, time) {
    this.roomGroup.clear()
    this.walls = []
    const { w, d, h } = room
    // floor
    const tex = plankTexture(room.floor)
    tex.repeat.set(w / 2.2, d / 2.2)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.roomGroup.add(floor)
    const wallMat = new THREE.MeshStandardMaterial({ color: room.wall, roughness: 0.95 })
    const trimMat = new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.7 })
    const night = time !== 'day'
    for (const side of ['N', 'S', 'E', 'W']) {
      const f = wallFrame(room, side)
      const len = f.len
      const shape = new THREE.Shape()
      shape.moveTo(-len / 2, 0); shape.lineTo(len / 2, 0); shape.lineTo(len / 2, h); shape.lineTo(-len / 2, h); shape.lineTo(-len / 2, 0)
      const ops = room.openings.filter((o) => o.wall === side)
      for (const op of ops) {
        // shape x runs along the wall tangent; local +x maps to tangent
        const hole = new THREE.Path()
        const x0 = op.at - op.width / 2, x1 = op.at + op.width / 2
        hole.moveTo(x0, op.sill); hole.lineTo(x1, op.sill); hole.lineTo(x1, op.sill + op.height); hole.lineTo(x0, op.sill + op.height); hole.lineTo(x0, op.sill)
        shape.holes.push(hole)
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false })
      const wall = new THREE.Mesh(geo, wallMat)
      wall.castShadow = true
      wall.receiveShadow = true
      const g = new THREE.Group()
      g.add(wall)
      wall.position.z = -0.1
      // baseboard
      const bb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.02), trimMat)
      bb.position.set(0, 0.045, 0.01)
      g.add(bb)
      // openings: windows and doors
      for (const op of ops) {
        if (op.type === 'window') {
          const fr = new THREE.Group()
          const t = 0.05
          const parts = [
            [op.width + t * 2, t, 0, op.sill - t / 2], [op.width + t * 2, t, 0, op.sill + op.height + t / 2],
            [t, op.height, -op.width / 2 - t / 2, op.sill + op.height / 2], [t, op.height, op.width / 2 + t / 2, op.sill + op.height / 2],
            [op.width, 0.035, 0, op.sill + op.height / 2], [0.03, op.height, 0, op.sill + op.height / 2],
          ]
          for (const [pw, ph, px, py] of parts) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.07), trimMat)
            m.position.set(px, py, -0.04)
            m.castShadow = true
            fr.add(m)
          }
          const sill = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.16, 0.035, 0.18), trimMat)
          sill.position.set(0, op.sill - 0.02, 0.05)
          fr.add(sill)
          // night sky / daylight through the glass
          const sky = new THREE.Mesh(new THREE.PlaneGeometry(op.width * 3, op.height * 2.2), new THREE.MeshBasicMaterial({ color: night ? '#0c1628' : '#cfe0ee', toneMapped: false }))
          sky.position.set(op.at, op.sill + op.height / 2, -1.4)
          g.add(sky)
          if (night) {
            const moon = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshBasicMaterial({ color: '#e8eef5', toneMapped: false }))
            moon.position.set(op.at - op.width * 0.25, op.sill + op.height * 0.85, -1.39)
            g.add(moon)
            // distant windows
            for (let i = 0; i < 5; i++) {
              const lw = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.07), new THREE.MeshBasicMaterial({ color: '#c98d4e', toneMapped: false }))
              lw.position.set(op.at - op.width * 0.6 + i * 0.25, op.sill + 0.25 + (i % 2) * 0.12, -1.38)
              g.add(lw)
            }
          }
          fr.position.x = op.at
          g.add(fr)
          // existing light through the window
          const c = openingCenter(room, op)
          const spot = new THREE.SpotLight(night ? '#9ec4ff' : '#fff4e6', night ? 45 : 1600, 0, 0.55, 0.9, 2)
          spot.position.set(c[0] - f.n[0] * 1.8, op.sill + op.height + 0.6, c[1] - f.n[1] * 1.8)
          spot.target.position.set(c[0] + f.n[0] * 1.8, 0, c[1] + f.n[1] * 1.8)
          spot.castShadow = true
          spot.shadow.mapSize.set(1024, 1024)
          spot.shadow.bias = -0.0005
          this.roomGroup.add(spot, spot.target)
        } else {
          const hall = new THREE.Mesh(new THREE.PlaneGeometry(op.width + 0.2, op.height + 0.1), new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 1 }))
          hall.position.set(op.at, op.height / 2, -0.9)
          g.add(hall)
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.04, op.height - 0.03, 0.04), trimMat)
          leaf.geometry.translate((op.width - 0.04) / 2, 0, 0)
          leaf.position.set(op.at - op.width / 2 + 0.02, op.height / 2, -0.06)
          leaf.rotation.y = 1.1
          leaf.castShadow = true
          g.add(leaf)
          const casing = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.14, 0.07, 0.04), trimMat)
          casing.position.set(op.at, op.height + 0.035, 0.01)
          g.add(casing)
        }
      }
      // orient: local +z is the inward normal, local +x is the tangent
      g.position.set(f.o[0], 0, f.o[1])
      g.rotation.y = Math.atan2(f.n[0], f.n[1])
      // local +x after that rotation must match tangent; flip when needed
      const tx = new THREE.Vector3(1, 0, 0).applyEuler(g.rotation)
      if (tx.x * f.t[0] + tx.z * f.t[1] < 0) { g.scale.x = -1 }
      g.userData.side = side
      g.userData.normal = f.n
      g.userData.origin = f.o
      this.walls.push(g)
      this.roomGroup.add(g)
    }
    this.hemi.intensity = time === 'day' ? 30 : 5
    this.baseHemi = this.hemi.intensity
    if (this.mode === 'preview') {
      const dist = Math.max(w, d) * 1.25 + 2.2
      this.setCam.position.set(dist * 0.55, dist * 0.62, dist * 0.78)
      this.controls.target.set(0, 0.3, -0.2)
      this.controls.update()
    }
    this.hemi.color.set(time === 'day' ? '#dfe8f0' : '#8ea2bf')
  }

  buildDynamic(s, changed) {
    this.dyn.clear()
    this.pickables = []
    this.byId.clear()
    const aspect = ASPECTS[s.aspect] || 2.39
    const room = s.room
    const tag = (obj, kind, id) => {
      obj.userData.pick = { kind, id }
      obj.traverse((o) => { if (o.isMesh) o.userData.pickRoot = obj })
      this.pickables.push(obj)
      this.byId.set(id, obj)
    }
    // objects
    for (const o of s.objects) {
      const a = getAsset(o.asset)
      if (!a) continue
      const g = assetInstance(o.asset, room)
      if (a.wall) {
        // snap to the nearest wall
        const dists = [['N', o.z + room.d / 2], ['S', room.d / 2 - o.z], ['W', o.x + room.w / 2], ['E', room.w / 2 - o.x]].sort((p, q) => p[1] - q[1])
        const side = dists[0][0]
        const f = wallFrame(room, side)
        const along = side === 'N' || side === 'S' ? o.x : o.z
        g.position.set(side === 'N' || side === 'S' ? along : f.o[0] + f.n[0] * 0.03, a.mountY, side === 'W' || side === 'E' ? along : f.o[1] + f.n[1] * 0.03)
        g.rotation.y = Math.atan2(f.n[0], f.n[1])
      } else {
        g.position.set(o.x, o.y || 0, o.z)
        g.rotation.y = o.rot || 0
        if (o.y) g.userData.baseY = o.y
      }
      if (a.practical) {
        const on = o.on !== false
        g.traverse((m) => {
          if (m.isMesh && m.userData.practicalShade) {
            m.material.emissiveIntensity = on ? (m.material.userData.baseEmissive || 0.9) * EMISSIVE_K * 0.05 : 0
          }
        })
        if (on) {
          const pl = new THREE.PointLight(cctToHex(a.practical.cct), a.practical.cd, 0, 2)
          pl.position.set(0, a.hang ? room.h + a.practical.y : a.practical.y, 0)
          if (a.id === 'floor_lamp' || a.id === 'pendant') { pl.castShadow = true; pl.shadow.mapSize.set(512, 512); pl.shadow.bias = -0.002 }
          g.add(pl)
        }
      }
      tag(g, 'objects', o.id)
      this.dyn.add(g)
      if (changed.has(o.id)) this.addGhost(g, DAYLIGHT)
    }
    // actors
    for (const a of s.actors) {
      const g = mannequin(a)
      g.position.set(a.x, 0, a.z)
      g.rotation.y = a.rot || 0
      if (this.mode !== 'showcase') {
        const lbl = labelSprite(`${a.label} · ${a.name}`)
        lbl.position.y = (a.pose === 'sit' ? 1.3 : 1.78)
        g.add(lbl)
      }
      tag(g, 'actors', a.id)
      this.dyn.add(g)
      if (changed.has(a.id)) this.addGhost(g, DAYLIGHT)
    }
    // lights
    let shadowBudget = 3
    for (const l of s.lights) {
      const fx = FIXTURES[l.fixture]
      if (!fx) continue
      const root = new THREE.Group()
      root.position.set(l.x, l.y, l.z)
      const stand = standGeometry(Math.max(0.3, l.y - 0.1))
      stand.position.y = -l.y
      root.add(stand)
      const head = fixtureHead(l.fixture, l.cct, l.on !== false, l.intensity)
      const aim = new THREE.Vector3(...l.aim)
      root.add(head)
      head.lookAt(aim.clone().sub(root.position).add(root.position)) // world-space target; root has no rotation
      if (l.fixture === 'tube') head.rotation.set(0, 0, 0)
      const color = new THREE.Color(cctToHex(l.cct))
      if (l.on !== false) {
        const angle = Math.min(Math.PI / 2.2, ((fx.beam / 2) * Math.PI) / 180)
        const spot = new THREE.SpotLight(color, fx.cd * l.intensity, 0, angle, 0.25 + (l.diffusion ?? fx.softness) * 0.65, 2)
        spot.position.set(0, 0, 0)
        spot.target.position.copy(aim).sub(root.position)
        if (shadowBudget > 0 && !fx.passive) {
          spot.castShadow = true
          spot.shadow.mapSize.set(1024, 1024)
          spot.shadow.bias = -0.0004
          spot.shadow.radius = 2 + (l.diffusion ?? fx.softness) * 6
          spot.shadow.camera.near = 0.2
          shadowBudget--
        }
        root.add(spot, spot.target)
        if (this.ui.cones && !fx.passive) {
          const length = Math.min(3.0, aim.distanceTo(root.position) + 0.15)
          const cone = coneMesh(length, Math.min(angle, 1.0), color, l.intensity)
          root.add(cone)
          cone.lookAt(aim)
        }
      }
      if (this.mode !== 'showcase') {
        const lbl = labelSprite(`${l.label || l.role} · ${Math.round(l.intensity * 100)}% · ${l.cct}K`, { accent: '#' + color.getHexString() })
        lbl.position.y = 0.32
        root.add(lbl)
      }
      tag(root, 'lights', l.id)
      this.dyn.add(root)
      if (changed.has(l.id)) this.addGhost(root, DAYLIGHT)
    }
    // cameras
    for (const c of s.cameras) {
      const active = c.id === s.activeCam
      const root = new THREE.Group()
      root.position.set(c.x, c.y, c.z)
      const tripod = standGeometry(Math.max(0.3, c.y - 0.12), '#222426')
      tripod.position.y = -c.y
      onLayer(tripod, HELPER)
      root.add(tripod)
      const head = new THREE.Group()
      head.add(onLayer(cameraModel(), HELPER))
      const fr = frustumLines(c, aspect, active ? '#ffb15c' : '#8b918d', 2.4)
      head.add(fr)
      root.add(head)
      const target = new THREE.Vector3(...c.aim)
      head.lookAt(target)
      if (this.mode !== 'showcase') {
        const lbl = labelSprite(`Cam ${c.label} · ${c.focal} mm`, { accent: active ? '#ffb15c' : '#8b918d' })
        lbl.position.y = 0.2
        root.add(lbl)
      }
      tag(root, 'cameras', c.id)
      this.dyn.add(root)
      if (changed.has(c.id)) this.addGhost(root, DAYLIGHT)
    }
    // the lens
    const cam = s.cameras.find((c) => c.id === s.activeCam) || s.cameras[0]
    this.lens = cam || null
    this.lensAspect = aspect
    this.applySelection()
  }

  addGhost(obj, color) {
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj, true)
    if (box.isEmpty()) return
    box.expandByScalar(0.06)
    const helper = new THREE.Box3Helper(box, color)
    helper.material.transparent = true
    helper.material.depthTest = false
    helper.material.toneMapped = false
    helper.userData.ghost = true
    onLayer(helper, HELPER)
    this.dyn.add(helper)
  }

  applySelection() {
    if (this.selBox) { this.dyn.remove(this.selBox); this.selBox = null }
    if (!this.tc) return
    const id = this.selection?.id
    const obj = id && this.byId.get(id)
    if (obj) {
      const kind = obj.userData.pick.kind
      const asset = kind === 'objects' ? getAsset(this.current.objects.find((o) => o.id === id)?.asset) : null
      if (asset?.wall) { this.tc.detach(); return }
      this.tc.attach(obj)
      this.tc.showY = kind === 'lights' || kind === 'cameras'
      obj.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(obj, true)
      box.expandByScalar(0.04)
      this.selBox = onLayer(new THREE.Box3Helper(box, TUNGSTEN), HELPER)
      this.selBox.material.toneMapped = false
      this.dyn.add(this.selBox)
    } else this.tc.detach()
  }

  // ---------------- picking and drop ----------------
  regions() {
    const W = this.w, H = this.h
    if (this.view === 'set') return { set: { x: 0, y: 0, w: W, h: H }, frame: null }
    if (this.view === 'frame') return { set: null, frame: { x: 0, y: 0, w: W, h: H } }
    const sh = Math.round(H * 0.5)
    return { set: { x: 0, y: 0, w: W, h: sh }, frame: { x: 0, y: sh + 1, w: W, h: H - sh - 1 } }
  }

  bindPicking() {
    const el = this.renderer.domElement
    let down = null
    el.addEventListener('pointerdown', (e) => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      const reg = this.regions().set
      const inSet = reg && x >= reg.x && x <= reg.x + reg.w && y >= reg.y && y <= reg.y + reg.h
      this.controls.enabled = !!inSet && !this.dragging
      down = { x: e.clientX, y: e.clientY, inSet }
    }, true)
    el.addEventListener('pointerup', (e) => {
      if (!down || !down.inSet || this.dragging) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
      const hit = this.pick(e.clientX, e.clientY)
      if (this.tc?.dragging) return
      this.onSelect?.(hit)
    })
  }

  ndcInSet(cx, cy) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const reg = this.regions().set
    if (!reg) return null
    const x = cx - rect.left, y = cy - rect.top
    if (x < reg.x || x > reg.x + reg.w || y < reg.y || y > reg.y + reg.h) return null
    return new THREE.Vector2(((x - reg.x) / reg.w) * 2 - 1, -((y - reg.y) / reg.h) * 2 + 1)
  }

  pick(cx, cy) {
    const ndc = this.ndcInSet(cx, cy)
    if (!ndc) return null
    const rc = new THREE.Raycaster()
    rc.layers.enableAll()
    rc.setFromCamera(ndc, this.setCam)
    const meshes = []
    for (const p of this.pickables) p.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o) })
    const hits = rc.intersectObjects(meshes, false)
    for (const h of hits) {
      let o = h.object
      while (o && !o.userData.pick) o = o.parent
      if (o) return o.userData.pick
    }
    return null
  }

  floorPoint(cx, cy) {
    const ndc = this.ndcInSet(cx, cy)
    if (!ndc) return null
    const rc = new THREE.Raycaster()
    rc.setFromCamera(ndc, this.setCam)
    const p = new THREE.Vector3()
    return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null
  }

  focusOn(target = [0, 0.8, 0]) { this.controls.target.set(...target); this.controls.update(); this.dirty = true }

  // ---------------- rendering ----------------
  setWallsFor(camPos, dollhouse) {
    for (const g of this.walls) {
      if (!dollhouse) { g.visible = true; continue }
      const n = g.userData.normal, o = g.userData.origin
      // hide a wall when the camera is on its outer side
      const side = (camPos.x - o[0]) * n[0] + (camPos.z - o[1]) * n[1]
      g.visible = side > -0.05
    }
  }

  updateFrameCam(region) {
    const c = this.lens
    if (!c) return null
    const aspect = this.lensAspect
    let w = region.w, h = Math.round(region.w / aspect)
    if (h > region.h - 44) { h = region.h - 44; w = Math.round(h * aspect) }
    const x = region.x + Math.round((region.w - w) / 2)
    const y = region.y + Math.max(8, Math.round((region.h - 30 - h) / 2))
    const th = Math.tan(hfov(c.focal) / 2)
    this.frameCam.fov = (2 * Math.atan(th / aspect) * 180) / Math.PI
    this.frameCam.aspect = aspect
    this.frameCam.position.set(c.x, c.y, c.z)
    this.frameCam.lookAt(...c.aim)
    this.frameCam.updateProjectionMatrix()
    return { x, y, w, h }
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop)
    const r = this.renderer
    const t = (performance.now() - this.t0) / 1000
    if (this.controls.update()) this.dirty = true
    // pulse the ghosts of a pending AI change
    let ghosts = false
    this.dyn.children.forEach((c) => { if (c.userData.ghost) { ghosts = true; c.material.opacity = 0.45 + Math.sin(t * 5) * 0.35 } })
    if (!this.dirty && !ghosts && !this.controls.autoRotate) return
    this.dirty = false
    const reg = this.regions()
    r.setClearColor(this.bg)
    r.setScissor(0, 0, this.w, this.h)
    r.setViewport(0, 0, this.w, this.h)
    r.clear()
    if (reg.set) {
      const { x, y, w, h } = reg.set
      this.setCam.aspect = w / h
      this.setCam.updateProjectionMatrix()
      this.setWallsFor(this.setCam.position, true)
      if (this.tcHelper) this.tcHelper.visible = !!this.tc.object
      r.setViewport(x, this.h - y - h, w, h)
      r.setScissor(x, this.h - y - h, w, h)
      r.render(this.scene, this.setCam)
    }
    let rect = null
    if (reg.frame) {
      rect = this.lens ? this.updateFrameCam(reg.frame) : null
      const fy = this.h - reg.frame.y - reg.frame.h
      r.setViewport(reg.frame.x, fy, reg.frame.w, reg.frame.h)
      r.setScissor(reg.frame.x, fy, reg.frame.w, reg.frame.h)
      r.setClearColor('#0b0c0c')
      r.clear()
      if (rect) {
        this.setWallsFor(this.frameCam.position, false)
        if (this.tcHelper) this.tcHelper.visible = false
        r.setViewport(rect.x, this.h - rect.y - rect.h, rect.w, rect.h)
        r.setScissor(rect.x, this.h - rect.y - rect.h, rect.w, rect.h)
        r.render(this.scene, this.frameCam)
      }
    }
    const key = JSON.stringify([reg, rect])
    if (key !== this.lastRectKey) { this.lastRectKey = key; this.onFrameRect?.({ set: reg.set, frame: reg.frame, image: rect }) }
  }

  // ---------------- offscreen: snapshot + false color ----------------
  auxRenderer(w, h) {
    if (!this.aux) {
      this.aux = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
      this.aux.shadowMap.enabled = true
      this.aux.shadowMap.type = THREE.PCFSoftShadowMap
      this.aux.toneMapping = THREE.ACESFilmicToneMapping
      this.aux.outputColorSpace = THREE.SRGBColorSpace
    }
    this.aux.setPixelRatio(1)
    this.aux.setSize(w, h, false)
    this.aux.toneMappingExposure = this.renderer.toneMappingExposure
    return this.aux
  }

  snapshot(w, h) {
    if (!this.lens) return null
    this.updateFrameCam({ x: 0, y: 0, w, h: h + 56 })
    const r = this.auxRenderer(w, h)
    this.setWallsFor(this.frameCam.position, false)
    const tcVis = this.tcHelper?.visible
    if (this.tcHelper) this.tcHelper.visible = false
    r.render(this.scene, this.frameCam)
    if (this.tcHelper) this.tcHelper.visible = tcVis
    return r.domElement
  }

  falseColor(w, h) {
    const src = this.snapshot(w, h)
    if (!src) return null
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(src, 0, 0)
    const img = g.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const Y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255 // display-referred, approx IRE / 100
      let col
      if (Y < 0.03) col = [86, 20, 128]       // crushed
      else if (Y < 0.1) col = [36, 72, 200]   // near black
      else if (Y < 0.2) col = [52, 52, 52]
      else if (Y < 0.38) col = [110, 110, 110]
      else if (Y < 0.48) col = [72, 168, 88]  // 18% grey band
      else if (Y < 0.58) col = [180, 180, 180]
      else if (Y < 0.7) col = [236, 124, 160] // skin highlight band
      else if (Y < 0.93) col = [220, 220, 220]
      else if (Y < 0.98) col = [244, 200, 40] // near clip
      else col = [232, 50, 40]                 // clipped
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]
    }
    g.putImageData(img, 0, 0)
    return c.toDataURL()
  }

  // screen position of a world point inside the frame image rect (for click-to-comment)
  frameHit(rect, u, v) {
    if (!this.lens) return null
    const ndc = new THREE.Vector2(u * 2 - 1, -(v * 2 - 1))
    const rc = new THREE.Raycaster()
    rc.setFromCamera(ndc, this.frameCam)
    const meshes = []
    for (const p of this.pickables) p.traverse((o) => { if (o.isMesh) meshes.push(o) })
    const hits = rc.intersectObjects(meshes, false)
    for (const h of hits) {
      let o = h.object
      while (o && !o.userData.pick) o = o.parent
      if (o) return o.userData.pick
    }
    return null
  }
}

// ---------------- asset thumbnails ----------------
let thumbR = null
const thumbs = new Map()
export function assetThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id)
  const a = getAsset(id)
  if (!a) return ''
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    thumbR.setPixelRatio(1)
    thumbR.setSize(240, 180, false)
    thumbR.toneMapping = THREE.ACESFilmicToneMapping
    thumbR.toneMappingExposure = 1
    thumbR.outputColorSpace = THREE.SRGBColorSpace
  }
  const sc = new THREE.Scene()
  sc.add(new THREE.HemisphereLight('#ffffff', '#3a3530', 1.6))
  const dl = new THREE.DirectionalLight('#ffe8cc', 2.6)
  dl.position.set(2, 4, 3)
  sc.add(dl)
  const rim = new THREE.DirectionalLight('#8fc6ff', 1.6)
  rim.position.set(-3, 2, -2)
  sc.add(rim)
  const g = assetInstance(id, { h: 2.6 })
  g.traverse((o) => { if (o.isMesh && o.material.emissiveIntensity > 0) { o.material = o.material.clone(); o.material.emissiveIntensity = (o.material.userData.baseEmissive || 1) * 0.8 } })
  sc.add(g)
  const box = new THREE.Box3().setFromObject(g)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const r = Math.max(size.x, size.y, size.z)
  const cam = new THREE.PerspectiveCamera(30, 240 / 180, 0.01, 50)
  cam.position.copy(center).add(new THREE.Vector3(1.1, 0.75, 1.5).multiplyScalar(r * 1.35))
  cam.lookAt(center)
  thumbR.setClearColor(0x000000, 0)
  thumbR.render(sc, cam)
  const url = thumbR.domElement.toDataURL('image/png')
  thumbs.set(id, url)
  return url
}

export function preloadThumbs() { ASSETS.forEach((a) => assetThumb(a.id)) }
