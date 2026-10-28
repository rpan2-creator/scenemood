import { newId } from '../store.js'
import { getAsset, ASSETS } from '../data/assets.js'
import { FIXTURES } from '../data/gear.js'
import { openingCenter, wallFrame } from '../data/rooms.js'
import { runChecks, applyFix, clampToRoom, actorFace, calibrate, stopsAt, hfov, ASPECTS, lensBlock } from '../engine/checks.js'

// SIMULATED AI. No API key is used. Every function takes and returns the same JSON
// the real model calls in the PRD would (plan → design → validate → review), so a live
// model can replace the bodies without touching the UI. Deterministic code (checks,
// calibration, placement) is real and stays in the loop either way.

export const SIMULATED = true
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const r2 = (v) => Math.round(v * 100) / 100

// ---------------------------------------------------------------- geometry helpers

function anchors(room, objects) {
  const find = (ids) => objects.find((o) => ids.includes(o.asset))
  const seat = find(['sofa', 'bed', 'dining_table', 'desk', 'armchair'])
  const table = find(['coffee_round', 'dining_table', 'side_table', 'desk', 'counter'])
  const lamp = find(['standing_lamp', 'floor_lamp', 'table_lamp', 'pendant'])
  const win = room.openings.find((o) => o.type === 'window')
  const door = room.openings.find((o) => o.type === 'door')
  const inset = (op, k) => {
    if (!op) return null
    const c = openingCenter(room, op)
    const f = wallFrame(room, op.wall)
    return [c[0] + f.n[0] * k, c[1] + f.n[1] * k]
  }
  return { seat, table, lamp, win, door, winIn: inset(win, 0.75), winOut: inset(win, -1.6), doorIn: inset(door, 0.9) }
}

function allocate(kit, wants) {
  const left = { ...kit }
  const pref = {
    softkey: ['cob', 'led_panel', 'tube', 'fresnel'],
    hardkey: ['fresnel', 'cob', 'led_panel', 'tube'],
    rim: ['tube', 'led_panel', 'fresnel'],
    back: ['led_panel', 'fresnel', 'tube'],
    moon: ['led_panel', 'cob', 'tube', 'fresnel'],
    fill: ['reflector', 'tube', 'led_panel'],
    top: ['led_panel', 'cob', 'tube'],
  }
  const out = [], dropped = []
  for (const w of wants) {
    const fx = (pref[w.kind] || ['led_panel']).find((f) => (left[f] || 0) > 0)
    if (!fx) { dropped.push(w); continue }
    left[fx]--
    out.push({ ...w, fixture: fx })
  }
  return { lights: out, dropped }
}

function makeLight(w, room) {
  const fx = FIXTURES[w.fixture]
  const l = {
    id: newId('light'), fixture: w.fixture, role: w.role, label: w.label, source: 'ai',
    x: r2(w.pos[0]), y: r2(w.pos[1]), z: r2(w.pos[2]), aim: w.aim.map(r2),
    intensity: w.intensity ?? 0.5, cct: Math.max(fx.cctMin, Math.min(fx.cctMax, w.cct)),
    diffusion: w.diffusion ?? fx.softness, on: true, why: w.why,
  }
  if (w.fixture === 'reflector') l.y = Math.min(l.y, 1.2)
  l.y = Math.min(l.y, room.h - 0.25)
  clampToRoom(room, l, 0.3)
  if (w.stops !== undefined) { l.target = w.stops; calibrate(l) }
  return l
}

const camera = (label, pos, aim, focal, shot, why, subj) => ({ id: 'cam_' + label.toLowerCase(), label, x: r2(pos[0]), y: r2(pos[1]), z: r2(pos[2]), aim: aim.map(r2), focal, shot, why, source: 'ai', subj })

// ---------------------------------------------------------------- framing, the way an operator would
// Keeps the lens out of furniture, then picks aim height and (for groups) a wider lens so heads
// sit near the top third with proper headroom. Runs on every AI camera after the recipe.
const LENSES = [100, 85, 65, 50, 40, 35, 32, 28, 24, 21, 18]
function solidBoxes(objects) {
  return objects.map((o) => {
    const a = getAsset(o.asset)
    if (!a || a.flat || a.wall || a.hang || a.onTable) return null
    const q = Math.abs(Math.round((o.rot || 0) / (Math.PI / 2))) % 2
    const ww = q ? a.size[1] : a.size[0], dd = q ? a.size[0] : a.size[1]
    return { x0: o.x - ww / 2 - 0.12, x1: o.x + ww / 2 + 0.12, z0: o.z - dd / 2 - 0.12, z1: o.z + dd / 2 + 0.12, h: a.size[2] || 1 }
  }).filter(Boolean)
}
export function frameCamera(cam, scene) {
  const subs = scene.actors.filter((a) => cam.subj?.includes(a.id))
  if (!subs.length) return cam
  const room = scene.room
  const aspect = ASPECTS[scene.aspect] || 2.39
  const c = { ...cam }
  clampToRoom(room, c, 0.35)
  const cx = subs.reduce((m, a) => m + a.x, 0) / subs.length, cz = subs.reduce((m, a) => m + a.z, 0) / subs.length
  // step out of furniture toward the subject
  const boxes = solidBoxes(scene.objects)
  for (let i = 0; i < 20; i++) {
    const hit = boxes.find((b) => c.x > b.x0 && c.x < b.x1 && c.z > b.z0 && c.z < b.z1 && b.h > c.y - 0.25)
    if (!hit) break
    const dx = cx - c.x, dz = cz - c.z, L = Math.hypot(dx, dz) || 1
    c.x += (dx / L) * 0.12; c.z += (dz / L) * 0.12
  }
  // swing around the subject if another actor stands in the lens line
  const others = scene.actors.filter((a) => !cam.subj.includes(a.id))
  const blocked = (q) => others.some((o) => [1.0, actorFace(o)[1]].some((y) => lensBlock({ ...q, aim: [cx, actorFace(subs[0])[1], cz] }, [o.x, y, o.z]) < 0.32))
  if (blocked(c)) {
    const r0 = Math.hypot(c.x - cx, c.z - cz), a0 = Math.atan2(c.x - cx, c.z - cz)
    for (const da of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      const q = { ...c, x: cx + Math.sin(a0 + da) * r0, z: cz + Math.cos(a0 + da) * r0 }
      clampToRoom(room, q, 0.35)
      if (!blocked(q)) { c.x = q.x; c.z = q.z; break }
    }
  }
  const dist = Math.max(0.6, Math.hypot(cx - c.x, cz - c.z))
  const faces = subs.map(actorFace)
  const top = Math.max(...faces.map((f) => f[1])) + 0.14
  const single = subs.length === 1
  const low = Math.min(...faces.map((f) => f[1])) - (single ? 0.3 : 0.45)
  const ang = (y) => Math.atan2(y - c.y, dist)
  const fx = cx - c.x, fz = cz - c.z, fl = Math.hypot(fx, fz) || 1
  const half = subs.reduce((m, a) => {
    const vx = a.x - c.x, vz = a.z - c.z, d = Math.hypot(vx, vz) || 1
    const lat = Math.abs((vx * fz - vz * fx) / fl)
    return Math.max(m, Math.atan2(lat + 0.35, Math.max(0.3, (vx * fx + vz * fz) / fl)))
  }, 0)
  let focal = c.focal
  const fits = (f) => {
    const h = hfov(f) / 2, v = Math.atan(Math.tan(h) / aspect)
    return (single || half < h * 0.86) && (ang(top) - ang(low)) < v * 2 * 0.92
  }
  if (!fits(focal)) focal = LENSES.find((f) => f < focal && fits(f)) || 18
  const vh = Math.atan(Math.tan(hfov(focal) / 2) / aspect)
  const centre = single ? ang(faces[0][1]) - vh / 3 : ang(top) - vh * 0.82
  c.focal = focal
  c.x = r2(c.x); c.z = r2(c.z)
  c.aim = [r2(cx), r2(c.y + dist * Math.tan(centre)), r2(cz)]
  return c
}
const obj = (asset, x, z, extra = {}) => ({ id: newId('obj'), asset, x: r2(x), z: r2(z), y: 0, rot: 0, layer: 'dressing', source: 'ai', ...extra })

