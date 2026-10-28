import { FIXTURES } from '../data/gear.js'
import { getAsset } from '../data/assets.js'
import { wallFrame } from '../data/rooms.js'

// Deterministic feasibility checks. These run in code, never in the model:
// every AI proposal must pass them before it reaches the crew.

export const SENSOR_W = 24.89 // Super 35, mm
export const ASPECTS = { '2.39': 2.39, '1.85': 1.85, '16:9': 16 / 9 }

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

export function hfov(focal) { return 2 * Math.atan(SENSOR_W / (2 * focal)) }

export function faceHeight(actor) {
  const standing = actor.pose === 'stand' || actor.pose === 'crossed'
  const tall = actor.id === 'actor_a' ? 0.06 : 0
  if (standing) return 1.6 + tall
  return (actor.pose === 'hunched' ? 1.0 : 1.12) + tall * 0.6
}
export const actorFace = (a) => [a.x, faceHeight(a), a.z]

export function projectToCamera(cam, aspect, p) {
  const pos = [cam.x, cam.y, cam.z]
  const f = norm(sub(cam.aim, pos))
  const r = norm(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const v = sub(p, pos)
  const zc = dot(v, f)
  if (zc < 0.15) return null
  const th = Math.tan(hfov(cam.focal) / 2)
  const tv = th / aspect
  return { x: dot(v, r) / (zc * th), y: dot(v, u) / (zc * tv), depth: zc }
}

export function inFrame(cam, aspect, p, margin = 0.98) {
  const q = projectToCamera(cam, aspect, p)
  return !!q && Math.abs(q.x) <= margin && Math.abs(q.y) <= margin
}

// distance from point p to the lens line of a camera (between lens and subject)
export function lensBlock(cam, p) {
  const a = [cam.x, cam.y, cam.z], b = cam.aim
  const ab = sub(b, a), ap = sub(p, a)
  const t = dot(ap, ab) / Math.max(1e-6, dot(ab, ab))
  if (t < 0.04 || t > 0.92) return Infinity
  const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]
  return len(sub(p, c))
}

export function exposureTarget(iso = 800, t = 2.8) {
  // Incident-light rule of thumb: footcandles = 25 * T^2 / (ISO * shutter), 180° shutter at 24 fps.
  const fc = (25 * t * t) / (iso * (1 / 48))
  return fc * 10.764
}

// set a unit's output so it alone lands `target` stops from the exposure target at its aim point
export function calibrate(l, iso = 800, t = 2.8) {
  if (l.target === undefined) return l
  const fx = FIXTURES[l.fixture]
  const d = Math.hypot(l.aim[0] - l.x, l.aim[1] - l.y, l.aim[2] - l.z)
  const want = exposureTarget(iso, t) * Math.pow(2, l.target)
  l.intensity = Math.round(Math.max(0.05, Math.min(1, (want * d * d) / fx.cd)) * 100) / 100
  return l
}

export function illuminanceAt(scene, p, { exclude } = {}) {
  let E = 0
  for (const l of scene.lights) {
    if (l.on === false || l.id === exclude) continue
    const fx = FIXTURES[l.fixture]
    if (!fx) continue
    const to = sub(p, [l.x, l.y, l.z])
    const d = Math.max(0.3, len(to))
    const dir = norm(sub(l.aim, [l.x, l.y, l.z]))
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot(dir, norm(to))))) * 180) / Math.PI
    const half = fx.beam / 2
    let k
    if (ang <= half * 0.6) k = 1
    else if (ang <= half) k = 1 - 0.65 * ((ang - half * 0.6) / (half * 0.4))
    else k = 0.35 * Math.exp(-(ang - half) / 12)
    E += (fx.cd * l.intensity * k) / (d * d)
  }
  for (const o of scene.objects) {
    const a = getAsset(o.asset)
    if (!a?.practical || o.on === false) continue
    const py = a.hang ? scene.room.h + a.practical.y : (o.y || 0) + a.practical.y
    const d = Math.max(0.3, len(sub(p, [o.x, py, o.z])))
    E += a.practical.cd / (d * d)
  }
  // existing light through windows
  const wins = scene.room.openings.filter((o) => o.type === 'window')
  if (wins.length) E += scene.time === 'day' ? 260 : scene.time === 'dusk' ? 60 : 2
  // outdoors: sun or moon plus sky
  if (scene.room.kind === 'exterior') E += scene.time === 'day' ? 480 : scene.time === 'dusk' ? 95 : 7
  return E
}

