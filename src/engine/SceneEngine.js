import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { getAsset, instance, onAssetLoaded, loadAsset } from '../data/assets.js'
import { getHumanStyle, buildHuman } from './humans.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { wallFrame, openingCenter } from '../data/rooms.js'
import { hfov, ASPECTS, actorFace } from './checks.js'

// Units: meters, candela, lux. SpotLight intensity is candela, so a light's exposure
// in the render follows the same ISO / T-stop math as the feasibility checks.
export const BASE_EXPOSURE = 0.03
const K = 1 / BASE_EXPOSURE // multiply unlit colors by K to survive the exposure
const HELPER = 1

const TUNGSTEN = new THREE.Color('#ffb15c')
const DAYLIGHT = new THREE.Color('#7cc8f0')

function onLayer(obj, layer) { obj.traverse((o) => o.layers.set(layer)); return obj }

// ---------------------------------------------------------------- textures

function canvasTex(w, h, draw, srgb = true, repeat) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat) }
  return t
}

let plasterN
function plasterNormal() {
  if (plasterN) return plasterN
  plasterN = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 5
      g.fillStyle = `rgba(${118 + Math.random() * 20},${118 + Math.random() * 20},255,0.25)`
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    }
  }, false, [3, 3])
  return plasterN
}

const texLoader = new THREE.TextureLoader()
const floorTex = {}
const GROUNDS = {
  dirt: ['#4e3f31', ['#2f261d', '#6b5845', '#3b3026', '#7a6a55']],
  grass: ['#3f5230', ['#2c3b22', '#5a7240', '#4a5f34', '#6b6a3f']],
  asphalt: ['#3a3b3d', ['#2a2b2d', '#4c4d50', '#232426', '#56575a']],
  sand: ['#b89c74', ['#9c8260', '#cdb38a', '#a88d68']],
}
const groundCache = new Map()
function groundMaterial(type) {
  if (groundCache.has(type)) return groundCache.get(type)
  const [base, specks] = GROUNDS[type] || GROUNDS.dirt
  const map = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 90; i++) { g.fillStyle = specks[i % specks.length]; g.globalAlpha = 0.12; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 90, 10 + Math.random() * 60, Math.random() * 3, 0, Math.PI * 2); g.fill() }
    for (let i = 0; i < 160000; i++) { g.fillStyle = specks[(Math.random() * specks.length) | 0]; g.globalAlpha = Math.random() * 0.5; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2) }
    if (type === 'asphalt') { g.globalAlpha = 0.5; g.fillStyle = '#c9b46a'; for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 4, y, 8, 64) }
    g.globalAlpha = 1
  }, true, [12, 12])
  const m = new THREE.MeshPhysicalMaterial({ map, roughness: type === 'asphalt' ? 0.8 : 0.98 })
  groundCache.set(type, m)
  return m
}

function floorMaterial(room) {
  const type = room.floorType || 'wood'
  const rep = [room.w / 1.6, room.d / 1.6]
  if (type === 'wood') {
    const k = 'wood'
    if (!floorTex[k]) {
      floorTex[k] = ['tex/hardwood2_diffuse.jpg', 'tex/hardwood2_roughness.jpg', 'tex/hardwood2_bump.jpg'].map((u, i) => {
        const t = texLoader.load(u)
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.anisotropy = 8
        if (i === 0) t.colorSpace = THREE.SRGBColorSpace
        return t
      })
    }
    const [map, rough, bump] = floorTex[k].map((t) => { const c = t.clone(); c.repeat.set(...rep); c.needsUpdate = true; return c })
    return new THREE.MeshPhysicalMaterial({ color: room.floor || '#ffffff', map, roughnessMap: rough, bumpMap: bump, bumpScale: 0.8, roughness: 0.8, clearcoat: 0.35, clearcoatRoughness: 0.35 })
  }
  if (type === 'tile') {
    const map = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, w, h)
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#e4e0d8' : '#cfcac1'; g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124) }
    }, true, [room.w / 1.2, room.d / 1.2])
    return new THREE.MeshPhysicalMaterial({ map, roughness: 0.35, clearcoat: 0.5, color: room.floor || '#ffffff' })
  }
  const map = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8a8c8b'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 30000; i++) { const v = 110 + Math.random() * 60; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2) }
  }, true, [room.w / 2, room.d / 2])
  return new THREE.MeshPhysicalMaterial({ map, color: room.floor || '#ffffff', roughness: 0.6, clearcoat: 0.3 })
}

function exteriorTexture(night) {
  return canvasTex(2048, 1024, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h)
    if (night) { sky.addColorStop(0, '#05080f'); sky.addColorStop(0.6, '#13213a'); sky.addColorStop(1, '#1d2a3e') }
    else { sky.addColorStop(0, '#8fb4d6'); sky.addColorStop(0.65, '#d7e3ec'); sky.addColorStop(1, '#eef0ea') }
    g.fillStyle = sky; g.fillRect(0, 0, w, h)
    if (night) {
      g.fillStyle = '#f2f4f8'; g.beginPath(); g.arc(w * 0.3, h * 0.2, 26, 0, Math.PI * 2); g.fill()
      g.fillStyle = 'rgba(200,215,240,0.12)'; g.beginPath(); g.arc(w * 0.3, h * 0.2, 80, 0, Math.PI * 2); g.fill()
    }
    // tree branches in front, buildings behind
    let x = 0, s = 7
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    while (x < w) {
      const bw = 120 + rnd() * 200, bh = h * (0.25 + rnd() * 0.35)
      g.fillStyle = night ? '#0d121b' : '#9a8f84'
      g.fillRect(x, h - bh, bw, bh)
      for (let yy = h - bh + 18; yy < h - 20; yy += 34) for (let xx = x + 14; xx < x + bw - 20; xx += 30) {
        const on = rnd() < (night ? 0.28 : 0)
        g.fillStyle = on ? (rnd() < 0.7 ? '#f0b46a' : '#cfe0ff') : (night ? '#141a24' : '#6d7782')
        g.fillRect(xx, yy, 14, 20)
      }
      x += bw + 10
    }
    g.strokeStyle = night ? '#05070a' : '#3d3a33'
    for (let i = 0; i < 18; i++) {
      g.lineWidth = 2 + rnd() * 6
      g.beginPath()
      let px = rnd() * w, py = h
      g.moveTo(px, py)
      for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 160; py -= 60 + rnd() * 90; g.lineTo(px, py) }
      g.stroke()
    }
  })
}

// ---------------------------------------------------------------- fixtures and rigs

function standGeometry(height, color = '#232527') {
  const g = new THREE.Group()
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.8 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, height, 10), m)
  pole.position.y = height / 2
  g.add(pole)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.62, 8), m)
    leg.position.set(Math.cos(a) * 0.22, 0.24, Math.sin(a) * 0.22)
    leg.lookAt(0, 0.6, 0)
    leg.rotateX(Math.PI / 2)
    g.add(leg)
  }
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: '#7a4b2c', roughness: 1 }))
  bag.position.set(0.22, 0.05, 0)
  g.add(bag)
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return g
}