function freeSpot(room, objects, [w, d], clear = 0, prefer = [0, room.d * 0.1]) {
  const boxes = objects.map((o) => {
    const a = getAsset(o.asset)
    if (!a || a.flat || a.wall || a.hang || a.onTable) return null
    const q = Math.abs(Math.round((o.rot || 0) / (Math.PI / 2))) % 2
    const ww = q ? a.size[1] : a.size[0], dd = q ? a.size[0] : a.size[1]
    return [o.x - ww / 2, o.x + ww / 2, o.z - dd / 2, o.z + dd / 2]
  }).filter(Boolean)
  let best = null, bd = 1e9
  for (let x = -room.w / 2 + w / 2 + 0.3; x <= room.w / 2 - w / 2 - 0.3; x += 0.1) {
    for (let z = -room.d / 2 + d / 2 + 0.3; z <= room.d / 2 - d / 2 - 0.3; z += 0.1) {
      const W = w / 2 + clear / 2, D = d / 2 + 0.25
      if (boxes.some((b) => x + W > b[0] && x - W < b[1] && z + D > b[2] && z - D < b[3])) continue
      const dist = Math.hypot(x - prefer[0], z - prefer[1])
      if (dist < bd) { bd = dist; best = [r2(x), r2(z)] }
    }
  }
  return best
}

function seatPositions(an) {
  const s = an.seat
  if (!s) return { A: [-0.7, 0.3], B: [0.7, 0.3], seated: false }
  if (s.asset === 'sofa') return { A: [s.x - 0.58, s.z + 0.1], B: [s.x + 0.62, s.z + 0.1], seated: true }
  if (s.asset === 'bed') return { A: [s.x - 0.45, s.z + 0.6], B: [s.x + 0.45, s.z + 0.8], seated: true }
  if (s.asset === 'dining_table') return { A: [s.x - 0.55, s.z + 0.62], B: [s.x + 0.55, s.z - 0.62], seated: true, facing: true }
  return { A: [s.x - 0.5, s.z + 0.8], B: [s.x + 0.6, s.z + 0.5], seated: false }
}

const front = (room, focus, dist, height) => [focus[0], height, Math.min(room.d / 2 - 0.35, focus[1] + dist)]

// ---------------------------------------------------------------- direction recipes
// v = variant number. Variants keep the idea but change lens, key side and dressing.

function recipeTrapped(ctx, v = 0) {
  const { room, base, kit, brief } = ctx
  const an = anchors(room, base)
  const objects = base.map((o) => ({ ...o }))
  const notes = []
  const sp = seatPositions(an)
  let lamp = an.lamp
  const side = v % 2 ? -1 : 1
  if (!lamp) {
    lamp = obj('standing_lamp', sp.B[0] + 0.8 * side, sp.B[1] - 0.45, { why: { ref: 'Motivated practical', text: 'A visible lamp beside her gives the key light a reason to exist.' } })
    objects.push(lamp)
  }
  if (an.table) {
    objects.push(obj('tabletop_props', an.table.x - 0.15, an.table.z + 0.05, { y: getAsset(an.table.asset)?.size[2] || 0.45, rot: 0.6, why: { ref: 'Lived-in detail', text: 'Half-finished coffee says they have been here a while.' } }))
    objects.push(obj('books', an.table.x + 0.18, an.table.z - 0.08, { y: getAsset(an.table.asset)?.size[2] || 0.45, rot: -0.3, why: { ref: 'Lived-in detail', text: 'Ordinary clutter keeps the argument domestic, not staged.' } }))
  }
  if (an.seat?.asset === 'sofa' && !objects.some((o) => o.asset === 'rug')) objects.push(obj('rug', an.seat.x, an.seat.z + 0.95, { why: { ref: 'Warm pool', text: 'A warm rug under the couch defines the space they share.' } }))
  if (an.win) {
    const f = wallFrame(room, an.win.wall), c = openingCenter(room, an.win)
    objects.push(obj('curtain', c[0] + f.n[0] * 0.08 + f.t[0] * 0.55, c[1] + f.n[1] * 0.08 + f.t[1] * 0.55, { rot: Math.atan2(f.n[0], f.n[1]), why: { ref: 'Half-drawn curtain', text: 'The outside is visible but partly shut out.' } }))
  }
  const actors = ctx.actors.map((a, i) => ({ ...a, pose: sp.seated ? (i ? 'turned' : 'hunched') : (i ? 'crossed' : 'stand'), x: r2((i ? sp.B : sp.A)[0]), z: r2((i ? sp.B : sp.A)[1]), rot: i ? -0.35 : 0.35, why: i ? { ref: 'Closed body language', text: 'She sits nearest the door, turned away, arms wrapped.' } : { ref: 'Leaning in', text: 'He leans forward, elbows on knees: he wants to fix it.' } }))
  const A = actors[0], B = actors[1] || actors[0]
  const mid = [(A.x + B.x) / 2, 0.95, (A.z + B.z) / 2]
  const lensA = v % 3 === 2 ? 40 : 32
  const cams = [
    camera('A', front(room, [mid[0], mid[2]], 2.9, 1.15), mid, lensA, 'Medium two-shot', { ref: 'Shared frame', text: 'Both in one frame, with space between them on the couch.' }, [A.id, B.id]),
    camera('B', [A.x - 0.3 * side, 1.12, Math.min(room.d / 2 - 0.4, A.z + 1.85)], actorFace(B), v ? 85 : 65, 'Close-up on ' + B.name, { ref: 'Frame within a frame', text: 'Her close-up keeps the door edge in the background.' }, [B.id]),
  ]
  const lampTop = [lamp.x + 0.15 * side, Math.min(room.h - 0.3, 2.0), lamp.z + 0.4]
  const wants = [
    { kind: 'softkey', role: 'key', label: 'Key, lamp side', pos: lampTop, aim: actorFace(B), stops: 0.1, cct: v === 1 ? 2900 : 3200, diffusion: 0.85, why: { ref: 'Motivated key', text: 'Soft warm key from where the lamp is, so it reads as lamplight.' } },
    brief.time === 'day'
      ? { kind: 'moon', role: 'rim', label: 'Window daylight', pos: an.winOut ? [an.winOut[0], 2.1, an.winOut[1]] : [-room.w / 2 + 0.4, 2.1, 0], aim: actorFace(A), stops: 0.5, cct: 5600, why: { ref: 'Window edge', text: 'Daylight from the window separates him from the wall.' } }
      : { kind: 'moon', role: 'rim', label: 'Moonlight edge', pos: an.winIn ? [an.winIn[0], 2.15, an.winIn[1]] : [-room.w / 2 + 0.4, 2.15, 0], aim: actorFace(A), stops: -0.8, cct: 5600, why: { ref: 'Warm / cool split', text: 'A cool 5600 K edge from the window against the warm room.' } },
    { kind: 'fill', role: 'fill', label: 'Bounce fill', pos: [mid[0] - 1.5 * side, 0.9, mid[2] + 1.1], aim: actorFace(A), stops: -1.6, cct: 3200, why: { ref: 'Low fill ratio', text: 'A bounce, not a light: keeps the shadow side readable without flattening it.' } },
  ]
  const { lights, dropped } = allocate(kit, wants)
  dropped.forEach((d) => notes.push(`No unit left for the ${d.label.toLowerCase()}; the plan works without it.`))
  return {
    key: 'trapped', name: 'Trapped', difficulty: 'Medium', setupMin: 40,
    mood: 'A warm pool around the couch, cold night at the window. She sits closest to the door and stays.',
    palette: ['#2a1c14', '#c97b3c', '#f2c58a', '#30425a'],
    why: [
      { layer: 'Dressing', ref: 'Motivated practical', text: 'The lamp beside her is the visible source, and the clutter keeps it lived-in.' },
      { layer: 'Blocking', ref: 'Frame within a frame', text: 'She is turned away near the exit; her close-up keeps the door in shot.' },
      { layer: 'Lighting', ref: 'Warm / cool split', text: 'A 3200 K key against a 5600 K edge separates the room from the night outside.' },
    ],
    notes,
    scene: { objects, actors, cameras: cams, lights: lights.map((w) => makeLight(w, room)), activeCam: 'cam_a' },
  }
}