export function stopsAt(scene, actor) {
  const E = illuminanceAt(scene, actorFace(actor))
  return { lux: E, stops: Math.log2(Math.max(E, 0.01) / exposureTarget(scene.iso, scene.tstop)) }
}

function footprint(o) {
  const a = getAsset(o.asset)
  if (!a) return null
  const [w, d] = a.size
  const q = Math.abs(Math.round(((o.rot || 0) / (Math.PI / 2)))) % 2
  const ww = q ? d : w, dd = q ? w : d
  return { x0: o.x - ww / 2, x1: o.x + ww / 2, z0: o.z - dd / 2, z1: o.z + dd / 2, a }
}

export function outletPositions(room) {
  return room.outlets.map((o) => {
    const f = wallFrame(room, o.wall)
    return [f.o[0] + f.t[0] * o.at, f.o[1] + f.t[1] * o.at]
  })
}

const lightName = (scene, l) => {
  const role = { key: 'Key', fill: 'Fill', rim: 'Edge', back: 'Back', ambient: 'Ambience', bounce: 'Bounce' }[l.role] || 'Light'
  return `${role} (${FIXTURES[l.fixture]?.name || l.fixture})`
}

export function runChecks(scene, kit) {
  if (!scene) return []
  const out = []
  const aspect = ASPECTS[scene.aspect] || 2.39

  // 1. Gear
  const used = {}
  scene.lights.forEach((l) => { used[l.fixture] = (used[l.fixture] || 0) + 1 })
  let gearOk = true
  for (const [fx, n] of Object.entries(used)) {
    const have = kit?.[fx] || 0
    if (n > have) {
      gearOk = false
      out.push({ id: 'gear_' + fx, level: 'error', group: 'Gear', title: `Needs ${n} × ${FIXTURES[fx]?.name || fx}`, detail: `Your kit has ${have}. Remove one or add it to the kit.` })
    }
  }
  if (gearOk) out.push({ id: 'gear_ok', level: 'ok', group: 'Gear', title: 'Uses only gear in your kit', detail: Object.entries(used).map(([k, v]) => `${v} × ${FIXTURES[k]?.name}`).join(', ') || 'No lights placed yet' })

  // 2. Stands in frame
  let standHits = 0
  for (const cam of scene.cameras) {
    for (const l of scene.lights) {
      const head = [l.x, l.y, l.z], mid = [l.x, l.y * 0.5, l.z], base = [l.x, 0.15, l.z]
      if (lensBlock(cam, [l.x, l.y, l.z]) < 0.45) {
        standHits++
        out.push({
          id: `block_${cam.id}_${l.id}`, level: 'error', group: 'Frame', target: l.id,
          title: `${lightName(scene, l)} blocks Cam ${cam.label}`,
          detail: 'It sits between the lens and the actor.',
          fix: { type: 'pushOutOfFrame', light: l.id, cam: cam.id, label: 'Move it off the lens line' },
        })
      } else if (inFrame(cam, aspect, head) || inFrame(cam, aspect, mid) || inFrame(cam, aspect, base)) {
        standHits++
        out.push({
          id: `stand_${cam.id}_${l.id}`, level: 'warn', group: 'Frame', target: l.id,
          title: `${lightName(scene, l)} is visible in Cam ${cam.label}`,
          detail: 'Move the stand out of frame or flag it.',
          fix: { type: 'pushOutOfFrame', light: l.id, cam: cam.id, label: 'Move out of frame' },
        })
      }
    }
  }
  if (!standHits && scene.cameras.length && scene.lights.length) out.push({ id: 'stand_ok', level: 'ok', group: 'Frame', title: 'No stands in any camera', detail: `${scene.cameras.length} camera${scene.cameras.length > 1 ? 's' : ''} checked` })

  // 3. Exposure per actor
  for (const a of scene.actors) {
    const { lux, stops } = stopsAt(scene, a)
    const s = stops.toFixed(1)
    if (stops < -1.6) {
      out.push({ id: 'exp_' + a.id, level: 'warn', group: 'Exposure', target: a.id, title: `${a.name}'s face is ${Math.abs(stops).toFixed(1)} stops under`, detail: `About ${Math.round(lux)} lux at T${scene.tstop}, ISO ${scene.iso}. Very low-key; raise the key or open up.`, fix: { type: 'raiseKey', actor: a.id, label: 'Raise key to −0.5' } })
    } else if (stops > 1.6) {
      out.push({ id: 'exp_' + a.id, level: 'warn', group: 'Exposure', target: a.id, title: `${a.name}'s face is ${s} stops over`, detail: `About ${Math.round(lux)} lux. Dim the nearest unit or stop down.`, fix: { type: 'lowerKey', actor: a.id, label: 'Bring to +0.5' } })
    } else {
      out.push({ id: 'exp_' + a.id, level: 'ok', group: 'Exposure', target: a.id, title: `${a.name}: ${stops >= 0 ? '+' : ''}${s} stops`, detail: `About ${Math.round(lux)} lux at T${scene.tstop}, ISO ${scene.iso}` })
    }
  }

  // 4. 180-degree line
  if (scene.actors.length >= 2 && scene.cameras.length >= 2) {
    const [A, B] = scene.actors
    const side = (c) => Math.sign((B.x - A.x) * (c.z - A.z) - (B.z - A.z) * (c.x - A.x))
    const s0 = side(scene.cameras[0])
    const bad = scene.cameras.filter((c) => side(c) !== s0)
    if (bad.length) out.push({ id: 'axis', level: 'error', group: 'Coverage', title: `Cam ${bad[0].label} crosses the 180° line`, detail: `Keep all cameras on one side of the ${A.name}–${B.name} line, or the eyelines will flip in the cut.`, fix: { type: 'mirrorCam', cam: bad[0].id, label: 'Mirror to the correct side' } })
    else out.push({ id: 'axis_ok', level: 'ok', group: 'Coverage', title: 'Cameras respect the 180° line', detail: `${A.name}–${B.name} axis` })
  }

  // 5. Collisions and bounds
  const fps = scene.objects.map((o) => ({ o, f: footprint(o) })).filter(({ f }) => f && !f.a.flat && !f.a.wall && !f.a.hang && !f.a.onTable && !(f.a.id === 'table_lamp'))
  const tucks = (a, b) => (['dining_chair', 'office_chair', 'stool'].includes(a.id) && ['dining_table', 'desk', 'side_table'].includes(b.id)) || (['dining_chair', 'office_chair', 'stool'].includes(b.id) && ['dining_table', 'desk', 'side_table'].includes(a.id))
  const { w, d } = scene.room
  let hits = 0
  for (let i = 0; i < fps.length; i++) {
    const A = fps[i].f
    if (A.x0 < -w / 2 - 0.05 || A.x1 > w / 2 + 0.05 || A.z0 < -d / 2 - 0.05 || A.z1 > d / 2 + 0.05) {
      hits++
      out.push({ id: 'oob_' + fps[i].o.id, level: 'warn', group: 'Set', target: fps[i].o.id, title: `${A.a.name} sits outside the room`, detail: 'Drag it back inside the walls.' })
    }
    for (let j = i + 1; j < fps.length; j++) {
      const B = fps[j].f
      const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0)
      const oz = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0)
      if (ox > 0.08 && oz > 0.08 && !tucks(A.a, B.a)) {
        hits++
        out.push({ id: `hit_${fps[i].o.id}_${fps[j].o.id}`, level: 'warn', group: 'Set', target: fps[j].o.id, title: `${A.a.name} overlaps ${B.a.name}`, detail: 'Two pieces occupy the same floor space.' })
      }
    }
  }
  if (!hits) out.push({ id: 'set_ok', level: 'ok', group: 'Set', title: 'Furniture fits the room', detail: `${fps.length} pieces, no overlaps` })

  // 6. Power
  const outs = outletPositions(scene.room)
  for (const l of scene.lights) {
    if (FIXTURES[l.fixture]?.passive) continue
    const dmin = Math.min(...outs.map((p) => Math.hypot(p[0] - l.x, p[1] - l.z)))
    if (dmin > 6) out.push({ id: 'pwr_' + l.id, level: 'warn', group: 'Power', target: l.id, title: `${lightName(scene, l)} is ${dmin.toFixed(1)} m from an outlet`, detail: 'Bring a 25 ft stinger or run it on battery.' })
  }
  return out
}

