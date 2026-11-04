// Turns the 3D plan into a shooting storyboard: one panel per camera setup, in the order a crew
// would shoot them, with what has to change on set between one setup and the next.
import { inFrame } from '../engine/checks.js'
import { FIXTURES } from '../data/gear.js'

export const POSE_LABEL = { sit: 'seated', hunched: 'seated, leaning in', turned: 'seated, turned away', stand: 'standing', crossed: 'standing, arms crossed' }

const aspectOf = (a) => (a === '16:9' ? 16 / 9 : +a || 2.39)
const yaw = (c) => Math.atan2(c.aim[0] - c.x, c.aim[2] - c.z)
const angleDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d }

export function shotSize(c) {
  const d = Math.hypot(c.aim[0] - c.x, c.aim[1] - c.y, c.aim[2] - c.z)
  const k = d * 50 / Math.max(10, c.focal)
  return k > 5 ? 'Wide' : k > 2.6 ? 'Medium' : k > 1.5 ? 'Medium close-up' : 'Close-up'
}

// Order setups the way crews do: finish everything facing one way before turning around,
// widest first in each direction so the full set is dressed and every light is hidden once.
export function shootingOrder(cameras) {
  if (!cameras.length) return []
  const ref = yaw(cameras[0])
  const sides = [[], []]
  for (const c of cameras) sides[angleDiff(yaw(c), ref) > Math.PI / 2 ? 1 : 0].push(c)
  sides.forEach((s) => s.sort((a, b) => a.focal - b.focal))
  if (sides[1].length > sides[0].length) sides.reverse()
  return [...sides[0], ...sides[1]]
}

export function lightsInFrame(scene, cam) {
  const aspect = aspectOf(scene.aspect)
  return scene.lights.filter((l) => l.on !== false && (inFrame(cam, aspect, [l.x, l.y, l.z], 1.02) || inFrame(cam, aspect, [l.x, l.y * 0.5, l.z], 1.02) || inFrame(cam, aspect, [l.x, 0.1, l.z], 1.02)))
}

const lightName = (l) => l.label || ({ key: 'Key', fill: 'Fill', edge: 'Edge', back: 'Back light', practical: 'Practical' }[l.role] || 'Light')

export function storyboard(scene, sceneNum = 1) {
  const order = shootingOrder(scene.cameras || [])
  let prev = null
  return order.map((c, i) => {
    const code = `${sceneNum}${String.fromCharCode(65 + i)}`
    const action = scene.actors.map((a) => `${a.name} ${POSE_LABEL[a.pose] || a.pose}`).join('; ')
    const lighting = scene.lights.filter((l) => l.on !== false).map((l) => `${lightName(l)}: ${FIXTURES[l.fixture]?.name || l.fixture}, ${Math.round(l.intensity * 100)}%, ${l.cct}K`)
    const visible = lightsInFrame(scene, c)
    const changes = []
    if (!prev) {
      changes.push('First setup: dress the full set and place every light.')
    } else {
      const turn = angleDiff(yaw(c), yaw(prev)) > Math.PI / 2
      const moved = Math.hypot(c.x - prev.x, c.z - prev.z)
      if (turn) changes.push('Turnaround: the camera now faces the other way. Re-dress what this side sees and move lights out of the new frame.')
      if (moved > 0.2) changes.push(`Move the camera ${moved.toFixed(1)} m${Math.abs(c.y - prev.y) > 0.1 ? `, ${c.y > prev.y ? 'up' : 'down'} to ${c.y.toFixed(2)} m` : ''}.`)
      else if (Math.abs(c.y - prev.y) > 0.1) changes.push(`Change the camera height to ${c.y.toFixed(2)} m.`)
      if (c.focal !== prev.focal) changes.push(`Lens change: ${prev.focal} mm to ${c.focal} mm.`)
      if (!turn) changes.push('Lighting stays as it is.')
    }
    if (visible.length) changes.push(`In frame: ${visible.map(lightName).join(', ')}. Move ${visible.length > 1 ? 'them' : 'it'} or flag ${visible.length > 1 ? 'them' : 'it'} before rolling.`)
    prev = c
    return { id: c.id, code, cam: c.label, size: shotSize(c), shot: c.shot, focal: c.focal, height: c.y, action, lighting, changes, inFrame: visible.map((l) => l.id) }
  })
}

// Coverage presets for adding shots straight from the storyboard. Every new camera stays on the
// same side of the eyeline as the first camera (the 180° rule) and is then framed on its subjects.
export const COVERAGE = [
  { id: 'master', label: 'Wide master', focal: 24, needs: 0 },
  { id: 'ots', label: 'Over the shoulder', focal: 40, needs: 1 },
  { id: 'single', label: 'Single', focal: 50, needs: 1 },
  { id: 'close', label: 'Close-up', focal: 85, needs: 1 },
]
export function coverageCamera(scene, kind, subjectId, label, frame = (c) => c) {
  const actors = scene.actors
  const A = actors.find((a) => a.id === subjectId) || actors[0]
  const B = actors.find((a) => a.id !== A?.id) || A
  if (!A) return null
  const mid = [(A.x + B.x) / 2, (A.z + B.z) / 2]
  let ax = B.x - A.x, az = B.z - A.z
  const L = Math.hypot(ax, az) || 1; ax /= L; az /= L
  // the side of the eyeline the coverage lives on
  const first = scene.cameras[0]
  let nx = -az, nz = ax
  if (first && ((first.x - mid[0]) * nx + (first.z - mid[1]) * nz) < 0) { nx = -nx; nz = -nz }
  if (!first && nz < 0) { nx = -nx; nz = -nz }
  const spec = COVERAGE.find((c) => c.id === kind) || COVERAGE[0]
  let x, z, y = 1.4, subj, shot
  if (kind === 'master') { x = mid[0] + nx * 3.2; z = mid[1] + nz * 3.2; subj = actors.map((a) => a.id); shot = 'Wide master' }
  else if (kind === 'ots') { x = B.x + ax * 0.55 + nx * 0.45; z = B.z + az * 0.55 + nz * 0.45; y = 1.45; subj = [A.id, B.id]; shot = `Over ${B.name}'s shoulder on ${A.name}` }
  else if (kind === 'close') { x = A.x + ax * 1.3 + nx * 0.55; z = A.z + az * 1.3 + nz * 0.55; y = 1.3; subj = [A.id]; shot = `Close-up on ${A.name}` }
  else { x = A.x + ax * 1.9 + nx * 0.8; z = A.z + az * 1.9 + nz * 0.8; y = 1.35; subj = [A.id]; shot = `Single on ${A.name}` }
  const cam = { id: `cam_${Math.random().toString(36).slice(2, 8)}`, label, x: +x.toFixed(2), y, z: +z.toFixed(2), aim: [A.x, 1.2, A.z], focal: spec.focal, shot, subj, source: 'user' }
  return frame(cam, scene)
}