// toward the window, but turned enough that the room (and the lens) still catches her face
function halfTurn(room, an, at) {
  if (!an.win) return Math.PI
  const f = wallFrame(room, an.win.wall)
  const cx = -at[0], cz = room.d / 2 - at[1], cl = Math.hypot(cx, cz) || 1
  const dx = -f.n[0] + 1.1 * cx / cl, dz = -f.n[1] + 1.1 * cz / cl
  return Math.atan2(dx, dz)
}

function recipeColdWar(ctx, v = 0) {
  const { room, base, kit, brief } = ctx
  const an = anchors(room, base)
  const notes = []
  const objects = base.filter((o) => !getAsset(o.asset)?.tags?.includes('clutter') && o.asset !== 'rug').map((o) => ({ ...o }))
  const removed = base.length - objects.length
  if (removed) notes.push(`Cleared ${removed} small prop${removed > 1 ? 's' : ''} to leave negative space.`)
  const sp = seatPositions(an)
  const standAt = an.winIn || [room.w / 2 - 0.9, -room.d / 2 + 1.0]
  if (an.seat?.asset === 'sofa' && !objects.some((o) => o.asset === 'armchair' || o.asset === 'accent_chair')) {
    const spot = freeSpot(room, objects, [0.83, 0.75], 0.3, [standAt[0], standAt[1] + 0.9]) || [standAt[0], standAt[1] + 0.9]
    objects.push(obj(v % 2 ? 'accent_chair' : 'armchair', spot[0], spot[1], { rot: an.win?.wall === 'W' ? Math.PI / 2 : an.win?.wall === 'E' ? -Math.PI / 2 : 0, why: { ref: 'Separate territory', text: 'An empty chair by the window: somewhere else she could be.' } }))
  }
  objects.forEach((o) => { if (getAsset(o.asset)?.practical) { o.on = false; o.why = { ref: 'Unlived-in', text: 'Practicals off: the room should feel cold.' } } })
  notes.push('Practical lamp switched off: the room should feel unlived-in.')
  const actors = ctx.actors.map((a, i) => i === 0
    ? { ...a, pose: sp.seated ? 'sit' : 'stand', x: r2(sp.A[0]), z: r2(sp.A[1]), rot: -0.15, why: { ref: 'Small in frame', text: 'He stays on the couch, alone in the middle of it.' } }
    : { ...a, pose: 'crossed', x: r2(standAt[0] + (an.win?.wall === 'W' ? 0.1 : 0)), z: r2(standAt[1] + 0.2), rot: r2(halfTurn(room, an, standAt)), why: { ref: 'Distance as relationship', text: 'She stands at the window, arms crossed, back half-turned.' } })
  const A = actors[0], B = actors[1] || actors[0]
  const mid = [(A.x + B.x) / 2, 1.0, (A.z + B.z) / 2]
  const corner = [(v % 2 ? -1 : 1) * (room.w / 2 - 0.45), 1.55, room.d / 2 - 0.45]
  const cams = [
    camera('A', corner, mid, v ? 21 : 24, 'Wide, locked off', { ref: 'Distance as relationship', text: 'A locked-off wide keeps both small and far apart.' }, [A.id, B.id]),
    camera('B', [A.x + 0.4, 1.1, Math.min(room.d / 2 - 0.4, A.z + 2.1)], actorFace(A), 50, 'Single on ' + A.name, { ref: 'Isolation single', text: 'Clean single with empty couch beside him.' }, [A.id]),
  ]
  const wants = [
    { kind: 'top', role: 'ambient', label: 'Soft top light', pos: [A.x + 0.5, Math.min(room.h - 0.25, 2.35), A.z + 0.9], aim: actorFace(A), stops: -0.5, cct: v ? 4800 : 4300, diffusion: 1, why: { ref: 'Low-contrast ambience', text: 'Flat overhead softness: nobody is singled out.' } },
    brief.time === 'day'
      ? { kind: 'moon', role: 'key', label: 'Window daylight', pos: an.winOut ? [an.winOut[0], 2.0, an.winOut[1]] : [0, 2.0, -room.d / 2 + 0.3], aim: actorFace(B), stops: 0.4, cct: 5600, why: { ref: 'Window key', text: 'Daylight on her from the window she is looking out of.' } }
      : { kind: 'moon', role: 'key', label: 'Moonlight key', pos: an.winIn ? [an.winIn[0] - 0.2, 2.2, an.winIn[1] + 0.2] : [0, 2.2, -room.d / 2 + 0.4], aim: actorFace(B), stops: -0.3, cct: 5600, why: { ref: 'Cool key', text: 'Moonlight on her face, cool and dim.' } },
  ]
  const { lights, dropped } = allocate(kit, wants)
  dropped.forEach((d) => notes.push(`No unit left for the ${d.label.toLowerCase()}.`))
  return {
    key: 'coldwar', name: 'Cold war', difficulty: 'Easy', setupMin: 20,
    mood: 'They are in different corners of the same room. Flat, cool light and a lot of floor between them.',
    palette: ['#11161c', '#3d5466', '#8fa7b8', '#d7dde2'],
    why: [
      { layer: 'Dressing', ref: 'Negative space', text: 'Small props and the rug come out; a chair by the window gives her somewhere else to be.' },
      { layer: 'Blocking', ref: 'Distance as relationship', text: 'A locked-off wide keeps both of them small and far apart.' },
      { layer: 'Lighting', ref: 'Low-contrast ambience', text: 'One soft top source plus window light: nobody is singled out, nobody is safe.' },
    ],
    notes,
    scene: { objects, actors, cameras: cams, lights: lights.map((w) => makeLight(w, room)), activeCam: 'cam_a' },
  }
}

