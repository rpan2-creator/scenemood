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