function fixtureHead(fixture, cct, on, intensity, diffusion) {
  const g = new THREE.Group()
  const body = new THREE.MeshPhysicalMaterial({ color: '#1c1e20', roughness: 0.4, metalness: 0.6 })
  const glow = new THREE.MeshStandardMaterial({ color: '#000', emissive: on ? cctToHex(cct) : '#000', emissiveIntensity: on ? K * (0.25 + intensity * 1.2) : 0 })
  if (fixture === 'led_panel') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), body))
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), glow); f.position.z = 0.026; g.add(f)
    if ((diffusion ?? 0.7) > 0.6) {
      const box = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.3, 4, 1, true), new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.9, side: THREE.DoubleSide }))
      box.rotation.x = Math.PI / 2; box.rotation.y = Math.PI / 4; box.position.z = 0.17; g.add(box)
      const diff = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshStandardMaterial({ color: '#000', emissive: on ? cctToHex(cct) : '#000', emissiveIntensity: on ? K * (0.12 + intensity * 0.5) : 0, side: THREE.DoubleSide }))
      diff.position.z = 0.32; g.add(diff)
    }
  } else if (fixture === 'fresnel') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.26, 24), body); b.rotation.x = Math.PI / 2; g.add(b)
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.1, 32), glow); f.position.z = 0.131; g.add(f)
    for (const [x, y, rz] of [[0, 0.15, 0], [0, -0.15, 0], [0.15, 0, Math.PI / 2], [-0.15, 0, Math.PI / 2]]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.12), body)
      d.position.set(x, y, 0.19); d.rotation.z = rz; d.rotation.x = y > 0 ? -0.35 : y < 0 ? 0.35 : 0; g.add(d)
    }
  } else if (fixture === 'cob') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.28), body); g.add(b)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8, side: THREE.DoubleSide }))
    dome.rotation.x = -Math.PI / 2; dome.position.z = 0.6; dome.scale.set(1, 1, 0.55); g.add(dome)
    const diff = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), new THREE.MeshStandardMaterial({ color: '#000', emissive: on ? cctToHex(cct) : '#000', emissiveIntensity: on ? K * (0.2 + intensity * 0.8) : 0, side: THREE.DoubleSide }))
    diff.position.z = 0.62; g.add(diff)
  } else if (fixture === 'tube') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 16), glow))
  } else if (fixture === 'reflector') {
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), new THREE.MeshPhysicalMaterial({ color: '#e6e8ea', roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide })))
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.008, 8, 48), body))
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return g
}

// soft volumetric beam: additive cone that fades along its length and toward its edges
function beamMesh(length, angle, color, strength) {
  const radius = Math.tan(angle) * length
  const geo = new THREE.ConeGeometry(radius, length, 48, 1, true)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, 0, length / 2)
  const m = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, strength: { value: strength }, len: { value: length } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 col; uniform float strength; uniform float len; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float t = clamp(vT/len,0.0,1.0); float edge = pow(abs(dot(vN,vV)), 1.6); float a = strength * pow(1.0-t,1.4) * edge; gl_FragColor = vec4(col*a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, m)
  const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(radius, 48)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, toneMapped: false }))
  ring.position.z = length
  const g = new THREE.Group()
  g.add(mesh, ring)
  return g
}

function cameraBody() {
  const g = new THREE.Group()
  const m = new THREE.MeshPhysicalMaterial({ color: '#1d1f21', roughness: 0.4, metalness: 0.5 })
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.22), m))
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.16, 24), new THREE.MeshPhysicalMaterial({ color: '#0d0e0f', roughness: 0.3, metalness: 0.7 }))
  lens.rotation.x = Math.PI / 2; lens.position.z = 0.18; g.add(lens)
  const mb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), m)
  mb.position.z = 0.27; g.add(mb)
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.085, 0.015), m)
  mon.position.set(0.11, 0.1, -0.05); mon.rotation.y = -0.5; g.add(mon)
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.18), m)
  top.position.set(0, 0.09, 0); g.add(top)
  return g
}

function frustumLines(cam, aspect, color, depth = 2.4) {
  const th = Math.tan(hfov(cam.focal) / 2), tv = th / aspect
  const pts = [[-th, -tv], [th, -tv], [th, tv], [-th, tv]].map(([x, y]) => new THREE.Vector3(x * depth, y * depth, depth))
  const o = new THREE.Vector3()
  const arr = []
  for (const p of pts) arr.push(o, p)
  for (let i = 0; i < 4; i++) arr.push(pts[i], pts[(i + 1) % 4])
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(arr), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }))
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * th * depth, 2 * tv * depth), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }))
  plane.position.z = depth
  const g = new THREE.Group()
  g.add(lines, plane)
  return g
}

