import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// The asset library. Hero pieces are photoreal glTF models (CC BY 4.0, credited in CREDITS).
// Everything else is modeled procedurally with PBR textures so the library has no unlicensed parts.
// Every asset's origin is the floor-center of its footprint, front facing +Z.
// `size` is [width, depth, height] in meters for plans, collisions and AI placement.

// ---------------------------------------------------------------- materials

const texLoader = new THREE.TextureLoader()
const texCache = new Map()
function tex(url, { repeat = [1, 1], srgb = true } = {}) {
  const key = url + repeat.join(',') + srgb
  if (!texCache.has(key)) {
    const t = texLoader.load(url)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(...repeat)
    t.anisotropy = 8
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    texCache.set(key, t)
  }
  return texCache.get(key)
}

function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

let _weave
function weaveNormal() {
  if (_weave) return _weave
  _weave = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(128,128,255)'
    g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
      const o = ((x + y) / 4) % 2
      g.fillStyle = o ? 'rgb(150,128,240)' : 'rgb(106,128,240)'
      g.fillRect(x, y, 4, 2)
      g.fillStyle = o ? 'rgb(128,150,240)' : 'rgb(128,106,240)'
      g.fillRect(x, y + 2, 4, 2)
    }
  }, { repeat: [10, 10], srgb: false })
  return _weave
}

const matCache = new Map()
export function material(kind, color) {
  const key = kind + color
  if (matCache.has(key)) return matCache.get(key)
  let m
  switch (kind) {
    case 'wood': {
      m = new THREE.MeshPhysicalMaterial({ color: color || '#ffffff', map: tex('tex/hardwood2_diffuse.jpg', { repeat: [0.6, 0.6] }), roughnessMap: tex('tex/hardwood2_roughness.jpg', { repeat: [0.6, 0.6], srgb: false }), bumpMap: tex('tex/hardwood2_bump.jpg', { repeat: [0.6, 0.6], srgb: false }), bumpScale: 0.6, roughness: 0.75, clearcoat: 0.25, clearcoatRoughness: 0.4 })
      break
    }
    case 'fabric':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25), normalMap: weaveNormal(), normalScale: new THREE.Vector2(0.35, 0.35) })
      break
    case 'metal':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 1 })
      break
    case 'paint':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.2 })
      break
    case 'ceramic':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8 })
      break
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transmission: 1, thickness: 0.02, ior: 1.5 })
      break
    case 'screen':
      m = new THREE.MeshPhysicalMaterial({ color: '#0a0b0c', roughness: 0.12, clearcoat: 1 })
      break
    case 'leaf':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, sheen: 0.4, side: THREE.DoubleSide })
      break
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  }
  matCache.set(key, m)
  return m
}

function add(g, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow = true
  mesh.receiveShadow = true
  g.add(mesh)
  return mesh
}
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2))
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s)
function legs(g, w, d, h, r, m, inset = 0.05) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(r, r * 0.75, h, 12), m, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset))
}

// emissive shade material for practicals, switched per instance
function shade(color = '#f3ead8') {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, transmission: 0.35, thickness: 0.01, emissive: '#ffb066', emissiveIntensity: 1, side: THREE.DoubleSide })
}

function artTexture(seed) {
  return canvasTex(512, 384, (g, w, h) => {
    const pal = [['#d9cdb4', '#b4593c', '#2f3335', '#7a8c84'], ['#e7e1d3', '#24425a', '#c59a52', '#3a3a3a'], ['#c8c2b4', '#5d6b45', '#9b3d2e', '#1f2224']][seed % 3]
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h)
    g.fillStyle = pal[1]; g.beginPath(); g.arc(w * 0.38, h * 0.48, h * 0.26, 0, Math.PI * 2); g.fill()
    g.fillStyle = pal[2]; g.fillRect(w * 0.55, h * 0.2, w * 0.08, h * 0.6)
    g.fillStyle = pal[3]; g.fillRect(w * 0.18, h * 0.78, w * 0.64, h * 0.03)
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2) }
  })
}

function rugTexture() {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#6e3a2c'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#c9a76e'; g.lineWidth = 10; g.strokeRect(24, 24, w - 48, h - 48)
    g.strokeStyle = '#2d3a44'; g.lineWidth = 6; g.strokeRect(44, 44, w - 88, h - 88)
    g.fillStyle = '#8a4b36'
    for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) { g.save(); g.translate(80 + i * 44, 80 + j * 46); g.rotate(Math.PI / 4); g.fillRect(-9, -9, 18, 18); g.restore() }
    for (let i = 0; i < 20000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 220 : 0},180,0.04)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 2) }
  })
}

// ---------------------------------------------------------------- the catalogue

const WALNUT = '#6a4a35'
const OAK = '#b08a63'
const BLACK = '#232527'
const BRASS = '#b0904f'