function recipeBoiling(ctx, v = 0) {
  const { room, base, kit } = ctx
  const an = anchors(room, base)
  const notes = []
  const objects = base.map((o) => ({ ...o }))
  let table = objects.find((o) => ['dining_table', 'coffee_round', 'desk', 'counter'].includes(o.asset))
  if (!table) {
    let spot = null, asset = 'dining_table'
    for (const [a, size, clear] of [['dining_table', [1.6, 0.9], 2.2], ['dining_table', [1.6, 0.9], 1.4], ['side_table', [0.45, 0.45], 1.8], ['side_table', [0.45, 0.45], 0.9]]) {
      spot = freeSpot(room, objects, size, clear)
      if (spot) { asset = a; break }
    }
    spot = spot || [0, room.d / 4]
    table = obj(asset, spot[0], spot[1], { why: { ref: 'Obstacle in frame', text: 'A table between them is the line neither crosses.' } })
    objects.push(table)
  } else if (table.asset === 'coffee_round') {
    table.x = r2(an.seat ? an.seat.x : 0)
    table.z = r2((an.seat ? an.seat.z : 0) + 1.35)
    table.why = { ref: 'Obstacle in frame', text: 'Pulled forward so it sits between them.' }
  }
  const ty = getAsset(table.asset)?.size[2] || 0.75
  objects.push(obj('wine', table.x + 0.05, table.z, { y: ty, why: { ref: 'Prop with history', text: 'Two glasses and an open bottle: the evening started well.' } }))
  const tz = table.z
  const actors = ctx.actors.map((a, i) => ({ ...a, pose: i ? 'crossed' : 'stand', x: r2(table.x + (i ? 1.0 : -1.0)), z: r2(tz + (i ? -0.05 : 0.05)), rot: i ? -Math.PI / 2 : Math.PI / 2, why: i ? { ref: 'Squared up', text: 'Standing, arms crossed, facing him across the table.' } : { ref: 'Squared up', text: 'Standing; nobody sits down in this version.' } }))
  const A = actors[0], B = actors[1] || actors[0]
  const f = v ? 40 : 50
  // behind each actor's shoulder, on the camera side of the A–B line
  const ots = (P, Q, sideSign) => {
    const dx = Q.x - P.x, dz = Q.z - P.z, Ln = Math.hypot(dx, dz) || 1
    const ux = dx / Ln, uz = dz / Ln
    return [P.x - ux * 0.85 - uz * 0.55 * sideSign, 1.55, P.z - uz * 0.85 + ux * 0.55 * sideSign]
  }
  const sgn = (B.x - A.x) >= 0 ? 1 : -1
  const cams = [
    camera('A', ots(A, B, -sgn), actorFace(B), f, 'Over ' + A.name + '’s shoulder', { ref: 'Over-the-shoulder reverses', text: 'Matched lenses on one side of the line keep the eyelines locked.' }, [B.id]),
    camera('B', ots(B, A, sgn), actorFace(A), f, 'Over ' + B.name + '’s shoulder', { ref: 'Over-the-shoulder reverses', text: 'The reverse, same lens and height.' }, [A.id]),
  ]
  const wants = [
    { kind: 'hardkey', role: 'key', label: 'Hard side key', pos: [table.x - 0.3, Math.min(room.h - 0.25, 2.25), tz - 1.4], aim: actorFace(A).map((v, i) => (v + actorFace(B)[i]) / 2), stops: 0.5, cct: 3200, diffusion: 0.1, why: { ref: 'Hard side light', text: 'Undiffused, high and to the side: half of each face falls away.' } },
    { kind: 'back', role: 'back', label: 'Backlight', pos: [table.x + 1.9, 2.1, tz - 1.0], aim: actorFace(B), stops: -0.2, cct: v ? 4300 : 3200, diffusion: 0.2, why: { ref: 'Edge separation', text: 'Pulls her off the dark wall behind.' } },
  ]
  const { lights, dropped } = allocate(kit, wants)
  dropped.forEach((d) => notes.push(`No unit left for the ${d.label.toLowerCase()}.`))
  if (!kit.fresnel) notes.push('No Fresnel in your kit: the panel runs without diffusion for a harder edge.')
  return {
    key: 'boiling', name: 'Boiling point', difficulty: 'Hard', setupMin: 50,
    mood: 'Standing, a table between them, hard light and long shadows on the wall. Nobody sits down.',
    palette: ['#120c09', '#6b2d1c', '#d9873f', '#f1dcc0'],
    why: [
      { layer: 'Dressing', ref: 'Obstacle in frame', text: 'The table becomes the line neither of them crosses, with the wine as the evening’s history.' },
      { layer: 'Blocking', ref: 'Over-the-shoulder reverses', text: 'Matched overs on the same side of the line keep the eyelines locked.' },
      { layer: 'Lighting', ref: 'Hard side light', text: 'Undiffused key from high and to the side; no fill, so half of each face falls away.' },
    ],
    notes,
    scene: { objects, actors, cameras: cams, lights: lights.map((w) => makeLight(w, room)), activeCam: 'cam_a' },
  }
}

// three-quarter profile: beside her along the window wall, slightly toward the room, looking back at her face
function profileCam(room, an, B) {
  if (!an.win) return { pos: [B.x + 0.9, 1.0, B.z + 1.1], rot: Math.atan2(0.9, 1.1), side: [1, 0] }
  const f = wallFrame(room, an.win.wall)
  const s = (B.x * f.t[0] + B.z * f.t[1]) > 0 ? -1 : 1 // toward the room's centre along the wall
  const p = { x: B.x + f.n[0] * 1.4 + f.t[0] * s * 1.05, z: B.z + f.n[1] * 1.4 + f.t[1] * s * 1.05 }
  clampToRoom(room, p, 0.4)
  // back three-quarters to the glass: the window rims her and the lens sees it glowing behind her
  const dx = f.n[0] + f.t[0] * s * 0.6, dz = f.n[1] + f.t[1] * s * 0.6
  return { pos: [p.x, 1.0, p.z], rot: Math.atan2(dx, dz), bounce: [B.x + f.n[0] * 0.8 - f.t[0] * s * 0.95, B.z + f.n[1] * 0.8 - f.t[1] * s * 0.95] }
}

