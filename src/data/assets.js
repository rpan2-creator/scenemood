import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Every asset is modeled procedurally so the library has no third-party licenses.
// A builder returns a THREE.Group whose origin is the floor-center of its footprint,
// front facing +Z. `size` is [width, depth, height] in meters, used for collision and plans.

const matCache = new Map()
function mat(color, rough = 0.85, metal = 0, extra = {}) {
  const key = color + rough + metal + JSON.stringify(extra)
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }))
  }
  return matCache.get(key)
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
const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2))
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s)

function legs(g, w, d, h, r, m, inset = 0.06) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, cyl(r, r * 0.8, h, 10), m, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset))
  }
}

const FABRIC = '#4d5641'
const FABRIC_2 = '#6b4b3e'
const OAK = '#9a6b45'
const WALNUT = '#5a3a26'
const BLACK = '#26282a'
const BRASS = '#a88850'
const CREAM = '#e9dfc9'
const LEAF = '#3f6a3a'

export const ASSETS = [
  {
    id: 'sofa', name: 'Three-seat sofa', cat: 'Seating', size: [2.2, 0.92, 0.85],
    build() {
      const g = new THREE.Group(), f = mat(FABRIC, 0.95)
      add(g, rbox(2.2, 0.22, 0.92, 0.05), f, 0, 0.3, 0)
      add(g, rbox(2.2, 0.55, 0.22, 0.06), f, 0, 0.6, -0.35)
      add(g, rbox(0.2, 0.36, 0.92, 0.06), f, -1.0, 0.55, 0)
      add(g, rbox(0.2, 0.36, 0.92, 0.06), f, 1.0, 0.55, 0)
      for (const x of [-0.6, 0, 0.6]) add(g, rbox(0.6, 0.14, 0.66, 0.05), mat('#566047', 0.95), x, 0.47, 0.08)
      legs(g, 2.1, 0.8, 0.19, 0.025, mat(WALNUT, 0.6))
      return g
    },
  },
  {
    id: 'armchair', name: 'Armchair', cat: 'Seating', size: [0.9, 0.85, 0.85],
    build() {
      const g = new THREE.Group(), f = mat(FABRIC_2, 0.95)
      add(g, rbox(0.9, 0.2, 0.85, 0.05), f, 0, 0.32, 0)
      add(g, rbox(0.9, 0.55, 0.18, 0.06), f, 0, 0.62, -0.33)
      add(g, rbox(0.16, 0.32, 0.85, 0.05), f, -0.37, 0.56, 0)
      add(g, rbox(0.16, 0.32, 0.85, 0.05), f, 0.37, 0.56, 0)
      add(g, rbox(0.56, 0.12, 0.6, 0.05), mat('#7a5848', 0.95), 0, 0.48, 0.06)
      legs(g, 0.8, 0.75, 0.22, 0.022, mat(WALNUT, 0.6))
      return g
    },
  },
  {
    id: 'dining_chair', name: 'Dining chair', cat: 'Seating', size: [0.46, 0.5, 0.9],
    build() {
      const g = new THREE.Group(), w = mat(OAK, 0.6)
      add(g, rbox(0.46, 0.05, 0.46, 0.015), w, 0, 0.46, 0)
      add(g, rbox(0.44, 0.38, 0.03, 0.012), w, 0, 0.72, -0.21)
      legs(g, 0.42, 0.42, 0.45, 0.018, w, 0.03)
      return g
    },
  },
  {
    id: 'office_chair', name: 'Office chair', cat: 'Seating', size: [0.6, 0.6, 1.05],
    build() {
      const g = new THREE.Group(), b = mat(BLACK, 0.7)
      add(g, rbox(0.5, 0.08, 0.48, 0.03), b, 0, 0.48, 0)
      add(g, rbox(0.46, 0.52, 0.06, 0.03), b, 0, 0.82, -0.22, -0.1)
      add(g, cyl(0.025, 0.025, 0.4), mat('#55585b', 0.4, 0.8), 0, 0.24, 0)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        add(g, box(0.3, 0.03, 0.04), b, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, 0, -a, 0)
      }
      return g
    },
  },
  {
    id: 'stool', name: 'Bar stool', cat: 'Seating', size: [0.38, 0.38, 0.75],
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.19, 0.19, 0.05), mat(WALNUT, 0.6), 0, 0.73, 0)
      legs(g, 0.3, 0.3, 0.71, 0.014, mat(BLACK, 0.4, 0.6), 0.02)
      return g
    },
  },
  {
    id: 'coffee_round', name: 'Round coffee table', cat: 'Tables', size: [1.0, 1.0, 0.45],
    build() {
      const g = new THREE.Group(), w = mat(OAK, 0.55)
      add(g, cyl(0.5, 0.5, 0.04, 40), w, 0, 0.43, 0)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        add(g, cyl(0.022, 0.018, 0.41, 8), w, Math.cos(a) * 0.33, 0.205, Math.sin(a) * 0.33)
      }
      add(g, box(0.75, 0.025, 0.04), w, 0, 0.12, 0, 0, Math.PI / 4)
      add(g, box(0.75, 0.025, 0.04), w, 0, 0.12, 0, 0, -Math.PI / 4)
      return g
    },
  },
  {
    id: 'side_table', name: 'Side table', cat: 'Tables', size: [0.45, 0.45, 0.55],
    build() {
      const g = new THREE.Group(), w = mat(WALNUT, 0.6)
      add(g, rbox(0.45, 0.04, 0.45, 0.01), w, 0, 0.53, 0)
      add(g, rbox(0.42, 0.02, 0.42, 0.01), w, 0, 0.2, 0)
      legs(g, 0.42, 0.42, 0.53, 0.016, w, 0.03)
      return g
    },
  },
  {
    id: 'dining_table', name: 'Dining table', cat: 'Tables', size: [1.6, 0.9, 0.75],
    build() {
      const g = new THREE.Group(), w = mat(OAK, 0.55)
      add(g, rbox(1.6, 0.05, 0.9, 0.015), w, 0, 0.73, 0)
      legs(g, 1.5, 0.8, 0.71, 0.03, w, 0.06)
      return g
    },
  },
  {
    id: 'desk', name: 'Work desk', cat: 'Tables', size: [1.4, 0.7, 0.75],
    build() {
      const g = new THREE.Group(), w = mat('#d2c7b4', 0.6)
      add(g, rbox(1.4, 0.04, 0.7, 0.01), w, 0, 0.74, 0)
      const m = mat(BLACK, 0.4, 0.6)
      for (const x of [-0.66, 0.66]) {
        add(g, box(0.04, 0.72, 0.04), m, x, 0.36, 0.3)
        add(g, box(0.04, 0.72, 0.04), m, x, 0.36, -0.3)
      }
      add(g, rbox(0.55, 0.34, 0.03, 0.01), mat('#121314', 0.3), 0, 1.0, -0.2)
      add(g, box(0.05, 0.12, 0.05), m, 0, 0.82, -0.22)
      return g
    },
  },
  {
    id: 'floor_lamp', name: 'Floor lamp', cat: 'Practicals', size: [0.42, 0.42, 1.6],
    practical: { cct: 2700, cd: 28, y: 1.45 },
    build() {
      const g = new THREE.Group(), m = mat(BRASS, 0.35, 0.8)
      add(g, cyl(0.15, 0.17, 0.03, 30), m, 0, 0.015, 0)
      add(g, cyl(0.012, 0.012, 1.35), m, 0, 0.7, 0)
      const shade = add(g, cyl(0.17, 0.21, 0.3, 32, 1), mat(CREAM, 0.9, 0, { emissive: '#ffb066', emissiveIntensity: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.96 }), 0, 1.45, 0)
      shade.castShadow = false
      shade.userData.practicalShade = true
      return g
    },
  },
  {
    id: 'table_lamp', name: 'Table lamp', cat: 'Practicals', size: [0.3, 0.3, 0.5],
    practical: { cct: 2700, cd: 16, y: 0.38 },
    build() {
      const g = new THREE.Group()
      add(g, new THREE.SphereGeometry(0.1, 24, 16), mat('#6d6a5f', 0.3, 0.1), 0, 0.12, 0)
      add(g, cyl(0.01, 0.01, 0.14), mat(BRASS, 0.3, 0.8), 0, 0.27, 0)
      const shade = add(g, cyl(0.1, 0.15, 0.2, 28, 1), mat(CREAM, 0.9, 0, { emissive: '#ffb066', emissiveIntensity: 0.9, side: THREE.DoubleSide }), 0, 0.39, 0)
      shade.castShadow = false
      shade.userData.practicalShade = true
      return g
    },
  },
  {
    id: 'pendant', name: 'Pendant lamp', cat: 'Practicals', size: [0.45, 0.45, 0.4], hang: true,
    practical: { cct: 2900, cd: 55, y: -0.85 },
    build(room) {
      const g = new THREE.Group()
      const top = room ? room.h : 2.6
      add(g, cyl(0.004, 0.004, 0.75), mat(BLACK, 0.5), 0, top - 0.375, 0)
      const shade = add(g, new THREE.ConeGeometry(0.24, 0.22, 32, 1, true), mat('#2f3a34', 0.6, 0.2, { side: THREE.DoubleSide }), 0, top - 0.85, 0)
      shade.castShadow = false
      const bulb = add(g, new THREE.SphereGeometry(0.05, 16, 12), mat('#fff3d6', 0.4, 0, { emissive: '#ffcf8a', emissiveIntensity: 2 }), 0, top - 0.93, 0)
      bulb.castShadow = false
      return g
    },
  },
  {
    id: 'bookshelf', name: 'Bookshelf', cat: 'Storage', size: [1.0, 0.35, 1.9],
    build() {
      const g = new THREE.Group(), w = mat(WALNUT, 0.7)
      add(g, box(0.03, 1.9, 0.35), w, -0.485, 0.95, 0)
      add(g, box(0.03, 1.9, 0.35), w, 0.485, 0.95, 0)
      add(g, box(1.0, 1.9, 0.02), w, 0, 0.95, -0.165)
      const cols = ['#7b3b2e', '#c2a370', '#3f5361', '#8f8a7a', '#5d6b45', '#b4593c', '#2f3335']
      for (let s = 0; s < 5; s++) {
        const y = 0.02 + s * 0.46
        add(g, box(0.94, 0.03, 0.33), w, 0, y, 0)
        if (s === 4) continue
        let x = -0.44
        let i = s * 3
        while (x < 0.36) {
          const bw = 0.03 + ((i * 37) % 5) * 0.012
          const bh = 0.24 + ((i * 53) % 7) * 0.02
          add(g, box(bw, bh, 0.24), mat(cols[i % cols.length], 0.9), x + bw / 2, y + 0.015 + bh / 2, 0.01)
          x += bw + 0.004
          i++
        }
      }
      return g
    },
  },
  {
    id: 'sideboard', name: 'Sideboard', cat: 'Storage', size: [1.6, 0.45, 0.8],
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.6, 0.62, 0.45, 0.015), mat(WALNUT, 0.6), 0, 0.49, 0)
      legs(g, 1.5, 0.4, 0.18, 0.02, mat(BLACK, 0.4, 0.6))
      add(g, cyl(0.07, 0.05, 0.22, 20), mat('#9fb3a6', 0.2, 0.1), -0.5, 0.91, 0)
      add(g, box(0.3, 0.05, 0.22), mat('#c9b48e', 0.9), 0.45, 0.825, 0)
      return g
    },
  },
  {
    id: 'dresser', name: 'Dresser', cat: 'Storage', size: [1.1, 0.5, 0.9],
    build() {
      const g = new THREE.Group(), w = mat('#8c6a4c', 0.6)
      add(g, rbox(1.1, 0.86, 0.5, 0.015), w, 0, 0.45, 0)
      for (let i = 0; i < 3; i++) add(g, box(0.1, 0.02, 0.02), mat(BRASS, 0.3, 0.8), 0, 0.2 + i * 0.26, 0.26)
      return g
    },
  },
  {
    id: 'bed', name: 'Double bed', cat: 'Bedroom', size: [1.6, 2.1, 1.0],
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.6, 0.3, 2.1, 0.03), mat('#3b3f3a', 0.9), 0, 0.15, 0)
      add(g, rbox(1.54, 0.2, 2.0, 0.08), mat('#e6e1d6', 0.95), 0, 0.4, 0.02)
      add(g, rbox(1.56, 0.06, 1.3, 0.04), mat('#5f6f7a', 0.95), 0, 0.51, 0.34)
      add(g, rbox(1.6, 1.0, 0.08, 0.03), mat('#3b3f3a', 0.9), 0, 0.5, -1.03)
      add(g, rbox(0.6, 0.14, 0.38, 0.07), mat('#f3efe6', 0.95), -0.38, 0.56, -0.75)
      add(g, rbox(0.6, 0.14, 0.38, 0.07), mat('#f3efe6', 0.95), 0.38, 0.56, -0.75)
      return g
    },
  },
  {
    id: 'rug', name: 'Area rug', cat: 'Soft', size: [2.4, 1.7, 0.02], flat: true,
    build() {
      const g = new THREE.Group()
      const r = add(g, rbox(2.4, 0.015, 1.7, 0.006), mat('#7a3e30', 1), 0, 0.008, 0)
      r.castShadow = false
      const b = add(g, rbox(2.2, 0.016, 1.5, 0.006), mat('#8e5a3f', 1), 0, 0.009, 0)
      b.castShadow = false
      return g
    },
  },
  {
    id: 'curtain', name: 'Curtain panel', cat: 'Soft', size: [1.2, 0.12, 2.4],
    build() {
      const g = new THREE.Group(), m = mat('#5e3b35', 1, 0, { side: THREE.DoubleSide })
      for (let i = 0; i < 8; i++) add(g, cyl(0.075, 0.075, 2.35, 10, 1), m, -0.525 + i * 0.15, 1.2, 0)
      add(g, cyl(0.012, 0.012, 1.3), mat(BLACK, 0.4, 0.6), 0, 2.4, 0, 0, 0, Math.PI / 2)
      return g
    },
  },
  {
    id: 'plant_tall', name: 'Fiddle-leaf plant', cat: 'Decor', size: [0.6, 0.6, 1.5],
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.17, 0.13, 0.32, 24), mat('#c6b9a3', 0.8), 0, 0.16, 0)
      add(g, cyl(0.015, 0.02, 1.0, 8), mat('#5a4330', 0.9), 0, 0.8, 0)
      const leaf = mat(LEAF, 0.7)
      for (let i = 0; i < 16; i++) {
        const a = i * 2.4, y = 0.6 + (i / 16) * 0.85, rr = 0.12 + 0.12 * Math.sin(i)
        const m = add(g, new THREE.SphereGeometry(0.11, 10, 8), leaf, Math.cos(a) * rr, y, Math.sin(a) * rr)
        m.scale.set(1, 0.35, 0.7)
        m.rotation.y = a
      }
      return g
    },
  },
  {
    id: 'plant_small', name: 'Small plant', cat: 'Decor', size: [0.3, 0.3, 0.45],
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.1, 0.08, 0.16, 20), mat('#a65c3a', 0.8), 0, 0.08, 0)
      const leaf = mat('#4b7a42', 0.7)
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4
        const m = add(g, new THREE.SphereGeometry(0.07, 8, 6), leaf, Math.cos(a) * 0.07, 0.22 + (i % 3) * 0.05, Math.sin(a) * 0.07)
        m.scale.set(1, 0.5, 0.6)
      }
      return g
    },
  },
  {
    id: 'wall_art', name: 'Framed print', cat: 'Decor', size: [0.9, 0.04, 0.65], wall: true, mountY: 1.55,
    build() {
      const g = new THREE.Group()
      add(g, box(0.9, 0.65, 0.035), mat(BLACK, 0.5), 0, 0, 0)
      add(g, box(0.8, 0.55, 0.01), mat('#d9cdb4', 0.9), 0, 0, 0.02)
      add(g, new THREE.CircleGeometry(0.16, 32), mat('#b4593c', 0.9), -0.12, 0.04, 0.026)
      add(g, box(0.5, 0.03, 0.002), mat('#2f3335', 0.9), 0.08, -0.17, 0.026)
      return g
    },
  },
  {
    id: 'mirror', name: 'Wall mirror', cat: 'Decor', size: [0.6, 0.04, 1.2], wall: true, mountY: 1.4,
    build() {
      const g = new THREE.Group()
      add(g, rbox(0.6, 1.2, 0.03, 0.01), mat(BRASS, 0.35, 0.8), 0, 0, 0)
      add(g, box(0.54, 1.14, 0.005), mat('#c9d2d6', 0.05, 1), 0, 0, 0.017)
      return g
    },
  },
  {
    id: 'tv', name: 'TV on stand', cat: 'Decor', size: [1.4, 0.4, 1.25],
    build() {
      const g = new THREE.Group()
      add(g, rbox(1.4, 0.45, 0.4, 0.015), mat(WALNUT, 0.6), 0, 0.225, 0)
      add(g, rbox(1.23, 0.7, 0.04, 0.008), mat('#0b0c0d', 0.25, 0.2), 0, 0.85, -0.05)
      add(g, box(0.25, 0.08, 0.04), mat(BLACK, 0.4), 0, 0.49, -0.05)
      return g
    },
  },
  {
    id: 'tabletop_props', name: 'Mug and bowl', cat: 'Decor', size: [0.4, 0.25, 0.12], onTable: true, tags: ['clutter'],
    build() {
      const g = new THREE.Group()
      add(g, cyl(0.045, 0.04, 0.1, 20), mat('#56605d', 0.6), -0.1, 0.05, 0)
      add(g, cyl(0.12, 0.06, 0.06, 28), mat(WALNUT, 0.5), 0.1, 0.03, 0.02)
      return g
    },
  },
]

export const ASSET_CATS = ['Seating', 'Tables', 'Practicals', 'Storage', 'Bedroom', 'Soft', 'Decor']
export const getAsset = (id) => ASSETS.find((a) => a.id === id)