export const ASSETS = [
  // ---- seating
  { id: 'sofa', name: 'Velvet sofa', cat: 'Seating', size: [2.19, 1.02, 0.79], seat: 0.44, glb: 'models/GlamVelvetSofa.glb', fit: { w: 2.19 }, credit: 'Glam Velvet Sofa, Wayfair, CC BY 4.0' },
  { id: 'armchair', name: 'Velvet lounge chair', cat: 'Seating', size: [0.83, 0.75, 0.69], seat: 0.4, glb: 'models/SheenChair.glb', fit: { w: 0.83 }, credit: 'Sheen Chair, Wayfair, CC BY 4.0' },
  { id: 'accent_chair', name: 'Damask accent chair', cat: 'Seating', size: [0.83, 0.75, 0.69], seat: 0.4, glb: 'models/ChairDamaskPurplegold.glb', fit: { w: 0.83 }, credit: 'Chair Damask Purplegold, Wayfair, CC BY 4.0' },
  { id: 'pouf', name: 'Silk pouf', cat: 'Seating', size: [0.55, 0.55, 0.36], seat: 0.36, glb: 'models/SpecularSilkPouf.glb', fit: { w: 0.55 }, credit: 'Specular Silk Pouf, Wayfair, CC BY 4.0' },
  {
    id: 'dining_chair', name: 'Oak dining chair', cat: 'Seating', size: [0.46, 0.5, 0.9], seat: 0.46,
    build() {
      const g = new THREE.Group(), w = material('wood', OAK)
      add(g, rbox(0.46, 0.04, 0.46, 0.012), w, 0, 0.46, 0)
      for (let i = 0; i < 4; i++) add(g, rbox(0.04, 0.42, 0.03, 0.008), w, -0.16 + i * 0.107, 0.69, -0.21)
      add(g, rbox(0.44, 0.06, 0.035, 0.01), w, 0, 0.88, -0.21)
      legs(g, 0.42, 0.42, 0.45, 0.017, w, 0.03)
      return g
    },
  },
  {
    id: 'office_chair', name: 'Task chair', cat: 'Seating', size: [0.62, 0.62, 1.05], seat: 0.48,
    build() {
      const g = new THREE.Group(), b = material('fabric', '#2c3034'), m = material('metal', '#3c4044')
      add(g, rbox(0.5, 0.08, 0.48, 0.035), b, 0, 0.48, 0)
      add(g, rbox(0.46, 0.56, 0.07, 0.035), b, 0, 0.84, -0.22, -0.12)
      add(g, cyl(0.025, 0.025, 0.38), m, 0, 0.25, 0)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        add(g, rbox(0.3, 0.03, 0.045, 0.01), m, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, 0, -a, 0)
        add(g, new THREE.SphereGeometry(0.025, 12, 8), material('paint', BLACK), Math.cos(a) * 0.29, 0.025, Math.sin(a) * 0.29)
      }
      return g
    },
  },
  {
    id: 'stool', name: 'Bar stool', cat: 'Seating', size: [0.38, 0.38, 0.75], seat: 0.75,
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.19, 0.18, 0.045, 32), material('wood', WALNUT), 0, 0.73, 0)
      legs(g, 0.3, 0.3, 0.71, 0.012, material('metal', BLACK), 0.02)
      add(g, new THREE.TorusGeometry(0.15, 0.008, 8, 32), material('metal', BLACK), 0, 0.28, 0, Math.PI / 2)
      return g
    },
  },
  {
    id: 'bed', name: 'Double bed', cat: 'Seating', size: [1.6, 2.1, 1.0], seat: 0.55,
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.66, 0.3, 2.12, 0.03), material('fabric', '#4a4c46'), 0, 0.15, 0)
      add(g, rbox(1.56, 0.22, 2.0, 0.09), material('fabric', '#ece7dc'), 0, 0.41, 0.02)
      const duvet = add(g, rbox(1.62, 0.09, 1.36, 0.045), material('fabric', '#58697a'), 0, 0.54, 0.34)
      duvet.rotation.x = 0.01
      add(g, rbox(1.66, 1.05, 0.09, 0.04), material('fabric', '#4a4c46'), 0, 0.53, -1.04)
      add(g, rbox(0.62, 0.15, 0.4, 0.07), material('fabric', '#f2eee6'), -0.38, 0.58, -0.76, -0.25)
      add(g, rbox(0.62, 0.15, 0.4, 0.07), material('fabric', '#f2eee6'), 0.38, 0.58, -0.76, -0.25)
      return g
    },
  },

  // ---- tables
  {
    id: 'coffee_round', name: 'Round coffee table', cat: 'Tables', size: [1.0, 1.0, 0.45],
    build() {
      const g = new THREE.Group(), w = material('wood', OAK)
      add(g, cyl(0.5, 0.5, 0.04, 64), w, 0, 0.43, 0)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        add(g, cyl(0.022, 0.017, 0.41, 12), w, Math.cos(a) * 0.32, 0.205, Math.sin(a) * 0.32)
      }
      add(g, rbox(0.72, 0.025, 0.04, 0.008), w, 0, 0.12, 0, 0, Math.PI / 4)
      add(g, rbox(0.72, 0.025, 0.04, 0.008), w, 0, 0.12, 0, 0, -Math.PI / 4)
      return g
    },
  },
  {
    id: 'side_table', name: 'Side table', cat: 'Tables', size: [0.45, 0.45, 0.55],
    build() {
      const g = new THREE.Group(), w = material('wood', WALNUT)
      add(g, rbox(0.45, 0.035, 0.45, 0.01), w, 0, 0.535, 0)
      add(g, rbox(0.41, 0.02, 0.41, 0.006), w, 0, 0.2, 0)
      legs(g, 0.42, 0.42, 0.52, 0.015, w, 0.03)
      return g
    },
  },
  {
    id: 'dining_table', name: 'Dining table', cat: 'Tables', size: [1.6, 0.9, 0.75],
    build() {
      const g = new THREE.Group(), w = material('wood', OAK)
      add(g, rbox(1.6, 0.045, 0.9, 0.012), w, 0, 0.73, 0)
      add(g, rbox(1.4, 0.08, 0.7, 0.008), w, 0, 0.66, 0)
      legs(g, 1.48, 0.78, 0.7, 0.028, w, 0.05)
      return g
    },
  },
  {
    id: 'desk', name: 'Work desk', cat: 'Tables', size: [1.4, 0.7, 0.75],
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.4, 0.035, 0.7, 0.008), material('paint', '#d8d0c2'), 0, 0.74, 0)
      const m = material('metal', BLACK)
      for (const x of [-0.66, 0.66]) { add(g, box(0.04, 0.72, 0.04), m, x, 0.36, 0.3); add(g, box(0.04, 0.72, 0.04), m, x, 0.36, -0.3); add(g, box(0.04, 0.04, 0.64), m, x, 0.06, 0) }
      add(g, rbox(0.62, 0.38, 0.025, 0.008), material('screen'), 0, 1.02, -0.2)
      add(g, box(0.04, 0.14, 0.04), m, 0, 0.82, -0.22)
      add(g, rbox(0.22, 0.01, 0.16, 0.004), m, 0, 0.765, -0.22)
      return g
    },
  },
  {
    id: 'counter', name: 'Kitchen island', cat: 'Tables', size: [1.8, 0.8, 0.92],
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.8, 0.86, 0.75, 0.01), material('paint', '#3b4a45'), 0, 0.43, 0)
      add(g, rbox(1.86, 0.04, 0.82, 0.006), material('ceramic', '#e9e6df'), 0, 0.9, 0)
      for (let i = 0; i < 3; i++) add(g, box(0.18, 0.015, 0.015), material('metal', BRASS), -0.6 + i * 0.6, 0.72, 0.38)
      return g
    },
  },

  // ---- practicals (light sources that appear in frame)
  { id: 'floor_lamp', name: 'Arc floor lamp', cat: 'Practicals', size: [1.13, 0.72, 1.86], glb: 'models/LightsPunctualLamp.glb', fit: { h: 1.86 }, practical: { cct: 2700, cd: 28, y: 1.55 }, credit: 'Lights Punctual Lamp, Wayfair, CC BY 4.0' },
  {
    id: 'standing_lamp', name: 'Linen floor lamp', cat: 'Practicals', size: [0.42, 0.42, 1.6], practical: { cct: 2700, cd: 28, y: 1.45 },
    build() {
      const g = new THREE.Group(), m = material('metal', BRASS)
      add(g, cyl(0.15, 0.17, 0.025, 40), m, 0, 0.012, 0)
      add(g, cyl(0.011, 0.011, 1.36, 12), m, 0, 0.7, 0)
      const s = add(g, cyl(0.17, 0.21, 0.32, 48, 1), shade(), 0, 1.46, 0)
      s.castShadow = false; s.userData.practicalShade = true
      return g
    },
  },
  {
    id: 'table_lamp', name: 'Ceramic table lamp', cat: 'Practicals', size: [0.3, 0.3, 0.5], practical: { cct: 2700, cd: 16, y: 0.38 },
    build() {
      const g = new THREE.Group()
      add(g, new THREE.SphereGeometry(0.1, 32, 24), material('ceramic', '#6b7d74'), 0, 0.12, 0)
      add(g, cyl(0.009, 0.009, 0.14), material('metal', BRASS), 0, 0.27, 0)
      const s = add(g, cyl(0.1, 0.15, 0.2, 40, 1), shade(), 0, 0.39, 0)
      s.castShadow = false; s.userData.practicalShade = true
      return g
    },
  },
  { id: 'pendant', name: 'Barn pendant', cat: 'Practicals', size: [0.26, 0.26, 0.3], hang: true, glb: 'models/AnisotropyBarnLamp.glb', fit: { h: 0.3 }, practical: { cct: 2900, cd: 55, y: -0.95 }, credit: 'Anisotropy Barn Lamp, Wayfair, CC BY 4.0' },
  { id: 'candles', name: 'Hurricane candle', cat: 'Practicals', size: [0.2, 0.2, 0.26], onTable: true, glb: 'models/GlassHurricaneCandleHolder.glb', fit: { h: 0.26 }, practical: { cct: 1900, cd: 4, y: 0.14 }, credit: 'Glass Hurricane Candle Holder, Wayfair, CC BY 4.0' },

  // ---- storage
  {
    id: 'bookshelf', name: 'Bookshelf', cat: 'Storage', size: [1.0, 0.35, 1.9],
    build() {
      const g = new THREE.Group(), w = material('wood', WALNUT)
      add(g, box(0.03, 1.9, 0.35), w, -0.485, 0.95, 0)
      add(g, box(0.03, 1.9, 0.35), w, 0.485, 0.95, 0)
      add(g, box(1.0, 1.9, 0.02), w, 0, 0.95, -0.165)
      const cols = ['#7b3b2e', '#c2a370', '#3f5361', '#8f8a7a', '#5d6b45', '#b4593c', '#2f3335', '#d8d0bf']
      for (let s = 0; s < 5; s++) {
        const y = 0.02 + s * 0.46
        add(g, box(0.94, 0.03, 0.33), w, 0, y, 0)
        if (s === 4) continue
        let x = -0.44, i = s * 3
        while (x < 0.3 + (s % 2) * 0.08) {
          const bw = 0.025 + ((i * 37) % 5) * 0.011, bh = 0.22 + ((i * 53) % 7) * 0.02
          add(g, rbox(bw, bh, 0.22, 0.004), material('paint', cols[i % cols.length]), x + bw / 2, y + 0.015 + bh / 2, 0.02, 0, 0, i % 9 === 0 ? 0.12 : 0)
          x += bw + 0.003; i++
        }
      }
      return g
    },
  },
  {
    id: 'sideboard', name: 'Walnut sideboard', cat: 'Storage', size: [1.6, 0.45, 0.8],
    build() {
      const g = new THREE.Group(), w = material('wood', WALNUT)
      add(g, rbox(1.6, 0.6, 0.45, 0.012), w, 0, 0.5, 0)
      for (let i = 0; i < 4; i++) add(g, box(0.38, 0.54, 0.005), material('wood', '#7c5a42'), -0.6 + i * 0.4, 0.5, 0.226)
      legs(g, 1.5, 0.4, 0.2, 0.018, material('metal', BLACK))
      return g
    },
  },
  {
    id: 'dresser', name: 'Dresser', cat: 'Storage', size: [1.1, 0.5, 0.9],
    build() {
      const g = new THREE.Group(), w = material('wood', '#8c6a4c')
      add(g, rbox(1.1, 0.84, 0.5, 0.012), w, 0, 0.46, 0)
      for (let i = 0; i < 3; i++) { add(g, box(1.02, 0.24, 0.005), material('wood', '#9a7656'), 0, 0.2 + i * 0.27, 0.252); add(g, rbox(0.12, 0.018, 0.02, 0.006), material('metal', BRASS), 0, 0.2 + i * 0.27, 0.26) }
      return g
    },
  },
  {
    id: 'tv', name: 'TV on stand', cat: 'Storage', size: [1.4, 0.4, 1.25],
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.4, 0.45, 0.4, 0.012), material('wood', WALNUT), 0, 0.225, 0)
      add(g, rbox(1.23, 0.7, 0.03, 0.006), material('screen'), 0, 0.85, -0.05)
      add(g, box(0.25, 0.08, 0.04), material('metal', BLACK), 0, 0.49, -0.05)
      return g
    },
  },

  // ---- soft goods
  {
    id: 'rug', name: 'Wool rug', cat: 'Soft goods', size: [2.4, 1.7, 0.02], flat: true,
    build() {
      const g = new THREE.Group()
      const m = new THREE.MeshPhysicalMaterial({ map: rugTexture(), roughness: 1, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color('#d9b38c') })
      const r = add(g, rbox(2.4, 0.012, 1.7, 0.005), m, 0, 0.006, 0)
      r.castShadow = false
      return g
    },
  },
  {
    id: 'curtain', name: 'Linen curtain', cat: 'Soft goods', size: [1.3, 0.12, 2.5],
    build() {
      const g = new THREE.Group()
      const geo = new THREE.PlaneGeometry(1.3, 2.4, 60, 1)
      const p = geo.attributes.position
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.045)
      geo.computeVertexNormals()
      const m = new THREE.MeshPhysicalMaterial({ color: '#d9d1c2', roughness: 1, sheen: 1, transmission: 0.25, thickness: 0.01, side: THREE.DoubleSide })
      add(g, geo, m, 0, 1.22, 0)
      add(g, cyl(0.012, 0.012, 1.4), material('metal', BRASS), 0, 2.45, 0, 0, 0, Math.PI / 2)
      return g
    },
  },
  {
    id: 'cushion', name: 'Floor cushion', cat: 'Soft goods', size: [0.6, 0.6, 0.16],
    build() {
      const g = new THREE.Group()
      const m = add(g, new THREE.SphereGeometry(0.3, 32, 16), material('fabric', '#a5683f'), 0, 0.08, 0)
      m.scale.set(1, 0.26, 1)
      return g
    },
  },

  // ---- decor
  { id: 'plant_tall', name: 'Potted plant', cat: 'Decor', size: [0.7, 0.7, 1.0], glb: 'models/DiffuseTransmissionPlant.glb', fit: { h: 1.0 }, credit: 'Diffuse Transmission Plant, Wayfair, CC BY 4.0' },
  {
    id: 'plant_small', name: 'Small plant', cat: 'Decor', size: [0.3, 0.3, 0.45],
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.1, 0.08, 0.17, 32), material('ceramic', '#b56a45'), 0, 0.085, 0)
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, r = 0.03 + (i % 4) * 0.02
        const leaf = add(g, new THREE.SphereGeometry(0.06, 12, 8), material('leaf', '#3f6f3a'), Math.cos(a) * r, 0.22 + (i % 5) * 0.04, Math.sin(a) * r, 0.4, a, 0)
        leaf.scale.set(1, 0.18, 0.5)
      }
      return g
    },
  },
  { id: 'flowers', name: 'Vase with flowers', cat: 'Decor', size: [0.22, 0.22, 0.32], onTable: true, glb: 'models/GlassVaseFlowers.glb', fit: { h: 0.32 }, credit: 'Glass Vase Flowers, Wayfair, CC BY 4.0' },
  { id: 'tabletop_props', name: 'Coffee mug', cat: 'Decor', size: [0.12, 0.1, 0.1], onTable: true, tags: ['clutter'], glb: 'models/coffeeMug.glb', fit: { h: 0.1 }, credit: 'Coffee mug, three.js examples (MIT)' },
  {
    id: 'books', name: 'Stack of books', cat: 'Decor', size: [0.3, 0.22, 0.14], onTable: true, tags: ['clutter'],
    build() {
      const g = new THREE.Group()
      const cols = ['#24425a', '#c59a52', '#7b3b2e', '#e2dccd']
      for (let i = 0; i < 4; i++) add(g, rbox(0.28 - i * 0.02, 0.032, 0.21 - i * 0.01, 0.004), material('paint', cols[i]), 0, 0.016 + i * 0.033, 0, 0, i * 0.12, 0)
      return g
    },
  },
  {
    id: 'wine', name: 'Wine and glasses', cat: 'Decor', size: [0.3, 0.2, 0.32], onTable: true, tags: ['clutter'],
    build() {
      const g = new THREE.Group()
      const bottle = new THREE.LatheGeometry([[0, 0], [0.037, 0], [0.038, 0.2], [0.03, 0.24], [0.013, 0.27], [0.013, 0.31], [0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y)), 32)
      add(g, bottle, new THREE.MeshPhysicalMaterial({ color: '#1f3a28', roughness: 0.1, transmission: 0.6, thickness: 0.02 }), -0.08, 0, 0)
      const glass = new THREE.LatheGeometry([[0, 0], [0.035, 0], [0.004, 0.005], [0.004, 0.09], [0.038, 0.12], [0.042, 0.18]].map(([x, y]) => new THREE.Vector2(x, y)), 32)
      add(g, glass, material('glass', '#ffffff'), 0.05, 0, 0.03)
      add(g, glass, material('glass', '#ffffff'), 0.12, 0, -0.04)
      return g
    },
  },
  {
    id: 'laptop', name: 'Laptop', cat: 'Decor', size: [0.32, 0.22, 0.2], onTable: true, tags: ['clutter'],
    build() {
      const g = new THREE.Group(), m = material('metal', '#9a9ea3')
      add(g, rbox(0.32, 0.012, 0.22, 0.004), m, 0, 0.006, 0)
      const lid = add(g, rbox(0.32, 0.21, 0.008, 0.004), m, 0, 0.105, -0.11, -0.2)
      const scr = add(g, new THREE.PlaneGeometry(0.29, 0.18), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#9ec3ff', emissiveIntensity: 1 }), 0, 0.105, -0.1, -0.2)
      scr.userData.screen = true
      return g
    },
  },
  {
    id: 'wall_art', name: 'Framed print', cat: 'Decor', size: [0.9, 0.04, 0.65], wall: true, mountY: 1.55,
    build(room, seed = 0) {
      const g = new THREE.Group()
      add(g, rbox(0.9, 0.65, 0.035, 0.006), material('paint', BLACK), 0, 0, 0)
      add(g, new THREE.PlaneGeometry(0.8, 0.55), new THREE.MeshStandardMaterial({ map: artTexture(seed), roughness: 0.9 }), 0, 0, 0.019)
      return g
    },
  },
  {
    id: 'mirror', name: 'Wall mirror', cat: 'Decor', size: [0.6, 0.04, 1.2], wall: true, mountY: 1.4,
    build() {
      const g = new THREE.Group()
      add(g, rbox(0.6, 1.2, 0.03, 0.01), material('metal', BRASS), 0, 0, 0)
      add(g, box(0.54, 1.14, 0.005), new THREE.MeshPhysicalMaterial({ color: '#c9d2d6', roughness: 0.03, metalness: 1 }), 0, 0, 0.017)
      return g
    },
  },
  {
    id: 'clock', name: 'Wall clock', cat: 'Decor', size: [0.36, 0.04, 0.36], wall: true, mountY: 1.95,
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.18, 0.18, 0.035, 48), material('paint', '#e9e4d8'), 0, 0, 0, Math.PI / 2)
      add(g, new THREE.TorusGeometry(0.18, 0.012, 12, 48), material('metal', BLACK), 0, 0, 0.005)
      add(g, box(0.01, 0.12, 0.004), material('paint', BLACK), 0, 0.05, 0.022)
      add(g, box(0.09, 0.008, 0.004), material('paint', BLACK), 0.04, 0, 0.022, 0, 0, 0.5)
      return g
    },
  },
]