// film grade for the lens: split tone, vignette, grain
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.02 }, vignette: { value: 0.45 }, warm: { value: 0.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform float vignette; uniform float warm; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = clamp(c.rgb, 0.0, 1.0);
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      vec3 shadowT = vec3(0.92,1.0,1.12), highT = vec3(1.08,1.0,0.9);
      c.rgb *= mix(shadowT, highT, smoothstep(0.0, 0.6, l));
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.25); // gentle S-curve
      c.rgb = c.rgb * 0.96 + 0.018; // lift the blacks a touch so night scenes stay readable
      vec2 d = vUv - 0.5; c.rgb *= mix(1.0, smoothstep(0.85, 0.25, length(d)*1.25), vignette);
      c.rgb += (rand(vUv*vec2(1920.0,1080.0)) - 0.5) * grain;
      gl_FragColor = c;
    }`,
}

function makeComposer(renderer, scene, camera, { ao = true, grade = false, bloom = 0.35 } = {}) {
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 })
  const c = new EffectComposer(renderer, rt)
  c.renderToScreen = true
  c.addPass(new RenderPass(scene, camera))
  let gtao = null
  if (ao) {
    gtao = new GTAOPass(scene, camera, 2, 2)
    gtao.blendIntensity = 0.85
    gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8 })
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 })
    c.addPass(gtao)
  }
  // bloom runs before the exposure is applied, so the threshold is in scene units
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(2, 2), bloom, 0.5, 0.95 * K)
  c.addPass(bloomPass)
  c.addPass(new OutputPass())
  let gradePass = null
  if (grade) { gradePass = new ShaderPass(GradeShader); c.addPass(gradePass) }
  c.userData = { gtao, bloom: bloomPass, grade: gradePass, w: 0, h: 0 }
  return c
}

function sizeComposer(c, w, h) {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h))
  if (c.userData.w === w && c.userData.h === h) return
  c.userData.w = w; c.userData.h = h
  c.setSize(w, h)
}

// ======================================================================

export class SceneEngine {
  constructor(container, { mode = 'studio', onSelect, onTransform, onFrameRect, onLabels, quality = 'high' } = {}) {
    this.container = container
    this.mode = mode
    this.onSelect = onSelect
    this.onTransform = onTransform
    this.onFrameRect = onFrameRect
    this.onLabels = onLabels
    this.view = mode === 'studio' ? 'split' : 'set'
    this.ui = { cones: true, grid: true, haze: false, setLight: 'work' }
    this.quality = quality

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: mode === 'still' }))
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    // shadows only re-render when something moves, not when the view orbits
    r.shadowMap.autoUpdate = false
    this.shadowsDirty = true
    r.toneMapping = THREE.AgXToneMapping
    r.toneMappingExposure = BASE_EXPOSURE
    r.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(r.domElement)
    r.domElement.style.display = 'block'

    this.scene = new THREE.Scene()
    this.overlay = new THREE.Scene()
    this.bgSet = new THREE.Color('#18191c')
    this.scene.background = this.bgSet
    const pm = new THREE.PMREMGenerator(r)
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.5

    // studio cyc: a soft floor that fades into the background
    const cyc = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: '#2e2f33', roughness: 0.95 }))
    cyc.rotation.x = -Math.PI / 2
    cyc.position.y = -0.012
    cyc.receiveShadow = true
    this.cyc = cyc
    this.scene.add(cyc)
    this.scene.fog = new THREE.Fog('#18191c', 16, 34)

    // work light: neutral, bright modelling-software light for the set view only.
    // The lens always sees the real lighting plan.
    this.workLights = new THREE.Group()
    const hemi = new THREE.HemisphereLight('#f4f6fa', '#6b665e', 15)
    const sun = new THREE.DirectionalLight('#ffffff', 16)
    sun.position.set(4, 9, 6)
    this.workLights.add(hemi, sun)
    this.workLights.visible = false
    this.scene.add(this.workLights)

    const grid = new THREE.GridHelper(24, 48, '#45464b', '#2e2f33')
    grid.material.toneMapped = false
    grid.material.transparent = true
    grid.material.opacity = 0.6
    grid.position.y = -0.005
    this.grid = grid
    this.overlay.add(grid)

    this.setCam = new THREE.PerspectiveCamera(36, 1, 0.05, 80)
    this.setCam.position.set(6.2, 5.4, 7.4)
    this.setCam.layers.enable(HELPER)
    this.frameCam = new THREE.PerspectiveCamera(30, 2.39, 0.05, 60)

    this.controls = new OrbitControls(this.setCam, r.domElement)
    this.controls.target.set(0, 0.8, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.minDistance = 1.5
    this.controls.maxDistance = 60
    if (mode === 'showcase' || mode === 'still') { this.controls.enabled = false }

    this.roomGroup = new THREE.Group()
    this.dyn = new THREE.Group()
    this.helpers = new THREE.Group()
    this.scene.add(this.roomGroup, this.dyn)
    this.overlay.add(this.helpers)
    this.walls = []
    this.ceiling = null
    this.pickables = []
    this.byId = new Map()
    this.humanCache = new Map()

    const hi = quality === 'high'
    this.lensComposer = makeComposer(r, this.scene, this.frameCam, { ao: hi, grade: true, bloom: 0.4 })

    if (mode === 'studio' || mode === 'preview') {
      this.tc = new TransformControls(this.setCam, r.domElement)
      this.tc.setSize(0.7)
      this.tc.showY = false
      this.tcHelper = this.tc.getHelper()
      this.overlay.add(this.tcHelper)
      this.tc.addEventListener('dragging-changed', (e) => {
        this.controls.enabled = !e.value
        this.dragging = e.value
        if (!e.value && this.tc.object) this.commitDrag(this.tc.object)
      })
      this.tc.addEventListener('change', () => { this.dirty = true; if (this.dragging) this.shadowsDirty = true })
      this.bindPicking()
    }

    this.unsubAsset = onAssetLoaded(() => { clearTimeout(this.assetTimer); this.assetTimer = setTimeout(() => { this.dynKey = null; if (this.current) this.setScene(this.current, this.lastOpts) }, 60) })
    this.dirty = true
    this.controls.addEventListener('change', () => { this.dirty = true })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    this.t0 = performance.now()
    this.tween = null
    this.showT = 0
    this.loop = this.loop.bind(this)
    if (mode !== 'still') this.raf = requestAnimationFrame(this.loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.disposed = true
    this.unsubAsset?.()
    this.ro.disconnect()
    this.controls.dispose()
    if (this.tc) { this.tc.detach(); this.tc.disconnect() }
    this.lensComposer.dispose?.()
    this.renderer.dispose()
    this.renderer.forceContextLoss?.()
    this.renderer.domElement.remove()
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.w = w; this.h = h
    this.dirty = true
  }

  setView(v) { this.view = v; this.dirty = true }
  setUI(ui) {
    const conesChanged = ui.cones !== undefined && ui.cones !== this.ui.cones
    this.ui = { ...this.ui, ...ui }
    if (conesChanged) this.dynKey = null
    if (this.current) this.setScene(this.current, this.lastOpts)
    this.dirty = true
  }

  // ---------------------------------------------------------------- scene sync
  setScene(scene, opts = {}) {
    const { pending } = opts
    this.lastOpts = opts
    const show = pending?.scene || scene
    if (!show) return
    this.current = scene
    this.shown = show
    const roomKey = JSON.stringify([show.room, show.time])
    if (roomKey !== this.roomKey) {
      this.roomKey = roomKey
      this.buildRoom(show.room, show.time)
      // frame the set camera to the size of the location (a trench is not a bedroom)
      const m = Math.max(show.room.w, show.room.d)
      if ((this.mode === 'studio' || this.mode === 'preview') && (!this.framedFor || Math.abs(this.framedFor - m) / m > 0.3)) {
        const first = !this.framedFor
        this.framedFor = m
        if (first && m <= 7) { /* keep the page's own starting angle for normal rooms */ } else {
          const pos = [m * 0.95, m * 0.85, m * 1.15], tgt = [0, 0.6, -0.2]
          if (first) { this.setCam.position.set(...pos); this.controls.target.set(...tgt); this.controls.update() } else this.flyTo(pos, tgt)
        }
      }
    }
    const dynKey = JSON.stringify([show.objects, show.actors, show.lights, show.cameras, show.activeCam, show.aspect, pending?.changed, this.ui.cones])
    if (dynKey !== this.dynKey) { this.dynKey = dynKey; this.buildDynamic(show, new Set(pending?.changed || [])) }
    const ev = ((show.iso || 800) / 800) * Math.pow(2.8 / (show.tstop || 2.8), 2)
    if (this.skyMat) this.skyMat.uniforms.gain.value = this.skyBase / Math.max(0.01, ev) // the sky reads the same at any exposure
    if (this.lensFog) this.lensFog.color.copy(this.lensFogBase).multiplyScalar(1 / Math.max(0.01, ev))
    this.renderer.toneMappingExposure = BASE_EXPOSURE * ev * (this.exposureBias || 1)
    this.selection = opts.selection
    this.applySelection()
    this.dirty = true
    this.shadowsDirty = true
  }

  buildRoom(room, time) {
    this.roomGroup.clear()
    this.windowShadow = false
    this.walls = []
    this.exterior = room.kind === 'exterior'
    this.scene.fog = this.exterior ? new THREE.Fog('#18191c', 38, 80) : new THREE.Fog('#18191c', 16, 34)
    this.lensFog = null
    this.skyMat = null
    if (this.exterior) return this.buildExterior(room, time)
    const { w, d, h } = room
    const night = time !== 'day'
    this.night = night
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMaterial(room))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    floor.userData.floor = true
    this.roomGroup.add(floor)
    const wallMat = new THREE.MeshPhysicalMaterial({ color: room.wall, roughness: 0.92, normalMap: plasterNormal(), normalScale: new THREE.Vector2(0.25, 0.25) })
    const trimMat = new THREE.MeshPhysicalMaterial({ color: '#e4ded2', roughness: 0.55, clearcoat: 0.2 })
    const ext = exteriorTexture(night)
    for (const side of ['N', 'S', 'E', 'W']) {
      const f = wallFrame(room, side)
      const len = f.len
      const shape = new THREE.Shape()
      shape.moveTo(-len / 2 - 0.1, 0); shape.lineTo(len / 2 + 0.1, 0); shape.lineTo(len / 2 + 0.1, h); shape.lineTo(-len / 2 - 0.1, h); shape.lineTo(-len / 2 - 0.1, 0)
      const ops = room.openings.filter((o) => o.wall === side)
      for (const op of ops) {
        const hole = new THREE.Path()
        const x0 = op.at - op.width / 2, x1 = op.at + op.width / 2
        hole.moveTo(x0, op.sill); hole.lineTo(x1, op.sill); hole.lineTo(x1, op.sill + op.height); hole.lineTo(x0, op.sill + op.height); hole.lineTo(x0, op.sill)
        shape.holes.push(hole)
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false })
      const wall = new THREE.Mesh(geo, wallMat)
      wall.castShadow = true
      wall.receiveShadow = true
      wall.position.z = -0.12
      const g = new THREE.Group()
      g.add(wall)
      const bb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.018), trimMat)
      bb.position.set(0, 0.05, 0.009); bb.receiveShadow = true
      g.add(bb)
      const crown = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.03), trimMat)
      crown.position.set(0, h - 0.03, 0.015)
      g.add(crown)
      for (const op of ops) {
        const fr = new THREE.Group()
        const t = 0.06
        if (op.type === 'window') {
          const parts = [
            [op.width + t * 2, t, 0, op.sill - t / 2], [op.width + t * 2, t, 0, op.sill + op.height + t / 2],
            [t, op.height, -op.width / 2 - t / 2, op.sill + op.height / 2], [t, op.height, op.width / 2 + t / 2, op.sill + op.height / 2],
            [op.width, 0.04, 0, op.sill + op.height * 0.55], [0.035, op.height, 0, op.sill + op.height / 2],
          ]
          for (const [pw, ph, px, py] of parts) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.08), trimMat)
            m.position.set(px, py, -0.05)
            m.castShadow = true
            fr.add(m)
          }
          const sill = new THREE.Mesh(new THREE.BoxGeometry(op.width + 0.18, 0.035, 0.2), trimMat)
          sill.position.set(0, op.sill - 0.02, 0.05)
          sill.castShadow = true; sill.receiveShadow = true
          fr.add(sill)
          const glass = new THREE.Mesh(new THREE.PlaneGeometry(op.width, op.height), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transmission: 1, thickness: 0.005, transparent: true, opacity: 0.15 }))
          glass.position.set(0, op.sill + op.height / 2, -0.06)
          fr.add(glass)
          // the view outside, lit like the world (scaled to survive exposure)
          const outM = new THREE.MeshBasicMaterial({ map: ext, fog: false })
          outM.color.setScalar(night ? K * 0.35 : K * 2.2)
          const sx = op.width * 3.2, sy = op.height * 2.2
          const out = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), outM)
          out.userData.exterior = true
          const off = (op.at / len) * 0.4
          outM.map = ext.clone(); outM.map.needsUpdate = true
          outM.map.repeat.set(0.35, 0.5); outM.map.offset.set(0.3 + off, 0.25)
          out.position.set(op.at, op.sill + op.height / 2, -1.5)
          g.add(out)
          // light through the window
          const c = openingCenter(room, op)
          const spot = new THREE.SpotLight(night ? '#9dbcf0' : '#fff2dd', night ? 60 : 2600, 0, 0.6, 0.9, 2)
          spot.position.set(c[0] - f.n[0] * 2.2, op.sill + op.height + 0.9, c[1] - f.n[1] * 2.2)
          spot.target.position.set(c[0] + f.n[0] * 2.4, 0, c[1] + f.n[1] * 2.4)
          spot.castShadow = !this.windowShadow
          this.windowShadow = true
          spot.shadow.mapSize.set(512, 512)
          spot.shadow.bias = -0.0004
          spot.shadow.normalBias = 0.02
          this.roomGroup.add(spot, spot.target)
        } else {
          const hall = new THREE.Mesh(new THREE.PlaneGeometry(op.width + 0.4, op.height + 0.3), new THREE.MeshStandardMaterial({ color: '#2a2a2c', roughness: 1 }))
          hall.position.set(op.at, op.height / 2, -1.2)
          hall.userData.exterior = true
          g.add(hall)
          const hallLight = new THREE.PointLight(night ? '#ffcf96' : '#fff4e6', night ? 6 : 20, 0, 2)
          hallLight.position.set(op.at, op.height - 0.2, -0.9)
          g.add(hallLight)
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(op.width - 0.04, op.height - 0.03, 0.04), new THREE.MeshPhysicalMaterial({ color: '#e9e4d9', roughness: 0.5, clearcoat: 0.3 }))
          leaf.geometry.translate((op.width - 0.04) / 2, 0, 0)
          leaf.position.set(op.at - op.width / 2 + 0.02, op.height / 2, -0.06)
          leaf.rotation.y = 1.15
          leaf.castShadow = true
          g.add(leaf)
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshPhysicalMaterial({ color: '#b0904f', metalness: 1, roughness: 0.3 }))
          knob.position.set(op.width - 0.12, 0, 0.04)
          leaf.add(knob)
          for (const [pw, ph, px, py] of [[op.width + 0.16, 0.08, 0, op.height + 0.04], [0.08, op.height, -op.width / 2 - 0.04, op.height / 2], [0.08, op.height, op.width / 2 + 0.04, op.height / 2]]) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.03), trimMat)
            m.position.set(px, py, 0.012)
            fr.add(m)
          }
        }
        fr.position.x = op.at
        fr.userData.opening = op.id
        g.add(fr)
      }
      g.position.set(f.o[0], 0, f.o[1])
      g.rotation.y = Math.atan2(f.n[0], f.n[1])
      const tx = new THREE.Vector3(1, 0, 0).applyEuler(g.rotation)
      if (tx.x * f.t[0] + tx.z * f.t[1] < 0) g.scale.x = -1
      g.userData = { side, normal: f.n, origin: f.o }
      this.walls.push(g)
      this.roomGroup.add(g)
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, d + 0.3), new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.95 }))
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = h
    ceil.receiveShadow = true
    this.ceiling = ceil
    this.roomGroup.add(ceil)
    this.cyc.material.color.set('#2e2f33')
  }

  // ---------------------------------------------------------------- exteriors: ground, sky, sun
  buildExterior(room, time) {
    const { w, d } = room
    this.ceiling = null
    this.night = time === 'night'
    const t = time === 'dusk' ? 'dusk' : time === 'night' ? 'night' : 'day'
    const ground = new THREE.Mesh(new THREE.CircleGeometry(46, 64), groundMaterial(room.ground || 'dirt'))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.userData.floor = true
    this.roomGroup.add(ground)
    // the playing area, only drawn in the set view
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([x, z]) => new THREE.Vector3(x, 0.015, z))
    const area = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#e6e8ec', dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.55, toneMapped: false }))
    area.computeLineDistances()
    area.userData.areaMark = true
    this.roomGroup.add(area)
    const SKY = { day: ['#4a7fbf', '#d4e4f1', 0.75], dusk: ['#2a2c58', '#f39056', 0.6], night: ['#03050b', '#18233a', 0.2] }[t]
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(SKY[0]) }, bottom: { value: new THREE.Color(SKY[1]) }, gain: { value: SKY[2] * K } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float gain; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.05, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)) * gain, 1.0); }',
    })
    this.skyBase = SKY[2] * K
    this.skyMat = skyMat
    const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), skyMat)
    sky.userData.exterior = true
    this.roomGroup.add(sky)
    // sun or moon, in lux like every other unit
    const SUN = { day: ['#fff1dc', 420, 48, 0.9], dusk: ['#ff9b5c', 75, 9, 2.4], night: ['#9db4e0', 6, 40, -2.2] }[t]
    const sun = new THREE.DirectionalLight(SUN[0], SUN[1])
    const el = (SUN[2] * Math.PI) / 180, az = SUN[3]
    sun.position.set(Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, -Math.cos(az) * Math.cos(el) * 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const ext = Math.max(w, d) * 0.8
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.03
    this.roomGroup.add(sun, sun.target)
    const HEMI = { day: ['#bcd4ee', '#6b5a45', 120], dusk: ['#6f6aa0', '#3a2c26', 32], night: ['#2a3a5c', '#0c0c10', 3] }[t]
    this.roomGroup.add(new THREE.HemisphereLight(HEMI[0], HEMI[1], HEMI[2]))
    this.buildBackdrop(room, t)
    const hz = room.haze || 0
    this.lensFogBase = new THREE.Color(SKY[1]).multiplyScalar((t === 'night' ? 0.25 : 0.6) * K)
    this.lensFog = hz ? new THREE.FogExp2(this.lensFogBase.clone(), 0.014 * hz) : null
    this.cyc.material.color.set('#2e2f33')
  }

  // distant scenery so exteriors have depth through the lens; hidden in the set view
  buildBackdrop(room, t) {
    const g = new THREE.Group()
    g.userData.exterior = true
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const tpl = room.template
    const dark = new THREE.MeshStandardMaterial({ color: t === 'day' ? '#3f4a35' : '#1a1d17', roughness: 1 })
    if (tpl === 'forest' || tpl === 'battlefield') {
      const n = tpl === 'forest' ? 140 : 40
      const trunk = new THREE.MeshStandardMaterial({ color: '#241d17', roughness: 1 })
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = 16 + rnd() * 26
        const x = Math.cos(a) * r, z = Math.sin(a) * r
        if (Math.abs(x) < room.w / 2 + 3 && Math.abs(z) < room.d / 2 + 3) continue
        const h = tpl === 'forest' ? 7 + rnd() * 9 : 3 + rnd() * 4
        if (tpl === 'forest') {
          const c = new THREE.Mesh(new THREE.ConeGeometry(1.6 + rnd() * 1.4, h, 7), dark)
          c.position.set(x, h / 2 + 1, z); g.add(c)
        } else {
          // shattered trunks and posts
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, h, 6), trunk)
          c.position.set(x, h / 2, z); c.rotation.z = (rnd() - 0.5) * 0.4; g.add(c)
        }
      }
      if (tpl === 'battlefield') {
        for (let i = 0; i < 18; i++) {
          const a = rnd() * Math.PI * 2, r = 20 + rnd() * 20
          const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + rnd() * 2.5, 0), new THREE.MeshStandardMaterial({ color: '#2a231d', roughness: 1 }))
          m.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r); m.scale.y = 0.35; g.add(m)
        }
      }
    }
    if (tpl === 'street') {
      const tex = exteriorTexture(t !== 'day')
      for (let i = 0; i < 9; i++) {
        const w = 6 + rnd() * 6, h = 9 + rnd() * 16, d = 8
        const mat = new THREE.MeshBasicMaterial({ map: tex.clone(), fog: true })
        mat.map.needsUpdate = true
        mat.map.repeat.set(w / 14, h / 14); mat.map.offset.set(rnd(), rnd() * 0.3)
        mat.color.setScalar(t === 'day' ? K * 0.5 : K * 0.18)
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
        b.position.set(-30 + i * 7.2, h / 2, -room.d / 2 - 9 - rnd() * 4)
        g.add(b)
      }
    }
    this.roomGroup.add(g)
  }

  async humanFor(a, seat) {
    const key = JSON.stringify([a.id, a.model, a.pose, a.tone, a.outfit, seat, getHumanStyle()])
    if (!this.humanCache.has(key)) this.humanCache.set(key, buildHuman(a, seat))
    return this.humanCache.get(key)
  }

  seatHeightAt(scene, a) {
    let best = 0.45, bd = 0.8
    for (const o of scene.objects) {
      const as = getAsset(o.asset)
      if (!as?.seat) continue
      const dd = Math.hypot(o.x - a.x, o.z - a.z)
      if (dd < bd) { bd = dd; best = as.seat }
    }
    return best
  }

  buildDynamic(s, changed) {
    const token = (this.buildToken = (this.buildToken || 0) + 1)
    this.dyn.clear()
    this.helpers.clear()
    this.pickables = []
    this.byId.clear()
    const aspect = ASPECTS[s.aspect] || 2.39
    const room = s.room
    const tag = (obj, kind, id) => {
      obj.userData.pick = { kind, id }
      this.pickables.push(obj)
      this.byId.set(id, obj)
    }
    let shadowBudget = 0 // point-light shadows cost six renders each; practicals stay shadowless
    // ---- objects
    for (const o of s.objects) {
      const a = getAsset(o.asset)
      if (!a) continue
      const g = new THREE.Group()
      const inst = instance(o.asset, room)
      g.add(inst)
      if (a.wall) {
        const dists = [['N', o.z + room.d / 2], ['S', room.d / 2 - o.z], ['W', o.x + room.w / 2], ['E', room.w / 2 - o.x]].sort((p, q) => p[1] - q[1])
        const side = dists[0][0]
        const f = wallFrame(room, side)
        const along = side === 'N' || side === 'S' ? o.x : o.z
        g.position.set(side === 'N' || side === 'S' ? along : f.o[0] + f.n[0] * 0.03, a.mountY, side === 'W' || side === 'E' ? along : f.o[1] + f.n[1] * 0.03)
        g.rotation.y = Math.atan2(f.n[0], f.n[1])
      } else {
        g.position.set(o.x, o.y || 0, o.z)
        g.rotation.y = o.rot || 0
      }
      if (a.practical) {
        const on = o.on !== false
        inst.traverse((m) => {
          if (m.isMesh && m.userData.practicalShade) {
            const mats = Array.isArray(m.material) ? m.material : [m.material]
            mats.forEach((mm) => { if (mm.emissive) { mm.emissive.set(on ? '#ffb066' : '#000000'); mm.emissiveIntensity = on ? K * 0.06 : 0 } })
          }
        })
        if (on) {
          const pl = new THREE.PointLight(cctToHex(a.practical.cct), a.practical.cd, 0, 2)
          pl.position.set(0, a.hang ? room.h + a.practical.y : a.practical.y, 0)
          if (shadowBudget > 0 && a.practical.cd > 10) { pl.castShadow = true; pl.shadow.mapSize.set(512, 512); pl.shadow.bias = -0.002; pl.shadow.radius = 4; shadowBudget-- }
          g.add(pl)
        }
      }
      tag(g, 'objects', o.id)
      this.dyn.add(g)
      if (changed.has(o.id)) this.addGhost(g, DAYLIGHT)
    }
    // ---- people (async: realistic rigs load once, then poses are instant)
    for (const a of s.actors) {
      const g = new THREE.Group()
      g.position.set(a.x, 0, a.z)
      g.rotation.y = a.rot || 0
      const seat = this.seatHeightAt(s, a)
      const ph = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, a.pose === 'stand' || a.pose === 'crossed' ? 1.3 : 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: '#3a3f3c', transparent: true, opacity: 0.4 }))
      ph.position.y = a.pose === 'stand' || a.pose === 'crossed' ? 0.85 : 0.75
      g.add(ph)
      // cheap invisible proxy for picking: raycasting a skinned mesh is very slow
      const proxy = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, a.pose === 'stand' || a.pose === 'crossed' ? 1.25 : 0.75, 4, 8), new THREE.MeshBasicMaterial({ visible: false }))
      proxy.position.y = ph.position.y
      proxy.userData.proxy = true
      g.add(proxy)
      this.humanFor(a, seat).then((h) => {
        if (token !== this.buildToken || this.disposed) return
        g.remove(ph)
        g.add(h.clone ? cloneSkinned(h) : h)
        this.dirty = true
        this.refreshSelectionBox()
      }).catch(() => {})
      tag(g, 'actors', a.id)
      this.dyn.add(g)
      if (changed.has(a.id)) this.addGhost(g, DAYLIGHT, 1.0)
    }
    // ---- lights
    let litBudget = 2
    this.totalOutput = 0
    for (const l of s.lights) {
      const fx = FIXTURES[l.fixture]
      if (!fx) continue
      const root = new THREE.Group()
      root.position.set(l.x, l.y, l.z)
      const stand = standGeometry(Math.max(0.3, l.y - 0.1))
      stand.position.y = -l.y
      root.add(stand)
      const head = fixtureHead(l.fixture, l.cct, l.on !== false, l.intensity, l.diffusion ?? fx.softness)
      const aim = new THREE.Vector3(...l.aim)
      root.add(head)
      head.lookAt(aim)
      if (l.fixture === 'tube') head.rotation.set(0, 0, 0)
      const color = new THREE.Color(cctToHex(l.cct))
      if (l.on !== false) {
        const soft = l.diffusion ?? fx.softness
        const angle = Math.min(Math.PI / 2.2, ((fx.beam / 2) * Math.PI) / 180)
        const cd = fx.cd * l.intensity
        this.totalOutput += cd
        const spot = new THREE.SpotLight(color, cd, 0, angle, 0.2 + soft * 0.7, 2)
        root.add(spot, spot.target)
        spot.target.position.copy(aim).sub(root.position)
        if (litBudget > 0 && !fx.passive) {
          spot.castShadow = true
          spot.shadow.mapSize.set(1024, 1024)
          spot.shadow.bias = -0.0003
          spot.shadow.normalBias = 0.02
          spot.shadow.radius = 2 + soft * 8
          spot.shadow.camera.near = 0.2
          litBudget--
        }
        // first bounce: a little of the beam comes back from what it hits, tinted by the room
        const bounce = new THREE.PointLight(color.clone().lerp(new THREE.Color(room.wall), 0.5), cd * 0.06, 0, 2)
        const back = new THREE.Vector3().subVectors(root.position, aim).normalize().multiplyScalar(0.6)
        bounce.position.copy(aim).add(back).sub(root.position)
        root.add(bounce)
        if (this.ui.cones && !fx.passive) {
          const length = Math.min(3.2, aim.distanceTo(root.position) + 0.25)
          const beam = beamMesh(length, Math.min(angle, 1.0), color, 0.05 + l.intensity * 0.12)
          beam.position.copy(root.position)
          beam.lookAt(aim)
          this.helpers.add(beam)
        }
      }
      tag(root, 'lights', l.id)
      this.dyn.add(root)
      if (changed.has(l.id)) this.addGhost(root, DAYLIGHT)
    }
    // global bounce: the more light in the room, the more it fills in
    const area = room.w * room.d
    const base = s.time === 'day' ? 1.6 : s.time === 'dusk' ? 0.5 : 0.05
    this.scene.environmentIntensity = (base + (this.totalOutput / area) * 0.0035) * K * 0.012
    // ---- cameras (only visible in the set view)
    for (const c of s.cameras) {
      const active = c.id === s.activeCam
      const root = new THREE.Group()
      root.position.set(c.x, c.y, c.z)
      const tripod = standGeometry(Math.max(0.3, c.y - 0.14), '#1b1c1e')
      tripod.position.y = -c.y
      root.add(tripod)
      const head = new THREE.Group()
      head.add(cameraBody())
      root.add(head)
      head.lookAt(new THREE.Vector3(...c.aim))
      onLayer(root, HELPER)
      const fr = frustumLines(c, aspect, active ? TUNGSTEN : '#8b918d', 2.3)
      fr.position.copy(root.position)
      fr.lookAt(new THREE.Vector3(...c.aim))
      this.helpers.add(fr)
      tag(root, 'cameras', c.id)
      this.dyn.add(root)
      if (changed.has(c.id)) this.addGhost(root, DAYLIGHT)
    }
    const cam = s.cameras.find((c) => c.id === s.activeCam) || s.cameras[0]
    this.lens = cam || null
    this.lensAspect = aspect
    if (this.lens && !this.lensPos) this.lensPos = { pos: new THREE.Vector3(cam.x, cam.y, cam.z), aim: new THREE.Vector3(...cam.aim), fov: cam.focal }
    if (this.lens) this.lensTarget = { pos: new THREE.Vector3(cam.x, cam.y, cam.z), aim: new THREE.Vector3(...cam.aim), focal: cam.focal }
    this.applySelection()
  }

  addGhost(obj, color, h) {
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj, true)
    if (box.isEmpty()) return
    if (h) box.max.y = Math.max(box.max.y, h)
    box.expandByScalar(0.05)
    const helper = new THREE.Box3Helper(box, color)
    helper.material.transparent = true
    helper.material.depthTest = false
    helper.material.toneMapped = false
    helper.material.opacity = 0.85
    helper.userData.ghost = true
    this.helpers.add(helper)
  }

  refreshSelectionBox() { this.applySelection() }

  applySelection() {
    if (this.selBox) { this.helpers.remove(this.selBox); this.selBox = null }
    const id = this.selection?.id
    const obj = id && this.byId.get(id)
    if (!obj) { this.tc?.detach(); return }
    const kind = obj.userData.pick.kind
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj, true)
    box.expandByScalar(0.04)
    this.selBox = new THREE.Box3Helper(box, TUNGSTEN)
    this.selBox.material.toneMapped = false
    this.selBox.material.depthTest = false
    this.helpers.add(this.selBox)
    if (!this.tc) return
    const asset = kind === 'objects' ? getAsset(this.shown.objects.find((o) => o.id === id)?.asset) : null
    if (asset?.wall) { this.tc.detach(); return }
    this.tc.attach(obj)
    this.tc.showX = true; this.tc.showZ = true
    this.tc.showY = kind === 'lights' || kind === 'cameras'
  }

  commitDrag(o) {
    const pick = o.userData.pick
    if (!pick || !this.onTransform) return
    const c = { x: +o.position.x.toFixed(2), z: +o.position.z.toFixed(2) }
    if (pick.kind === 'lights' || pick.kind === 'cameras') {
      c.y = +o.position.y.toFixed(2)
      // keep the aim when a fixture moves
    }
    if (pick.kind === 'objects') c.y = +o.position.y.toFixed(2)
    this.onTransform(pick.kind, pick.id, c)
  }

  // ---------------------------------------------------------------- picking
  regions() {
    const W = this.w, H = this.h
    if (this.view === 'set' || this.view === 'plan') return { set: { x: 0, y: 0, w: W, h: H }, frame: null }
    if (this.view === 'frame') return { set: null, frame: { x: 0, y: 0, w: W, h: H } }
    const sh = Math.round(H * 0.5)
    if (this.view === 'plan2d') return { set: null, frame: { x: 0, y: sh + 1, w: W, h: H - sh - 1 } }
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
      this.controls.enabled = !!inSet && !this.dragging && !this.tween
      down = { x: e.clientX, y: e.clientY, inSet }
    }, true)
    el.addEventListener('pointerup', (e) => {
      if (!down || !down.inSet || this.dragging || this.tc?.dragging) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
      this.onSelect?.(this.pick(e.clientX, e.clientY))
    })
    let hoverEv = null, hoverRaf = 0
    el.addEventListener('pointermove', (e) => {
      if (this.dragging || e.buttons) return
      hoverEv = e
      if (hoverRaf) return
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0
        const hit = this.pick(hoverEv.clientX, hoverEv.clientY)
        const id = hit?.id || null
        if (id !== this.hoverId) { this.hoverId = id; el.style.cursor = id ? 'pointer' : 'grab'; const reg = this.regions().set; if (reg) this.emitLabels(reg) }
      })
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
    for (const p of this.pickables) p.traverse((o) => { if (o.isMesh && o.visible && !o.isSkinnedMesh) meshes.push(o) })
    for (const h of rc.intersectObjects(meshes, false)) {
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

  frameHit(u, v) {
    if (!this.lens) return null
    const rc = new THREE.Raycaster()
    rc.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), this.frameCam)
    const meshes = []
    for (const p of this.pickables) p.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o) })
    for (const h of rc.intersectObjects(meshes, false)) {
      let o = h.object
      while (o && !o.userData.pick) o = o.parent
      if (o) return o.userData.pick
    }
    return null
  }

  // ---------------------------------------------------------------- camera moves
  flyTo(pos, target, ms = 900) {
    this.tween = { from: { p: this.setCam.position.clone(), t: this.controls.target.clone() }, to: { p: new THREE.Vector3(...pos), t: new THREE.Vector3(...target) }, t0: performance.now(), ms }
    this.dirty = true
  }

  preset(name) {
    const r = this.shown?.room || { w: 5, d: 4, h: 2.7 }
    const m = Math.max(r.w, r.d)
    if (name === 'top') this.flyTo([0.001, m * 2.1, 0.01], [0, 0, 0])
    else if (name === 'front') this.flyTo([0, 1.6, r.d / 2 + m * 0.9], [0, 0.9, 0])
    else this.flyTo([m * 0.95, m * 0.85, m * 1.15], [0, 0.6, -0.2])
  }

  frameOn(id) {
    const obj = this.byId.get(id)
    if (!obj) return
    const p = obj.getWorldPosition(new THREE.Vector3())
    const dir = new THREE.Vector3().subVectors(this.setCam.position, this.controls.target).normalize()
    this.flyTo(p.clone().add(dir.multiplyScalar(4)).toArray(), [p.x, Math.max(0.6, p.y), p.z])
  }

  // landing page: 0 = overview, 1 = through the lens
  setShowcase(t) { this.showT = Math.max(0, Math.min(1, t)); this.dirty = true }

  // ---------------------------------------------------------------- render
  setWallsFor(camPos, dollhouse) {
    for (const g of this.walls) {
      if (!dollhouse) { g.visible = true; continue }
      const n = g.userData.normal, o = g.userData.origin
      const side = (camPos.x - o[0]) * n[0] + (camPos.z - o[1]) * n[1]
      g.visible = side > -0.05
    }
    if (this.ceiling) this.ceiling.visible = !dollhouse
    this.roomGroup.traverse((o) => { if (o.userData.exterior) o.visible = !dollhouse; if (o.userData.areaMark) o.visible = dollhouse })
  }

  updateFrameCam(region) {
    const c = this.lens
    if (!c) return null
    const aspect = this.lensAspect
    // in the studio the lens image sits between the floating panels and above the command bar
    const studio = this.mode === 'studio' && !this.snapping
    const L = studio ? (region.w > 820 ? 292 : 12) : 0
    const R = studio ? (region.w > 1180 ? 322 : 12) : 0
    const B = studio ? (this.view === 'frame' ? 165 : 150) : 0
    const T = studio ? (this.view === 'frame' ? 60 : 10) : 0
    const aw = Math.max(200, region.w - L - R), ah = Math.max(120, region.h - B - T)
    let w = aw, h = Math.round(aw / aspect)
    if (h > ah) { h = ah; w = Math.round(h * aspect) }
    const x = region.x + L + Math.round((aw - w) / 2)
    const y = region.y + T + Math.round((ah - h) / 2)
    // ease the lens toward its target so camera switches glide
    const tgt = this.lensTarget
    if (!this.lensPos) this.lensPos = { pos: tgt.pos.clone(), aim: tgt.aim.clone(), fov: tgt.focal }
    const k = this.instantLens ? 1 : 0.18
    this.lensPos.pos.lerp(tgt.pos, k)
    this.lensPos.aim.lerp(tgt.aim, k)
    this.lensPos.fov += (tgt.focal - this.lensPos.fov) * k
    if (this.lensPos.pos.distanceTo(tgt.pos) > 0.002 || Math.abs(this.lensPos.fov - tgt.focal) > 0.05) this.dirty = true
    const th = Math.tan(hfov(this.lensPos.fov) / 2)
    this.frameCam.fov = (2 * Math.atan(th / aspect) * 180) / Math.PI
    this.frameCam.aspect = aspect
    this.frameCam.position.copy(this.lensPos.pos)
    this.frameCam.lookAt(this.lensPos.aim)
    this.frameCam.updateProjectionMatrix()
    return { x, y, w, h }
  }

  renderComposer(composer, rect, cam) {
    const r = this.renderer
    sizeComposer(composer, rect.w, rect.h)
    const yy = this.h - rect.y - rect.h
    r.setViewport(rect.x, yy, rect.w, rect.h)
    r.setScissor(rect.x, yy, rect.w, rect.h)
    r.setScissorTest(true)
    if (composer.userData.grade) composer.userData.grade.uniforms.time.value = (performance.now() % 10000) / 1000
    composer.render()
    r.setViewport(rect.x, yy, rect.w, rect.h)
    r.setScissor(rect.x, yy, rect.w, rect.h)
  }

  loop() {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.ms)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      this.setCam.position.lerpVectors(this.tween.from.p, this.tween.to.p, e)
      this.controls.target.lerpVectors(this.tween.from.t, this.tween.to.t, e)
      this.dirty = true
      if (k >= 1) this.tween = null
    }
    if (this.mode !== 'showcase' && this.controls.update()) this.dirty = true
    // proposed-change outlines are static: re-rendering the full composer every frame would cook laptops
    if (this.mode === 'showcase') this.dirty = true
    if (!this.dirty) {
      // once things stop moving, draw the lens once at full quality (AO, bloom, grade)
      if (this.finalAt && now >= this.finalAt) { this.finalAt = 0; this.finalNow = true; this.render(); this.finalNow = false }
      return
    }
    this.dirty = false
    this.render()
    if (this.view !== 'set') this.finalAt = now + 380
  }

  // plain forward render into a region of the canvas (fast path, used while editing)
  renderDirect(rect, cam) {
    const r = this.renderer
    const yy = this.h - rect.y - rect.h
    r.setViewport(rect.x, yy, rect.w, rect.h)
    r.setScissor(rect.x, yy, rect.w, rect.h)
    r.setScissorTest(true)
    r.render(this.scene, cam)
  }

  render() {
    const r = this.renderer
    r.setScissorTest(true)
    r.setScissor(0, 0, this.w, this.h)
    r.setViewport(0, 0, this.w, this.h)
    r.setClearColor('#141518')
    r.clear()
    if (this.shadowsDirty) { r.shadowMap.needsUpdate = true; this.shadowsDirty = false }
    if (this.mode === 'showcase') return this.renderShowcase()
    const reg = this.regions()
    let rect = null
    if (reg.set) {
      const { x, y, w, h } = reg.set
      this.setCam.aspect = w / h
      this.setCam.updateProjectionMatrix()
      this.setWallsFor(this.setCam.position, true)
      this.scene.background = this.bgSet
      this.cyc.visible = !this.exterior
      this.grid.visible = this.ui.grid
      if (this.tcHelper) this.tcHelper.visible = !!this.tc.object
      this.workLights.visible = this.ui.setLight !== 'scene'
      this.renderDirect({ x, y, w, h }, this.setCam)
      this.workLights.visible = false
      r.autoClear = false
      r.render(this.overlay, this.setCam)
      r.autoClear = true
      this.emitLabels(reg.set)
    }
    if (reg.frame) {
      rect = this.lens ? this.updateFrameCam(reg.frame) : null
      if (rect) {
        this.setWallsFor(this.frameCam.position, false)
        this.cyc.visible = false
        this.scene.background = new THREE.Color('#050505')
        const setFog = this.scene.fog
        if (this.exterior) this.scene.fog = this.lensFog
        if (this.finalNow || this.mode === 'still') this.renderComposer(this.lensComposer, rect, this.frameCam)
        else this.renderDirect(rect, this.frameCam)
        this.scene.fog = setFog
        if (this.ui.haze) { r.autoClear = false; this.grid.visible = false; if (this.tcHelper) this.tcHelper.visible = false; r.render(this.overlay, this.frameCam); r.autoClear = true }
      }
    }
    const key = JSON.stringify([reg, rect])
    if (key !== this.lastRectKey) { this.lastRectKey = key; this.onFrameRect?.({ set: reg.set, frame: reg.frame, image: rect }) }
  }

  renderShowcase() {
    if (!this.lens) return
    const k = this.showT
    const e = k * k * (3 - 2 * k)
    const room = this.shown.room
    const m = Math.max(room.w, room.d)
    const start = new THREE.Vector3(m * 1.05, m * 0.95, m * 1.25)
    const lens = new THREE.Vector3(this.lens.x, this.lens.y, this.lens.z)
    const aim = new THREE.Vector3(...this.lens.aim)
    // orbit slowly while in overview
    const ang = (performance.now() - this.t0) / 1000 * 0.05 * (1 - e)
    start.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(ang) * 0.35)
    const pos = start.clone().lerp(lens, e)
    const tgt = new THREE.Vector3(0.2, 0.7, -0.6).lerp(aim, e)
    const cam = this.frameCam
    const lensFov = (2 * Math.atan(Math.tan(hfov(this.lens.focal) / 2) / (this.w / this.h)) * 180) / Math.PI
    cam.fov = 34 + (Math.max(lensFov, 18) - 34) * e
    cam.aspect = this.w / this.h
    cam.position.copy(pos)
    cam.lookAt(tgt)
    cam.updateProjectionMatrix()
    this.setWallsFor(pos, e < 0.75)
    this.cyc.visible = e < 0.9
    this.scene.background = this.bgSet
    this.lensComposer.userData.grade.uniforms.vignette.value = 0.4 + e * 0.5
    this.lensComposer.userData.grade.uniforms.grain.value = 0.03 + e * 0.03
    this.renderComposer(this.lensComposer, { x: 0, y: 0, w: this.w, h: this.h }, cam)
    if (this.ui.cones && e < 0.6) {
      this.helpers.children.forEach((c) => c.traverse((o) => { if (o.material?.uniforms?.strength) { o.material.uniforms.strength.value = o.material.userData.s0 ?? (o.material.userData.s0 = o.material.uniforms.strength.value); o.material.uniforms.strength.value = o.material.userData.s0 * (1 - e / 0.6) } }))
      this.grid.visible = false
      this.renderer.autoClear = false
      this.renderer.render(this.overlay, cam)
      this.renderer.autoClear = true
    }
  }

  emitLabels(rect) {
    if (!this.onLabels || !this.shown) return
    const out = []
    const v = new THREE.Vector3()
    const push = (kind, id, p) => {
      v.copy(p).project(this.setCam)
      if (v.z > 1) return
      out.push({ kind, id, x: rect.x + ((v.x + 1) / 2) * rect.w, y: rect.y + ((1 - v.y) / 2) * rect.h })
    }
    for (const a of this.shown.actors) push('actors', a.id, new THREE.Vector3(a.x, a.pose === 'stand' || a.pose === 'crossed' ? 1.9 : 1.45, a.z))
    for (const l of this.shown.lights) push('lights', l.id, new THREE.Vector3(l.x, l.y + 0.35, l.z))
    for (const c of this.shown.cameras) push('cameras', c.id, new THREE.Vector3(c.x, c.y + 0.25, c.z))
    const key = out.map((o) => `${o.id}${o.x | 0},${o.y | 0}`).join('|') + this.hoverId
    if (key === this.labelKey) return
    this.labelKey = key
    this.onLabels(out, this.hoverId)
  }

  // ---------------------------------------------------------------- stills
  async ready() {
    if (!this.shown) return
    const ids = [...new Set(this.shown.objects.map((o) => o.asset))]
    await Promise.all(ids.map((id) => loadAsset(id)))
    await Promise.all(this.shown.actors.map((a) => this.humanFor(a, this.seatHeightAt(this.shown, a))))
    // rebuild with everything loaded
    this.dynKey = null
    this.setScene(this.current, this.lastOpts)
    await new Promise((r) => setTimeout(r, 30))
  }

  // render the lens at a given size into a new canvas (for frames, thumbnails, references)
  snapshot(w, h, { grade = true } = {}) {
    if (!this.lens) return null
    const saveW = this.w, saveH = this.h
    const r = this.renderer
    const canvasSize = r.getSize(new THREE.Vector2())
    r.setPixelRatio(1)
    r.setSize(w, h, false)
    this.w = w; this.h = h
    this.instantLens = true
    this.snapping = true
    const rect = this.updateFrameCam({ x: 0, y: 0, w, h })
    this.snapping = false
    this.instantLens = false
    this.setWallsFor(this.frameCam.position, false)
    this.cyc.visible = false
    this.scene.background = new THREE.Color('#050505')
    const tc = this.tcHelper?.visible
    if (this.tcHelper) this.tcHelper.visible = false
    if (this.lensComposer.userData.grade) this.lensComposer.userData.grade.enabled = grade
    r.setScissorTest(false)
    sizeComposer(this.lensComposer, w, h)
    r.setViewport(0, 0, w, h)
    this.lensComposer.render()
    if (this.lensComposer.userData.grade) this.lensComposer.userData.grade.enabled = true
    const out = document.createElement('canvas')
    out.width = w; out.height = h
    out.getContext('2d').drawImage(r.domElement, 0, 0, w, h)
    if (this.tcHelper) this.tcHelper.visible = tc
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    r.setSize(canvasSize.x, canvasSize.y)
    this.w = saveW; this.h = saveH
    this.lastRectKey = null
    this.dirty = true
    if (this.mode !== 'still') this.render()
    return out
  }

  falseColor(w, h) {
    const src = this.snapshot(w, h, { grade: false })
    if (!src) return null
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(src, 0, 0)
    const img = g.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const Y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
      let col
      if (Y < 0.03) col = [86, 20, 128]
      else if (Y < 0.1) col = [36, 72, 200]
      else if (Y < 0.2) col = [52, 52, 52]
      else if (Y < 0.38) col = [110, 110, 110]
      else if (Y < 0.48) col = [72, 168, 88]
      else if (Y < 0.58) col = [180, 180, 180]
      else if (Y < 0.7) col = [236, 124, 160]
      else if (Y < 0.93) col = [220, 220, 220]
      else if (Y < 0.98) col = [244, 200, 40]
      else col = [232, 50, 40]
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]
    }
    g.putImageData(img, 0, 0)
    return c.toDataURL()
  }

  histogram(w = 240, h = 100) {
    const src = this.snapshot(w, h, { grade: false })
    if (!src) return null
    const d = src.getContext('2d').getImageData(0, 0, w, h).data
    const bins = new Array(64).fill(0)
    for (let i = 0; i < d.length; i += 4) bins[Math.min(63, Math.floor(((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 256) * 64))]++
    const mx = Math.max(...bins)
    return bins.map((b) => b / mx)
  }
}

function cloneSkinned(h) {
  return h // each build gets its own instance from the cache key; reuse is safe because one engine owns it
}

// ---------------------------------------------------------------- asset thumbnails
let thumbR = null
const thumbs = new Map()
export async function assetThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id)
  const a = getAsset(id)
  if (!a) return ''
  await loadAsset(id)
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    thumbR.setPixelRatio(1)
    thumbR.setSize(240, 180, false)
    thumbR.toneMapping = THREE.AgXToneMapping
    thumbR.outputColorSpace = THREE.SRGBColorSpace
  }
  const sc = new THREE.Scene()
  sc.environment = new THREE.PMREMGenerator(thumbR).fromScene(new RoomEnvironment(), 0.04).texture
  sc.environmentIntensity = 0.9
  const dl = new THREE.DirectionalLight('#ffe2c0', 3)
  dl.position.set(2, 4, 3)
  sc.add(dl)
  const g = instance(id, { h: 2.6 })
  g.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.emissiveIntensity > 3) { m.emissiveIntensity = 1 } }) } })
  sc.add(g)
  const box = new THREE.Box3().setFromObject(g)
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
  const rr = Math.max(size.x, size.y, size.z)
  const cam = new THREE.PerspectiveCamera(28, 240 / 180, 0.01, 50)
  cam.position.copy(center).add(new THREE.Vector3(1.1, 0.7, 1.5).multiplyScalar(rr * 1.4))
  cam.lookAt(center)
  thumbR.setClearColor(0x000000, 0)
  thumbR.render(sc, cam)
  const url = thumbR.domElement.toDataURL('image/png')
  thumbs.set(id, url)
  return url
}

// ---------------------------------------------------------------- shared still renderer
// One hidden engine renders thumbnails and reference frames for any scene.
let stillEngine = null
let stillQueue = Promise.resolve()
export function renderStill(scene, { w = 960, h, grade = true } = {}) {
  const aspect = ASPECTS[scene.aspect] || 2.39
  h = h || Math.round(w / aspect)
  stillQueue = stillQueue.then(async () => {
    if (!stillEngine) {
      const div = document.createElement('div')
      div.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:540px;pointer-events:none'
      document.body.appendChild(div)
      stillEngine = new SceneEngine(div, { mode: 'still' })
    }
    stillEngine.ui.cones = false
    stillEngine.lensPos = null
    stillEngine.setScene(scene, {})
    await stillEngine.ready()
    stillEngine.lensPos = null
    const c = stillEngine.snapshot(w, h, { grade })
    return c ? c.toDataURL('image/jpeg', 0.88) : null
  }).catch(() => null)
  return stillQueue
}