function recipeLastLight(ctx, v = 0) {
  const { room, base, kit, brief } = ctx
  const an = anchors(room, base)
  const notes = []
  const objects = base.map((o) => ({ ...o }))
  const nearWin = an.winIn || [0, -room.d / 2 + 1.0]
  const spot = freeSpot(room, objects, [0.55, 0.55], 0.4, [nearWin[0], nearWin[1] + 0.3]) || nearWin
  objects.push(obj('pouf', spot[0], spot[1], { why: { ref: 'Seat by the light', text: 'A low seat right at the window, where the only light is.' } }))
  objects.push(obj('candles', (an.table?.x ?? spot[0] + 0.6), (an.table?.z ?? spot[1] + 0.4), { y: an.table ? (getAsset(an.table.asset)?.size[2] || 0.45) : 0, why: { ref: 'Small practical', text: 'A candle is the only warm source in the room.' } }))
  objects.forEach((o) => { if (['standing_lamp', 'floor_lamp', 'table_lamp', 'pendant'].includes(o.asset)) o.on = false })
  const sp = seatPositions(an)
  const actors = ctx.actors.map((a, i) => i === 0
    ? { ...a, pose: sp.seated ? 'sit' : 'stand', x: r2(sp.A[0]), z: r2(sp.A[1]), rot: 0.2, why: { ref: 'Silhouette', text: 'He stays on the couch, mostly in shadow.' } }
    : { ...a, pose: 'sit', x: r2(spot[0]), z: r2(spot[1]), rot: r2(profileCam(room, an, { x: spot[0], z: spot[1] }).rot), why: { ref: 'Profile in window light', text: 'She sits side-on to the window; the light models her profile.' } })
  const A = actors[0], B = actors[1] || actors[0]
  const cams = [
    camera('A', profileCam(room, an, B).pos, actorFace(B), v ? 100 : 85, 'Profile close-up on ' + B.name, { ref: 'Long lens profile', text: 'A long lens compresses her against the window glow.' }, [B.id]),
    camera('B', front(room, [(A.x + B.x) / 2, (A.z + B.z) / 2], 3.2, 1.25), [(A.x + B.x) / 2, 0.9, (A.z + B.z) / 2], 35, 'Wide, both', { ref: 'Contrast of light', text: 'She is lit, he is not.' }, [A.id, B.id]),
  ]
  const wants = [
    { kind: 'moon', role: 'key', label: brief.time === 'day' ? 'Boosted window key' : 'Streetlight through window', pos: an.winOut ? [an.winOut[0], 1.9, an.winOut[1]] : [nearWin[0], 1.9, nearWin[1] - 1.2], aim: actorFace(B), stops: 0.2, cct: brief.time === 'day' ? 5600 : 4300, diffusion: 0.8, why: { ref: 'Window as key', text: 'One unit outside the window does all the work.' } },
    { kind: 'fill', role: 'fill', label: 'Bounce', pos: profileCam(room, an, B).bounce ? [profileCam(room, an, B).bounce[0], 0.9, profileCam(room, an, B).bounce[1]] : [B.x - 1.0, 0.9, B.z - 0.7], aim: actorFace(B), stops: -1.8, cct: 4300, why: { ref: 'Negative fill', text: 'Just enough bounce to hold the eye on her shadow side.' } },
  ]
  const { lights, dropped } = allocate(kit, wants)
  dropped.forEach((d) => notes.push(`No unit left for the ${d.label.toLowerCase()}.`))
  return {
    key: 'lastlight', name: 'Last light', difficulty: 'Easy', setupMin: 15,
    mood: 'Almost no lamps. She sits at the window in profile, he stays in the dark on the couch. One unit, fifteen minutes.',
    palette: ['#0b0d10', '#24364a', '#9fb4c7', '#e9b97a'],
    why: [
      { layer: 'Dressing', ref: 'Seat by the light', text: 'A pouf at the window and a single candle; everything else goes dark.' },
      { layer: 'Blocking', ref: 'Profile and silhouette', text: 'She is lit in profile, he is a shape in the background.' },
      { layer: 'Lighting', ref: 'Minimum gear', text: 'One powered unit outside the window plus a bounce. Fastest setup of the four.' },
    ],
    notes,
    scene: { objects, actors, cameras: cams, lights: lights.map((w) => makeLight(w, room)), activeCam: 'cam_a' },
  }
}

const RECIPES = { trapped: recipeTrapped, coldwar: recipeColdWar, boiling: recipeBoiling, lastlight: recipeLastLight }
const NAMES = { trapped: 'Trapped', coldwar: 'Cold war', boiling: 'Boiling point', lastlight: 'Last light' }

function rank(text) {
  const t = (text || '').toLowerCase()
  const score = { trapped: 0, coldwar: 0, boiling: 0, lastlight: 0 }
  if (/(trap|leave|door|warm|intimate|close|stay|离开|门|温暖)/.test(t)) score.trapped += 2
  if (/(lonely|distance|cold|silent|apart|empty|孤独|距离|冷|沉默)/.test(t)) score.coldwar += 2
  if (/(fight|angry|shout|explode|hard|confront|吵|愤怒|爆发|对峙)/.test(t)) score.boiling += 2
  if (/(quiet|sad|alone|grief|window|dusk|安静|悲伤|窗)/.test(t)) score.lastlight += 2
  return Object.keys(score).sort((a, b) => score[b] - score[a])
}

// Low-output kits: pick camera settings the gear can actually reach, the way a DP would.
const SETTINGS = [[800, 2.8], [1600, 2.8], [1600, 2], [3200, 2], [3200, 1.4]]
export function fitCameraSettings(scene) {
  let best = null, bestMin = -1e9
  for (const [iso, t] of SETTINGS) {
    const s = { ...scene, iso, tstop: t }
    const st = s.actors.map((a) => stopsAt(s, a).stops)
    const lo = Math.min(...st), hi = Math.max(...st)
    if (lo >= -1.5 && hi <= 1.6) return { scene: s, changed: iso !== scene.iso || t !== scene.tstop }
    if (lo > bestMin && hi <= 2) { bestMin = lo; best = s }
  }
  return { scene: best || scene, changed: !!best && (best.iso !== scene.iso || best.tstop !== scene.tstop) }
}

function finish(d, baseScene, kit) {
  let scene = { ...baseScene, ...d.scene }
  scene = { ...scene, cameras: scene.cameras.map((c) => frameCamera(c, scene)) }
  const repaired = []
  for (let pass = 0; pass < 3; pass++) {
    const todo = runChecks(scene, kit).filter((x) => x.level !== 'ok' && x.fix && ['pushOutOfFrame', 'mirrorCam'].includes(x.fix.type))
    if (!todo.length) break
    for (const c of todo) { scene = applyFix(scene, c.fix); if (!repaired.includes(c.title)) repaired.push(c.title) }
  }
  const fit = fitCameraSettings(scene)
  if (fit.changed) { scene = fit.scene; d.notes.push(`Your kit is light on output: shoot at T${scene.tstop}, ISO ${scene.iso}.`) }
  return { scene, repaired }
}