// ---------------------------------------------------------------- exterior and set pieces
// Locations aren't always rooms: streets, fields, trenches. These are built procedurally too.

function noiseTex(base, specks, { repeat = [1, 1], size = 512, streaks = 0 } = {}) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h)
    for (let i = 0; i < w * h / 6; i++) { const c = specks[(Math.random() * specks.length) | 0]; g.fillStyle = c; g.globalAlpha = Math.random() * 0.35; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2) }
    g.globalAlpha = 1
    for (let i = 0; i < streaks; i++) { g.strokeStyle = specks[i % specks.length]; g.globalAlpha = 0.08; g.lineWidth = 2 + Math.random() * 6; g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke() }
    g.globalAlpha = 1
  }, { repeat })
}
const extMat = new Map()
function ext(kind) {
  if (extMat.has(kind)) return extMat.get(kind)
  let m
  if (kind === 'rust') m = new THREE.MeshPhysicalMaterial({ map: noiseTex('#5a3a26', ['#2b1c12', '#8a5a34', '#3d2a1f'], { repeat: [1, 1] }), roughness: 0.85, metalness: 0.4 })
  else if (kind === 'canvas') m = new THREE.MeshPhysicalMaterial({ map: noiseTex('#5a5a3c', ['#3f3f28', '#6d6b48'], { repeat: [2, 2] }), roughness: 0.95, sheen: 0.3, side: THREE.DoubleSide })
  else if (kind === 'burlap') m = new THREE.MeshPhysicalMaterial({ map: noiseTex('#8a7a58', ['#6a5c40', '#a39270', '#5a4d35'], { repeat: [1, 1] }), roughness: 1, normalMap: weaveNormal(), normalScale: new THREE.Vector2(0.6, 0.6) })
  else if (kind === 'stone') m = new THREE.MeshPhysicalMaterial({ map: noiseTex('#6f6c66', ['#4a4844', '#8d8a83', '#5d5a54']), roughness: 0.95 })
  else if (kind === 'bark') m = new THREE.MeshPhysicalMaterial({ map: noiseTex('#4b3a2c', ['#2e231a', '#6a5240'], { streaks: 40 }), roughness: 1 })
  else if (kind === 'foliage') m = new THREE.MeshPhysicalMaterial({ map: noiseTex('#3d5a2c', ['#2a4020', '#557a3a', '#6f8f45']), roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color('#9fbf6a') })
  else if (kind === 'brick') m = new THREE.MeshPhysicalMaterial({ map: tex('tex/brick_diffuse.jpg', { repeat: [1.5, 1] }), bumpMap: tex('tex/brick_bump.jpg', { repeat: [1.5, 1], srgb: false }), bumpScale: 0.8, roughness: 0.92 })
  else if (kind === 'carpaint') m = new THREE.MeshPhysicalMaterial({ color: '#5b6670', roughness: 0.35, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.15 })
  else if (kind === 'tire') m = new THREE.MeshPhysicalMaterial({ color: '#141414', roughness: 0.9 })
  else if (kind === 'darkglass') m = new THREE.MeshPhysicalMaterial({ color: '#10151a', roughness: 0.05, metalness: 0.2, clearcoat: 1 })
  else if (kind === 'fire') m = new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.9 })
  else if (kind === 'crate') m = new THREE.MeshPhysicalMaterial({ map: tex('tex/hardwood2_diffuse.jpg', { repeat: [0.5, 0.5] }), color: '#9a8566', roughness: 0.9 })
  extMat.set(kind, m)
  return m
}