// ---------- fixes (deterministic) ----------

export function applyFix(scene, fix) {
  const s = structuredClone(scene)
  const aspect = ASPECTS[s.aspect] || 2.39
  if (fix.type === 'pushOutOfFrame') {
    const l = s.lights.find((x) => x.id === fix.light)
    const cam = s.cameras.find((x) => x.id === fix.cam)
    if (!l || !cam) return scene
    const visible = () => s.cameras.some((c) => lensBlock(c, [l.x, l.y, l.z]) < 0.5 || inFrame(c, aspect, [l.x, l.y, l.z], 1.05) || inFrame(c, aspect, [l.x, 0.15, l.z], 1.05) || inFrame(c, aspect, [l.x, l.y * 0.5, l.z], 1.05))
    for (let i = 0; i < 40; i++) {
      if (!visible()) break
      const q = projectToCamera(cam, aspect, [l.x, l.y, l.z]) || { x: 1 }
      const pos = [cam.x, cam.y, cam.z]
      const f = norm(sub(cam.aim, pos))
      const r = norm(cross(f, [0, 1, 0]))
      const sgn = q.x >= 0 ? 1 : -1
      l.x += r[0] * 0.12 * sgn - f[0] * 0.04
      l.z += r[2] * 0.12 * sgn - f[2] * 0.04
      clampToRoom(s.room, l)
    }
    if (visible()) {
      // a wide shot sees every wall: rig the unit just behind and above the lens instead
      const pos = [cam.x, cam.y, cam.z]
      const f = norm(sub(cam.aim, pos))
      const r = norm(cross(f, [0, 1, 0]))
      const sgn = (projectToCamera(cam, aspect, [l.x, l.y, l.z])?.x || 1) >= 0 ? 1 : -1
      l.x = cam.x - f[0] * 0.5 + r[0] * 0.45 * sgn
      l.z = cam.z - f[2] * 0.5 + r[2] * 0.45 * sgn
      l.y = Math.min(s.room.h - 0.25, Math.max(l.y, cam.y + 0.55))
      clampToRoom(s.room, l, 0.2)
    }
    calibrate(l, s.iso, s.tstop)
    return s
  }
  if (fix.type === 'raiseKey' || fix.type === 'lowerKey') {
    const a = s.actors.find((x) => x.id === fix.actor)
    if (!a) return scene
    const target = exposureTarget(s.iso, s.tstop) * Math.pow(2, fix.type === 'raiseKey' ? -0.5 : 0.5)
    // strongest contributor to this face
    let best = null, bestE = -1
    for (const l of s.lights) {
      if (l.on === false) continue
      const E = illuminanceAt({ ...s, lights: [l], objects: [] }, actorFace(a))
      if (E > bestE) { bestE = E; best = l }
    }
    if (!best) return scene
    for (let i = 0; i < 30; i++) {
      const E = illuminanceAt(s, actorFace(a))
      if (fix.type === 'raiseKey' ? E >= target : E <= target) break
      best.intensity = Math.max(0.05, Math.min(1, best.intensity * (fix.type === 'raiseKey' ? 1.12 : 0.88)))
      if (best.intensity >= 1 && fix.type === 'raiseKey') {
        // full power and still dark: move it closer along its line to the face
        const face = actorFace(a)
        best.x += (face[0] - best.x) * 0.12
        best.z += (face[2] - best.z) * 0.12
      }
    }
    best.aim = actorFace(a)
    return s
  }
  if (fix.type === 'mirrorCam') {
    const cam = s.cameras.find((c) => c.id === fix.cam)
    const [A, B] = s.actors
    if (!cam || !A || !B) return scene
    // reflect camera position across the A–B line in XZ
    const dx = B.x - A.x, dz = B.z - A.z, L = dx * dx + dz * dz
    const t = ((cam.x - A.x) * dx + (cam.z - A.z) * dz) / L
    const px = A.x + t * dx, pz = A.z + t * dz
    cam.x = 2 * px - cam.x
    cam.z = 2 * pz - cam.z
    clampToRoom(s.room, cam)
    return s
  }
  return scene
}

export function clampToRoom(room, p, m = 0.25) {
  p.x = Math.max(-room.w / 2 + m, Math.min(room.w / 2 - m, p.x))
  p.z = Math.max(-room.d / 2 + m, Math.min(room.d / 2 - m, p.z))
}