function package_(d, scene, repaired, kit, variant) {
  const issues = runChecks(scene, kit).filter((c) => c.level !== 'ok')
  return {
    id: newId('dir'), key: d.key, name: variant ? `${d.name} · ${['', 'B', 'C', 'D', 'E'][variant] || variant + 1}` : d.name, variant: variant || 0,
    mood: d.mood, difficulty: d.difficulty, setupMin: d.setupMin, palette: d.palette,
    why: d.why, notes: d.notes, repaired, openIssues: issues.map((i) => ({ level: i.level, title: i.title })),
    gearUse: scene.lights.reduce((m, l) => ({ ...m, [l.fixture]: (m[l.fixture] || 0) + 1 }), {}),
    layers: {
      dressing: scene.objects,
      blocking: { actors: scene.actors, cameras: scene.cameras, activeCam: scene.activeCam },
      lighting: { lights: scene.lights, practicals: scene.objects.filter((o) => getAsset(o.asset)?.practical).map((o) => ({ id: o.id, on: o.on !== false })) },
    },
    scene,
    createdAt: Date.now(),
  }
}

// synchronous version for previews and the landing page
export function sampleScene(baseScene, kit, brief, which = 'trapped', variant = 0) {
  const key = typeof which === 'number' ? ['trapped', 'coldwar', 'boiling', 'lastlight'][which] : which
  const ctx = { room: baseScene.room, base: baseScene.objects, actors: baseScene.actors, kit, brief }
  const d = RECIPES[key](ctx, variant)
  return finish(d, baseScene, kit).scene
}

// ---------------- pipeline: plan → design → validate → review (simulated)

export async function generateDirections({ setup, baseScene, count = 4 }, onEvent) {
  const kit = setup.kit
  const ctx = { room: baseScene.room, base: baseScene.objects, actors: baseScene.actors, kit, brief: setup.brief }
  const order = rank(setup.brief.text).slice(0, count)
  onEvent({ type: 'stage', stage: 'plan', text: `Planning ${order.length} directions that differ in mood, style and gear load` })
  await wait(1000)
  onEvent({ type: 'plan', names: order.map((k) => NAMES[k]) })
  const results = []
  for (const [n, key] of order.entries()) {
    onEvent({ type: 'stage', stage: 'design', index: n, text: `Designing “${NAMES[key]}”: dressing, blocking, lighting` })
    await wait(700 + n * 350)
    const d = RECIPES[key](ctx, 0)
    onEvent({ type: 'stage', stage: 'validate', index: n, text: 'Checking gear, stands in frame, exposure per face, the 180° line' })
    const { scene, repaired } = finish(d, baseScene, kit)
    await wait(500)
    onEvent({ type: 'stage', stage: 'review', index: n, text: 'Reviewing as a DP: does every layer tell the same story?' })
    await wait(400)
    const dir = package_(d, scene, repaired, kit, 0)
    results.push(dir)
    onEvent({ type: 'direction', direction: dir })
  }
  onEvent({ type: 'done' })
  return results
}

// "More like this": variants of one idea with a different lens, key side and dressing
export async function moreVariants({ setup, baseScene, key, existing = [] }, onEvent) {
  const kit = setup.kit
  const ctx = { room: baseScene.room, base: baseScene.objects, actors: baseScene.actors, kit, brief: setup.brief }
  const used = existing.filter((d) => d.key === key).map((d) => d.variant || 0)
  const out = []
  for (let v = 1; out.length < 2 && v < 6; v++) {
    if (used.includes(v)) continue
    onEvent?.({ type: 'stage', text: `Designing a variant of “${NAMES[key]}”` })
    await wait(900)
    const d = RECIPES[key](ctx, v)
    const { scene, repaired } = finish(d, baseScene, kit)
    const dir = package_(d, scene, repaired, kit, v)
    out.push(dir)
    onEvent?.({ type: 'direction', direction: dir })
  }
  return out
}

// mix layers from different directions, then re-aim lights at the new blocking
export function mixDirections(base, pick, dirs) {
  const by = (id) => dirs.find((d) => d.id === id)
  const D = by(pick.dressing), B = by(pick.blocking), L = by(pick.lighting)
  const objects = D.layers.dressing.map((o) => ({ ...o }))
  for (const p of L.layers.lighting.practicals) { const o = objects.find((x) => x.id === p.id); if (o) o.on = p.on }
  const scene = { ...base, objects, actors: B.layers.blocking.actors, cameras: B.layers.blocking.cameras, activeCam: B.layers.blocking.activeCam, lights: L.layers.lighting.lights.map((l) => ({ ...l })) }
  for (const l of scene.lights) {
    if (!scene.actors.length || l.role === 'ambient') continue
    let best = scene.actors[0], bd = 1e9
    for (const a of scene.actors) { const dd = Math.hypot(a.x - l.aim[0], a.z - l.aim[2]); if (dd < bd) { bd = dd; best = a } }
    l.aim = actorFace(best)
    calibrate(l, scene.iso, scene.tstop)
  }
  return fitCameraSettings(scene).scene
}

// ---------------- natural-language edits

const has = (t, re) => re.test(t)
const ASSET_WORDS = [
  ['sofa', /sofa|couch|沙发/], ['armchair', /armchair|lounge chair|扶手椅/], ['accent_chair', /accent chair|单椅/], ['pouf', /pouf|ottoman|坐墩/],
  ['dining_chair', /dining chair|餐椅/], ['stool', /stool|吧凳/], ['coffee_round', /coffee table|茶几/], ['side_table', /side table|边几/],
  ['dining_table', /dining table|餐桌/], ['desk', /desk|书桌/], ['standing_lamp', /floor lamp|standing lamp|落地灯/], ['table_lamp', /table lamp|台灯/],
  ['pendant', /pendant|吊灯/], ['candles', /candle|蜡烛/], ['bookshelf', /bookshelf|书架/], ['sideboard', /sideboard|边柜/], ['tv', /\btv\b|television|电视/],
  ['rug', /rug|carpet|地毯/], ['curtain', /curtain|窗帘/], ['cushion', /cushion|坐垫/], ['plant_tall', /plant|植物|绿植/], ['flowers', /flower|vase|花/],
  ['tabletop_props', /mug|cup|杯/], ['books', /books|书/], ['wine', /wine|酒/], ['laptop', /laptop|电脑/], ['wall_art', /art|print|painting|挂画|画/], ['mirror', /mirror|镜子/], ['clock', /clock|钟/],
]
const assetIn = (t) => ASSET_WORDS.find(([, re]) => re.test(t))?.[0]

function subjectActor(t, scene, hint) {
  if (hint) return scene.actors.find((a) => a.id === hint)
  for (const a of scene.actors) if (t.includes(a.name.toLowerCase())) return a
  if (has(t, /\b(her|she)\b|她/)) return scene.actors.find((a) => a.id === 'actor_b') || scene.actors[1]
  if (has(t, /\b(him|he)\b|他/)) return scene.actors.find((a) => a.id === 'actor_a') || scene.actors[0]
  return null
}