ASSETS.push(
  {
    id: 'car', name: 'Sedan', cat: 'Set pieces', size: [1.85, 4.5, 1.45], exterior: true,
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.82, 0.62, 4.45, 0.18), ext('carpaint'), 0, 0.62, 0)
      add(g, rbox(1.6, 0.55, 2.3, 0.2), ext('carpaint'), 0, 1.15, -0.25)
      add(g, rbox(1.62, 0.42, 2.2, 0.16), ext('darkglass'), 0, 1.16, -0.25)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(0.33, 0.33, 0.24, 28), ext('tire'), sx * 0.82, 0.33, sz * 1.42, 0, 0, Math.PI / 2)
      const head = new THREE.MeshPhysicalMaterial({ color: '#fff6e0', emissive: '#fff3d0', emissiveIntensity: 0.4 })
      for (const sx of [-1, 1]) add(g, rbox(0.32, 0.1, 0.05, 0.03), head, sx * 0.62, 0.72, 2.23)
      const tail = new THREE.MeshPhysicalMaterial({ color: '#5a0d0d', emissive: '#7a1010', emissiveIntensity: 0.5 })
      for (const sx of [-1, 1]) add(g, rbox(0.3, 0.1, 0.05, 0.03), tail, sx * 0.62, 0.78, -2.23)
      return g
    },
  },
  {
    id: 'streetlight', name: 'Street light', cat: 'Set pieces', size: [0.5, 0.5, 4.6], exterior: true, practical: { cct: 2100, cd: 420, y: 4.35 },
    build() {
      const g = new THREE.Group(), m = material('metal', '#3b3e42')
      add(g, cyl(0.06, 0.09, 4.5, 16), m, 0, 2.25, 0)
      add(g, cyl(0.035, 0.035, 0.7, 12), m, 0, 4.45, 0.3, Math.PI / 2)
      add(g, rbox(0.42, 0.12, 0.26, 0.04), m, 0, 4.45, 0.68)
      const s = add(g, rbox(0.36, 0.04, 0.2, 0.02), shade('#ffe1a8'), 0, 4.38, 0.68)
      s.castShadow = false; s.userData.practicalShade = true
      return g
    },
  },
  {
    id: 'bench', name: 'Park bench', cat: 'Set pieces', size: [1.6, 0.6, 0.85], seat: 0.45, exterior: true,
    build() {
      const g = new THREE.Group(), w = material('wood', '#8a6a4a'), m = material('metal', '#2a2c2f')
      for (let i = 0; i < 4; i++) add(g, rbox(1.6, 0.035, 0.11, 0.01), w, 0, 0.44, -0.2 + i * 0.13)
      for (let i = 0; i < 3; i++) add(g, rbox(1.6, 0.11, 0.035, 0.01), w, 0, 0.6 + i * 0.13, -0.27, -0.15)
      for (const sx of [-0.7, 0.7]) { add(g, box(0.05, 0.44, 0.5), m, sx, 0.22, 0); add(g, box(0.05, 0.4, 0.05), m, sx, 0.68, -0.28, -0.15) }
      return g
    },
  },
  {
    id: 'sandbags', name: 'Sandbag wall', cat: 'Set pieces', size: [2.4, 0.6, 0.6], exterior: true,
    build() {
      const g = new THREE.Group(), m = ext('burlap')
      for (let row = 0; row < 4; row++) for (let i = 0; i < 4 + (row % 2 ? 0 : 1); i++) {
        const x = -1.1 + i * 0.55 + (row % 2 ? 0.27 : 0)
        if (x > 1.15) continue
        add(g, rbox(0.54, 0.15, 0.32, 0.07), m, x, 0.08 + row * 0.14, (row % 2 ? 0.06 : -0.06), 0, (Math.random() - 0.5) * 0.12)
      }
      return g
    },
  },
  {
    id: 'barbed_wire', name: 'Barbed wire', cat: 'Set pieces', size: [3, 0.7, 0.9], exterior: true,
    build() {
      const g = new THREE.Group(), m = material('metal', '#55524c'), post = ext('bark')
      for (const x of [-1.4, 0, 1.4]) add(g, cyl(0.035, 0.04, 1.0, 8), post, x, 0.5, 0, 0.12)
      for (let i = 0; i < 26; i++) add(g, new THREE.TorusGeometry(0.33, 0.006, 4, 24), m, -1.5 + i * 0.12, 0.42, 0, 0, Math.PI / 2 + 0.25, 0)
      return g
    },
  },
  {
    id: 'crater', name: 'Shell crater', cat: 'Set pieces', size: [3, 3, 0.25], flat: true, exterior: true,
    build() {
      const g = new THREE.Group()
      const rim = add(g, new THREE.TorusGeometry(1.15, 0.32, 10, 40), ext('stone'), 0, 0.02, 0, Math.PI / 2)
      rim.scale.z = 0.35
      add(g, cyl(1.0, 1.0, 0.02, 40), new THREE.MeshPhysicalMaterial({ color: '#2b241d', roughness: 1 }), 0, 0.005, 0)
      return g
    },
  },
  {
    id: 'ruin_wall', name: 'Ruined brick wall', cat: 'Set pieces', size: [3, 0.35, 2.4], exterior: true,
    build() {
      const g = new THREE.Group(), m = ext('brick')
      const cols = [2.4, 2.1, 1.6, 1.9, 1.2, 0.7]
      cols.forEach((h, i) => add(g, box(0.5, h, 0.32), m, -1.25 + i * 0.5, h / 2, 0))
      for (let i = 0; i < 7; i++) add(g, rbox(0.22, 0.1, 0.12, 0.02), m, -1 + Math.random() * 2.6, 0.05, 0.3 + Math.random() * 0.4, 0, Math.random() * 3)
      return g
    },
  },
  {
    id: 'barrel_fire', name: 'Barrel fire', cat: 'Set pieces', size: [0.6, 0.6, 1.1], exterior: true, practical: { cct: 1800, cd: 90, y: 1.05 },
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.29, 0.29, 0.9, 28), ext('rust'), 0, 0.45, 0)
      for (const y of [0.15, 0.45, 0.75]) add(g, new THREE.TorusGeometry(0.295, 0.012, 6, 28), ext('rust'), 0, y, 0, Math.PI / 2)
      for (let i = 0; i < 5; i++) { const f = add(g, new THREE.ConeGeometry(0.08 + Math.random() * 0.06, 0.3 + Math.random() * 0.25, 8), shade('#ffb15c'), (Math.random() - 0.5) * 0.25, 1.0, (Math.random() - 0.5) * 0.25); f.castShadow = false; f.userData.practicalShade = true }
      return g
    },
  },
  {
    id: 'campfire', name: 'Campfire', cat: 'Set pieces', size: [0.9, 0.9, 0.5], exterior: true, practical: { cct: 1800, cd: 70, y: 0.35 },
    build() {
      const g = new THREE.Group()
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; add(g, new THREE.DodecahedronGeometry(0.1, 0), ext('stone'), Math.cos(a) * 0.38, 0.06, Math.sin(a) * 0.38) }
      for (let i = 0; i < 4; i++) add(g, cyl(0.04, 0.05, 0.6, 8), ext('bark'), 0, 0.12, 0, 1.2, (i / 4) * Math.PI, 0)
      for (let i = 0; i < 5; i++) { const f = add(g, new THREE.ConeGeometry(0.07 + Math.random() * 0.05, 0.25 + Math.random() * 0.2, 8), shade('#ffb15c'), (Math.random() - 0.5) * 0.2, 0.3, (Math.random() - 0.5) * 0.2); f.castShadow = false; f.userData.practicalShade = true }
      return g
    },
  },
  {
    id: 'tree', name: 'Tree', cat: 'Set pieces', size: [2.6, 2.6, 5.5], exterior: true,
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.12, 0.2, 3.0, 12), ext('bark'), 0, 1.5, 0)
      const f = ext('foliage')
      ;[[0, 3.6, 0, 1.3], [0.6, 3.2, 0.3, 0.9], [-0.6, 3.3, -0.2, 0.95], [0.1, 4.4, -0.1, 0.9], [-0.2, 3.0, 0.6, 0.8]].forEach(([x, y, z, r]) => add(g, new THREE.IcosahedronGeometry(r, 1), f, x, y, z))
      return g
    },
  },
  {
    id: 'rock', name: 'Boulder', cat: 'Set pieces', size: [1.2, 1.0, 0.7], exterior: true,
    build() {
      const g = new THREE.Group()
      const r = add(g, new THREE.DodecahedronGeometry(0.55, 1), ext('stone'), 0, 0.3, 0)
      r.scale.set(1.1, 0.65, 0.9)
      return g
    },
  },
  {
    id: 'crate', name: 'Wooden crate', cat: 'Set pieces', size: [0.8, 0.8, 0.8], seat: 0.8, exterior: true,
    build() {
      const g = new THREE.Group(), m = ext('crate')
      add(g, rbox(0.8, 0.8, 0.8, 0.02), m, 0, 0.4, 0)
      for (const y of [0.1, 0.7]) add(g, box(0.82, 0.08, 0.82), material('wood', '#6d5538'), 0, y, 0)
      return g
    },
  },
  {
    id: 'tent', name: 'Army tent', cat: 'Set pieces', size: [2.4, 3.0, 1.8], exterior: true,
    build() {
      const g = new THREE.Group()
      const shape = new THREE.Shape([new THREE.Vector2(-1.2, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(0, 1.8)])
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false })
      geo.translate(0, 0, -1.5)
      add(g, geo, ext('canvas'), 0, 0, 0)
      return g
    },
  },
  {
    id: 'fence', name: 'Wooden fence', cat: 'Set pieces', size: [3, 0.1, 1.2], exterior: true,
    build() {
      const g = new THREE.Group(), w = material('wood', '#7a6650')
      for (let i = 0; i < 4; i++) add(g, box(0.09, 1.2, 0.09), w, -1.4 + i * 0.93, 0.6, 0)
      for (const y of [0.35, 0.9]) add(g, box(3, 0.12, 0.04), w, 0, y, 0.05)
      return g
    },
  },
)

export const ASSET_CATS = ['Seating', 'Tables', 'Practicals', 'Storage', 'Soft goods', 'Decor', 'Set pieces']
export const getAsset = (id) => ASSETS.find((a) => a.id === id)
export const CREDITS = [...new Set(ASSETS.filter((a) => a.credit).map((a) => a.credit))]

// ---------------------------------------------------------------- loading and instancing

const gltfLoader = new GLTFLoader()
const protos = new Map()
const pending = new Map()
const listeners = new Set()
export const onAssetLoaded = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

function fitGlb(root, a) {
  // strip embedded lights; the engine owns every light in the scene
  const lights = []
  root.traverse((o) => { if (o.isLight) lights.push(o) })
  lights.forEach((l) => l.parent?.remove(l))
  root.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(root)
  const size = b.getSize(new THREE.Vector3())
  let s = 1
  if (a.fit?.w) s = a.fit.w / size.x
  if (a.fit?.h) s = a.fit.h / size.y
  const g = new THREE.Group()
  root.scale.multiplyScalar(s)
  root.updateMatrixWorld(true)
  const b2 = new THREE.Box3().setFromObject(root)
  const c = b2.getCenter(new THREE.Vector3())
  root.position.x -= c.x
  root.position.z -= c.z
  root.position.y -= b2.min.y
  g.add(root)
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        // treat emissive or translucent shade parts as the practical's glowing element
        if (a.practical && (m.emissive?.getHex() || m.transmission > 0.2 || /shade|glass|filament|bulb/i.test(m.name))) o.userData.practicalShade = true
      }
    }
  })
  return g
}