function nearestLight(scene, actor, roles) {
  const face = actorFace(actor)
  let best = null, bd = 1e9
  for (const l of scene.lights) {
    if (roles && !roles.includes(l.role)) continue
    const d = Math.hypot(l.aim[0] - face[0], l.aim[2] - face[2])
    if (d < bd) { bd = d; best = l }
  }
  return best || scene.lights[0]
}

export async function interpretCommand(text, scene, { kit, hintActor } = {}) {
  await wait(650 + Math.random() * 450)
  const t = text.toLowerCase().trim()
  const s = structuredClone(scene)
  const changed = new Set()
  const parts = []
  let ref = null
  const who = subjectActor(t, s, hintActor)
  const scale = (k, f = () => true) => s.lights.filter(f).forEach((l) => { l.intensity = Math.max(0.05, Math.min(1, +(l.intensity * k).toFixed(2))); delete l.target; changed.add(l.id) })
  const keyLight = () => s.lights.find((l) => l.role === 'key') || s.lights[0]

  if (has(t, /(face|脸).*(dark|暗)|too dark on|(dark|暗).*(face|脸)|看不清|underexposed/)) {
    const a = who || s.actors[1] || s.actors[0]
    const l = nearestLight(s, a, ['key', 'rim', 'ambient'])
    if (l) { l.intensity = Math.min(1, +(l.intensity * 1.45 + 0.08).toFixed(2)); delete l.target; l.aim = actorFace(a); changed.add(l.id); parts.push(`Raised the ${(l.label || 'key').toLowerCase()} to ${Math.round(l.intensity * 100)}% and re-aimed it at ${a.name}`); ref = 'Key-to-face exposure' }
  } else if (has(t, /(darker|moodier|low.?key|more contrast|暗一点|更暗|压暗|低调|对比)/)) {
    scale(0.65, (l) => l.role !== 'key'); scale(0.88, (l) => l.role === 'key')
    parts.push('Brought fill and ambience down 35% and the key down 12%'); ref = 'Low-key ratio'
  } else if (has(t, /(brighter|lift|more light|亮一点|更亮|提亮)/)) {
    scale(1.3); parts.push('Raised every unit by 30%')
  }
  if (has(t, /(softer|soft light|柔和|更柔)/)) { s.lights.forEach((l) => { l.diffusion = Math.min(1, (l.diffusion ?? 0.5) + 0.35); changed.add(l.id) }); parts.push('Added diffusion to every unit'); ref = ref || 'Source size' }
  if (has(t, /(harder|hard light|硬光|更硬)/)) { s.lights.forEach((l) => { l.diffusion = Math.max(0, (l.diffusion ?? 0.5) - 0.4); changed.add(l.id) }); parts.push('Took diffusion off for harder shadows'); ref = ref || 'Hard side light' }
  if (has(t, /(warmer|warm|暖)/)) { const k = s.lights.filter((l) => l.role === 'key'); (k.length ? k : s.lights).forEach((l) => { l.cct = Math.max(FIXTURES[l.fixture].cctMin, l.cct - 500); changed.add(l.id) }); parts.push('Shifted the key 500 K warmer'); ref = ref || 'Warm / cool split' }
  if (has(t, /(cooler|colder|cool|cold|冷)/)) { s.lights.filter((l) => l.role !== 'key').forEach((l) => { l.cct = Math.min(FIXTURES[l.fixture].cctMax, l.cct + 700); changed.add(l.id) }); parts.push('Pushed the edge and ambience 700 K cooler'); ref = ref || 'Warm / cool split' }
  if (has(t, /(key|主光).*(left|左)|camera.?left/)) { const l = keyLight(); const c = s.cameras.find((x) => x.id === s.activeCam); if (l && c) { const dx = c.aim[0] - c.x, dz = c.aim[2] - c.z; const L = Math.hypot(dx, dz); l.x = +(l.aim[0] + (-dz / L) * 1.4 - (dx / L) * 0.6).toFixed(2); l.z = +(l.aim[2] + (dx / L) * 1.4 - (dz / L) * 0.6).toFixed(2); clampToRoom(s.room, l, 0.3); changed.add(l.id); parts.push('Moved the key to camera left') } }
  if (has(t, /(key|主光).*(right|右)|camera.?right/)) { const l = keyLight(); const c = s.cameras.find((x) => x.id === s.activeCam); if (l && c) { const dx = c.aim[0] - c.x, dz = c.aim[2] - c.z; const L = Math.hypot(dx, dz); l.x = +(l.aim[0] + (dz / L) * 1.4 - (dx / L) * 0.6).toFixed(2); l.z = +(l.aim[2] + (-dx / L) * 1.4 - (dz / L) * 0.6).toFixed(2); clampToRoom(s.room, l, 0.3); changed.add(l.id); parts.push('Moved the key to camera right') } }

  if (has(t, /(door|门)/) && who && !assetIn(t)) {
    const door = s.room.openings.find((o) => o.type === 'door')
    if (door) { const c = openingCenter(s.room, door), f = wallFrame(s.room, door.wall); who.x = +(who.x + (c[0] + f.n[0] * 0.9 - who.x) * 0.6).toFixed(2); who.z = +(who.z + (c[1] + f.n[1] * 0.9 - who.z) * 0.6).toFixed(2); who.pose = 'crossed'; changed.add(who.id); parts.push(`Moved ${who.name} toward the door, standing`); ref = ref || 'Blocking toward the exit' }
  }
  if (has(t, /(window|窗)/) && who && !has(t, /(light|光)/) && !assetIn(t)) {
    const win = s.room.openings.find((o) => o.type === 'window')
    if (win) { const c = openingCenter(s.room, win), f = wallFrame(s.room, win.wall); who.x = +(c[0] + f.n[0] * 0.75).toFixed(2); who.z = +(c[1] + f.n[1] * 0.75).toFixed(2); who.pose = 'crossed'; changed.add(who.id); parts.push(`Moved ${who.name} to the window`) }
  }
  if (who && has(t, /(sit|坐)/)) { who.pose = 'sit'; changed.add(who.id); parts.push(`${who.name} sits`) }
  if (who && has(t, /(stand|站)/)) { who.pose = 'stand'; changed.add(who.id); parts.push(`${who.name} stands`) }
  if (who && has(t, /(arms crossed|cross|抱臂)/)) { who.pose = 'crossed'; changed.add(who.id); parts.push(`${who.name} crosses arms`) }
  if (who && has(t, /(lean|hunch|前倾)/)) { who.pose = 'hunched'; changed.add(who.id); parts.push(`${who.name} leans forward`) }
  if (has(t, /(apart|further|lonely|distance|分开|远一点|孤独)/) && s.actors.length > 1) {
    const [A, B] = s.actors, dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1
    B.x = +(B.x + (dx / L) * 0.7).toFixed(2); B.z = +(B.z + (dz / L) * 0.7).toFixed(2); clampToRoom(s.room, B, 0.4); changed.add(B.id)
    parts.push(`Moved ${B.name} 0.7 m further from ${A.name}`); ref = ref || 'Distance as relationship'
  }
  if (has(t, /(closer together|together|靠近|近一点)/) && s.actors.length > 1) { const [A, B] = s.actors; B.x = +(B.x + (A.x - B.x) * 0.35).toFixed(2); B.z = +(B.z + (A.z - B.z) * 0.35).toFixed(2); changed.add(B.id); parts.push(`Brought ${B.name} closer to ${A.name}`) }

  const wantsRemove = has(t, /(remove|delete|take out|get rid|去掉|删除|拿走)/)
  const named = assetIn(t)
  if (wantsRemove && named) {
    const before = s.objects.length
    s.objects = s.objects.filter((o) => o.asset !== named)
    if (s.objects.length < before) parts.push(`Removed the ${getAsset(named).name.toLowerCase()}`)
  } else if (named && has(t, /(add|put|place|bring|加|放|添)/)) {
    const a = getAsset(named)
    const near = who || s.actors[0]
    let x = near ? near.x + 0.8 : 0, z = near ? near.z - 0.4 : 0, y = 0
    if (a.onTable) { const tb = s.objects.find((o) => ['coffee_round', 'dining_table', 'side_table', 'desk', 'counter'].includes(o.asset)); if (tb) { x = tb.x + 0.1; z = tb.z; y = getAsset(tb.asset).size[2] } }
    const o = obj(named, x, z, { y, why: { ref: a.practical ? 'Motivated practical' : 'Requested', text: `Added on request: “${text}”` } })
    clampToRoom(s.room, o, 0.35)
    s.objects.push(o); changed.add(o.id)
    parts.push(`Added a ${a.name.toLowerCase()}`)
    if (a.practical) ref = ref || 'Motivated practical'
  }
  if (has(t, /(clean|clear|declutter|simpler|minimal|简洁|干净|清空)/)) {
    const before = s.objects.length
    s.objects = s.objects.filter((o) => !(getAsset(o.asset)?.tags?.includes('clutter') || o.asset === 'plant_small' || o.asset === 'wall_art'))
    parts.push(`Removed ${before - s.objects.length} small props`); ref = ref || 'Negative space'
  }
  if (has(t, /(lamp|practical|台灯|灯).*(off|关)|turn off the lamp|关灯/)) { s.objects.forEach((o) => { if (getAsset(o.asset)?.practical) { o.on = false; changed.add(o.id) } }); parts.push('Switched the practicals off') }
  if (has(t, /(lamp|practical|灯).*(on|开)|turn on the lamp|开灯/)) { s.objects.forEach((o) => { if (getAsset(o.asset)?.practical) { o.on = true; changed.add(o.id) } }); parts.push('Switched the practicals on') }

  const cam = s.cameras.find((c) => c.id === s.activeCam) || s.cameras[0]
  if (cam) {
    if (has(t, /(close.?up|closer shot|tighter|特写|近景|推近)/)) { cam.focal = Math.min(135, Math.round(cam.focal * 1.6)); cam.shot = 'Close-up'; changed.add(cam.id); parts.push(`Cam ${cam.label} to ${cam.focal} mm`) }
    else if (has(t, /(wider|wide shot|全景|广角|拉远)/)) { cam.focal = Math.max(18, Math.round(cam.focal / 1.6)); cam.shot = 'Wide'; changed.add(cam.id); parts.push(`Cam ${cam.label} to ${cam.focal} mm`) }
    if (has(t, /(low angle|lower|仰拍|低机位)/)) { cam.y = Math.max(0.5, +(cam.y - 0.4).toFixed(2)); changed.add(cam.id); parts.push(`Cam ${cam.label} down to ${cam.y} m`) }
    if (has(t, /(high angle|higher|俯拍|高机位)/)) { cam.y = Math.min(2.3, +(cam.y + 0.45).toFixed(2)); changed.add(cam.id); parts.push(`Cam ${cam.label} up to ${cam.y} m`) }
  }
  if (has(t, /(rim|edge|backlight|轮廓|逆光)/)) {
    const l = s.lights.find((x) => x.role === 'rim' || x.role === 'back')
    if (l) { l.intensity = Math.min(1, +(l.intensity + 0.2).toFixed(2)); delete l.target; changed.add(l.id); parts.push('Raised the edge light') }
    else parts.push('No spare unit for an edge light in this kit')
  }

  if (!parts.length) {
    return { ok: false, message: 'I couldn’t turn that into a set change.', suggestions: ['Her face is too dark', 'Make it moodier', 'Move the key to camera left', 'Add a candle', 'Tighter on this camera', 'Clear the clutter'] }
  }
  const issues = runChecks(s, kit).filter((c) => c.level !== 'ok')
  return { ok: true, summary: parts.join('. ') + '.', ref, changed: [...changed], scene: s, issues: issues.slice(0, 3).map((i) => i.title) }
}

// ---------------- reference frames: QC against the plan (simulated vision check)

export async function qcReference(scene) {
  await wait(600)
  const lightsInPlan = scene.lights.filter((l) => l.on !== false).length + scene.objects.filter((o) => getAsset(o.asset)?.practical && o.on !== false).length
  const props = scene.objects.filter((o) => !getAsset(o.asset)?.flat).length
  const faces = scene.actors.map((a) => ({ a, s: stopsAt(scene, a).stops }))
  const items = [
    { ok: true, text: `Light sources match the plan (${lightsInPlan})` },
    { ok: true, text: `No props outside the plan (${props} checked)` },
    { ok: true, text: 'Room layout, doors and windows preserved' },
    ...faces.map(({ a, s }) => ({ ok: Math.abs(s) <= 1.6, text: `${a.name}: skin tone kept, exposure ${s >= 0 ? '+' : ''}${s.toFixed(1)} EV` })),
  ]
  return { pass: items.every((i) => i.ok), items }
}

// ---------------- learning mode: critique the student's own setup before showing AI ideas

export function critique(scene) {
  const notes = []
  const key = scene.lights.find((l) => l.role === 'key')
  if (!scene.lights.length) notes.push({ level: 'warn', text: 'No lights yet. Start with a key: where would the light in this room come from?' })
  if (key) {
    const practical = scene.objects.find((o) => getAsset(o.asset)?.practical && o.on !== false && Math.hypot(o.x - key.x, o.z - key.z) < 1.2)
    notes.push(practical ? { level: 'ok', text: 'Your key sits near a practical: it reads as motivated light.' } : { level: 'tip', text: 'Your key has no visible source. Could a lamp or window motivate it?' })
  }
  const fill = scene.lights.find((l) => l.role === 'fill')
  if (key && fill) { const r = (key.intensity / Math.max(0.05, fill.intensity)); notes.push({ level: 'ok', text: `Key-to-fill ratio about ${r.toFixed(1)}:1. Over 4:1 reads dramatic, under 2:1 reads flat.` }) }
  const issues = runChecks(scene, Object.fromEntries(Object.keys(FIXTURES).map((k) => [k, 9]))).filter((c) => c.level !== 'ok' && c.group !== 'Gear')
  issues.slice(0, 3).forEach((i) => notes.push({ level: 'warn', text: i.title }))
  if (scene.cameras.length >= 2) notes.push({ level: 'tip', text: 'Check each camera for the same eyeline direction before you commit.' })
  return notes
}

export const assetCount = () => ASSETS.length