export function loadAsset(id) {
  const a = getAsset(id)
  if (!a) return Promise.resolve(null)
  if (protos.has(id)) return Promise.resolve(protos.get(id))
  if (pending.has(id)) return pending.get(id)
  let p
  if (a.glb) {
    p = gltfLoader.loadAsync(a.glb).then((gl) => fitGlb(gl.scene, a)).catch(() => a.build ? a.build() : placeholder(a))
  } else {
    p = Promise.resolve(a.build())
  }
  p = p.then((g) => { protos.set(id, g); pending.delete(id); listeners.forEach((l) => l(id)); return g })
  pending.set(id, p)
  return p
}

function placeholder(a) {
  const g = new THREE.Group()
  const [w, d, h] = a.size
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: '#3a3f3c', roughness: 1, transparent: true, opacity: 0.5 }))
  m.position.y = h / 2
  g.add(m)
  return g
}

// Synchronous instance: the real model when loaded, a translucent footprint box until then.
export function instance(id, room) {
  const a = getAsset(id)
  if (!a) return new THREE.Group()
  const p = protos.get(id)
  if (!p) { loadAsset(id); const ph = placeholder(a); ph.userData.placeholder = true; return ph }
  const inst = p.clone(true)
  inst.traverse((o) => { if (o.isMesh && o.userData.practicalShade) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone() })
  if (a.hang && room) {
    // cord from the ceiling
    const top = room.h
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1), new THREE.MeshStandardMaterial({ color: '#1a1a1a' }))
    const shadeTop = top + a.practical.y + a.size[2]
    cord.scale.y = Math.max(0.05, top - shadeTop)
    cord.position.y = shadeTop + cord.scale.y / 2
    const g = new THREE.Group()
    inst.position.y = top + a.practical.y
    g.add(inst, cord)
    return g
  }
  return inst
}

export function preloadAll() { return Promise.all(ASSETS.map((a) => loadAsset(a.id))) }
