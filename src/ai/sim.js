import { newId } from '../store.js'
import { getAsset } from '../data/assets.js'
import { FIXTURES } from '../data/gear.js'
import { openingCenter, wallFrame } from '../data/rooms.js'
import { runChecks, applyFix, clampToRoom, actorFace, calibrate, stopsAt } from '../engine/checks.js'

// SIMULATED AI. No API key is used. Each function has the same shape as the
// real model call described in the PRD (structured JSON in, structured JSON out),
// so the live model can replace it without touching the UI.

export const SIMULATED = true
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const r2 = (v) => Math.round(v * 100) / 100

// ---------------- geometry helpers ----------------

function anchors(room, objects) {
  const find = (ids) => objects.find((o) => ids.includes(o.asset))
  const seat = find(['sofa', 'bed', 'dining_table', 'desk', 'armchair'])
  const table = find(['coffee_round', 'dining_table', 'side_table', 'desk'])
  const lamp = find(['floor_lamp', 'table_lamp', 'pendant'])
  const win = room.openings.find((o) => o.type === 'window')
  const door = room.openings.find((o) => o.type === 'door')
  const inset = (op, k) => {
    if (!op) return null
    const c = openingCenter(room, op)
    const f = wallFrame(room, op.wall)
    return [c[0] + f.n[0] * k, c[1] + f.n[1] * k]
  }
  return {
    seat, table, lamp, win, door,
    winIn: inset(win, 0.7), winOut: inset(win, -1.6), doorIn: inset(door, 0.8),
    center: [seat ? seat.x : 0, seat ? seat.z + 1.0 : 0],
  }
}

// find open floor for a footprint (plus clearance for people around it), nearest the room's middle
function freeSpot(room, objects, [w, d], clear = 0) {
  const boxes = objects.map((o) => { const a = getAsset(o.asset); if (!a || a.flat || a.wall || a.hang) return null; const q = Math.abs(Math.round((o.rot || 0) / (Math.PI / 2))) % 2; const ww = q ? a.size[1] : a.size[0], dd = q ? a.size[0] : a.size[1]; return [o.x - ww / 2, o.x + ww / 2, o.z - dd / 2, o.z + dd / 2] }).filter(Boolean)
  let best = null, bd = 1e9
  for (let x = -room.w / 2 + w / 2 + 0.3; x <= room.w / 2 - w / 2 - 0.3; x += 0.1) {
    for (let z = -room.d / 2 + d / 2 + 0.3; z <= room.d / 2 - d / 2 - 0.3; z += 0.1) {
      const W = w / 2 + clear / 2, D = d / 2 + 0.25
      const hit = boxes.some((b) => x + W > b[0] && x - W < b[1] && z + D > b[2] && z - D < b[3])
      if (hit) continue
      const dist = Math.hypot(x, z - room.d * 0.1)
      if (dist < bd) { bd = dist; best = [r2(x), r2(z)] }
    }
  }
  return best
}

// pick fixtures for wanted roles, falling back to what the kit has
function allocate(kit, wants) {
  const left = { ...kit }
  const pref = {
    key: ['fresnel', 'led_panel', 'tube'],
    hardkey: ['fresnel', 'led_panel', 'tube'],
    softkey: ['led_panel', 'tube', 'fresnel'],
    rim: ['tube', 'led_panel', 'fresnel'],
    back: ['led_panel', 'fresnel', 'tube'],
    moon: ['led_panel', 'tube', 'fresnel'],
    fill: ['reflector', 'tube', 'led_panel'],
    top: ['led_panel', 'tube'],
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
  const l = {
    id: newId('light'), fixture: w.fixture, role: w.role, label: w.label,
    x: r2(w.pos[0]), y: r2(w.pos[1]), z: r2(w.pos[2]), aim: w.aim.map(r2),
    intensity: w.intensity, cct: Math.max(FIXTURES[w.fixture].cctMin, Math.min(FIXTURES[w.fixture].cctMax, w.cct)),
    diffusion: w.diffusion ?? FIXTURES[w.fixture].softness, on: true,
  }
  if (w.fixture === 'reflector') l.y = Math.min(l.y, 1.2)
  clampToRoom(room, l, 0.3)
  if (w.stops !== undefined) { l.target = w.stops; calibrate(l) }
  return l
}

function camera(label, pos, aim, focal, shot) {
  return { id: 'cam_' + label.toLowerCase(), label, x: r2(pos[0]), y: r2(pos[1]), z: r2(pos[2]), aim: aim.map(r2), focal, shot }
}

function placeOnTable(table, asset) {
  const a = getAsset(table.asset)
  return { id: newId('obj'), asset, x: table.x + 0.1, z: table.z, y: a ? a.size[2] : 0.45, rot: 0.3, layer: 'dressing', source: 'ai' }
}

// ---------------- the three direction recipes ----------------

function seatPositions(an, room) {
  const s = an.seat
  if (!s) return { A: [-0.7, 0.3], B: [0.7, 0.3], pose: 'stand' }
  if (s.asset === 'sofa') return { A: [s.x - 0.6, s.z + 0.12], B: [s.x + 0.66, s.z + 0.12], pose: 'sit' }
  if (s.asset === 'bed') return { A: [s.x - 0.45, s.z + 0.55], B: [s.x + 0.45, s.z + 0.75], pose: 'sit' }
  if (s.asset === 'dining_table') return { A: [s.x - 0.55, s.z + 0.62], B: [s.x + 0.55, s.z - 0.62], pose: 'sit' }
  return { A: [s.x - 0.5, s.z + 0.8], B: [s.x + 0.6, s.z + 0.5], pose: 'stand' }
}

function frontCam(room, focus, dist, height) {
  const z = Math.min(room.d / 2 - 0.35, focus[1] + dist)
  return [focus[0], height, z]
}

function recipeTrapped(ctx) {
  const { room, base, kit, brief } = ctx
  const an = anchors(room, base)
  const objects = base.map((o) => ({ ...o }))
  const notes = []
  let lamp = an.lamp
  const sp = seatPositions(an, room)
  if (!lamp) {
    lamp = { id: newId('obj'), asset: 'floor_lamp', x: sp.B[0] + 0.75, z: sp.B[1] - 0.45, y: 0, rot: 0, layer: 'dressing', source: 'ai' }
    objects.push(lamp)
    notes.push('Added a floor lamp beside her to motivate the key.')
  }
  if (an.table && !objects.some((o) => o.asset === 'tabletop_props')) objects.push(placeOnTable(an.table, 'tabletop_props'))
  if (an.seat && an.seat.asset === 'sofa' && !objects.some((o) => o.asset === 'rug')) objects.push({ id: newId('obj'), asset: 'rug', x: an.seat.x, z: an.seat.z + 0.85, y: 0, rot: 0, layer: 'dressing', source: 'ai' })
  if (an.winIn && !objects.some((o) => o.asset === 'plant_small')) objects.push({ id: newId('obj'), asset: 'plant_small', x: an.winIn[0] - (an.win.wall === 'W' ? 0.45 : 0), z: an.winIn[1] + (an.win.wall === 'N' ? -0.45 : 0), y: 0, rot: 0, layer: 'dressing', source: 'ai' })

  const actors = ctx.actors.map((a, i) => ({ ...a, pose: sp.pose, x: r2((i ? sp.B : sp.A)[0]), z: r2((i ? sp.B : sp.A)[1]), rot: i ? -0.45 : 0.45 }))
  const A = actors[0], B = actors[1] || actors[0]
  const mid = [(A.x + B.x) / 2, 0.95, (A.z + B.z) / 2]
  const cams = [
    camera('A', frontCam(room, [mid[0], mid[2]], 2.9, 1.2), mid, 32, 'Medium two-shot'),
    camera('B', [A.x - 0.35, 1.15, Math.min(room.d / 2 - 0.4, A.z + 1.9)], actorFace(B), 65, 'Close-up on ' + B.name),
  ]
  const lampTop = [lamp.x, 1.95, lamp.z + 0.35]
  const wants = [
    { kind: 'softkey', role: 'key', label: 'Key, lamp side', pos: lampTop, aim: actorFace(B), intensity: 0.6, stops: 0.1, cct: 3000, diffusion: 0.8 },
    brief.time === 'day'
      ? { kind: 'moon', role: 'rim', label: 'Window daylight', pos: an.winOut ? [an.winOut[0], 2.1, an.winOut[1]] : [-room.w / 2 + 0.4, 2.1, 0], aim: actorFace(A), intensity: 0.85, stops: 0.5, cct: 5600 }
      : { kind: 'moon', role: 'rim', label: 'Moonlight edge', pos: an.winIn ? [an.winIn[0], 2.15, an.winIn[1]] : [-room.w / 2 + 0.4, 2.15, 0], aim: actorFace(A), intensity: 0.5, stops: -0.8, cct: 5600 },
    { kind: 'fill', role: 'fill', label: 'Bounce fill', pos: [mid[0] - 1.5, 0.9, mid[2] + 1.1], aim: actorFace(A), intensity: 0.5, stops: -1.6, cct: 3200 },
  ]
  const { lights, dropped } = allocate(kit, wants)
  dropped.forEach((d) => notes.push(`No unit left for the ${d.label.toLowerCase()}; the plan works without it.`))
  return {
    key: 'trapped',
    name: 'Trapped',
    mood: 'A warm pool around the couch, cold night at the window. She sits closest to the door and stays.',
    difficulty: 'Medium', setupMin: 40,
    why: [
      { layer: 'Dressing', ref: 'Motivated practical', text: 'The floor lamp beside her is the visible source, so the key light has a reason to be there.' },
      { layer: 'Blocking', ref: 'Frame within a frame', text: 'Her close-up holds the door edge behind her: the exit is always in shot.' },
      { layer: 'Lighting', ref: 'Warm / cool split', text: 'A 3000 K key against a 5600 K edge separates the room from the night outside.' },
    ],
    notes,
    scene: { objects, actors, cameras: cams, lights: lights.map((w) => makeLight(w, room)), activeCam: 'cam_a' },
  }
}

function recipeColdWar(ctx) {
  const { room, base, kit, brief } = ctx
  const an = anchors(room, base)
  const notes = []
  const objects = base.filter((o) => !getAsset(o.asset)?.tags?.includes('clutter') && o.asset !== 'rug').map((o) => ({ ...o }))
  const removed = base.length - objects.length
  if (removed) notes.push(`Cleared ${removed} small prop${removed > 1 ? 's' : ''} to leave negative space.`)
  const sp = seatPositions(an, room)
  const standAt = an.winIn || [room.w / 2 - 0.9, -room.d / 2 + 1.0]
  // a second, separate seat near the window
  if (!objects.some((o) => o.asset === 'armchair') && an.seat?.asset === 'sofa') {
    objects.push({ id: newId('obj'), asset: 'armchair', x: r2(standAt[0] + (an.win?.wall === 'W' ? 0.35 : 0)), z: r2(standAt[1] + 0.9), y: 0, rot: an.win?.wall === 'W' ? Math.PI / 2 : 0, layer: 'dressing', source: 'ai' })
  }
  const actors = ctx.actors.map((a, i) => i === 0
    ? { ...a, pose: sp.pose, x: r2(sp.A[0]), z: r2(sp.A[1]), rot: -0.2 }
    : { ...a, pose: 'stand', x: r2(standAt[0] + (an.win?.wall === 'W' ? 0.1 : 0)), z: r2(standAt[1] + 0.15), rot: an.win?.wall === 'W' ? -1.2 : Math.PI })
  const A = actors[0], B = actors[1] || actors[0]
  const corner = [room.w / 2 - 0.45, 1.55, room.d / 2 - 0.45]
  const mid = [(A.x + B.x) / 2, 1.0, (A.z + B.z) / 2]
  const cams = [
    camera('A', corner, mid, 24, 'Wide, locked off'),
    camera('B', [A.x + 0.4, 1.1, Math.min(room.d / 2 - 0.4, A.z + 2.1)], actorFace(A), 50, 'Single on ' + A.name),
  ]
  const wants = [
    { kind: 'top', role: 'ambient', label: 'Soft top light', pos: [A.x + 0.5, Math.min(room.h - 0.25, 2.35), A.z + 0.9], aim: actorFace(A), intensity: 0.38, stops: -0.5, cct: 4300, diffusion: 1 },
    brief.time === 'day'
      ? { kind: 'moon', role: 'key', label: 'Window daylight', pos: an.winOut ? [an.winOut[0], 2.0, an.winOut[1]] : [0, 2.0, -room.d / 2 + 0.3], aim: actorFace(B), intensity: 0.9, stops: 0.4, cct: 5600 }
      : { kind: 'moon', role: 'key', label: 'Moonlight key', pos: an.winIn ? [an.winIn[0] - 0.2, 2.2, an.winIn[1] + 0.2] : [0, 2.2, -room.d / 2 + 0.4], aim: actorFace(B), intensity: 0.48, stops: -0.3, cct: 5600 },
  ]
  const { lights, dropped } = allocate(kit, wants)
  dropped.forEach((d) => notes.push(`No unit left for the ${d.label.toLowerCase()}.`))
  const lampOff = objects.find((o) => getAsset(o.asset)?.practical)
  if (lampOff) { lampOff.on = false; notes.push('Practical lamp switched off: the room should feel unlived-in.') }
  return {
    key: 'coldwar',
    name: 'Cold war',
    mood: 'They are in different corners of the same room. Flat, cool light and a lot of floor between them.',
    difficulty: 'Easy', setupMin: 20,
    why: [
      { layer: 'Dressing', ref: 'Negative space', text: 'Small props and the rug come out; an armchair by the window gives her somewhere else to be.' },
      { layer: 'Blocking', ref: 'Distance as relationship', text: 'A locked-off wide shot keeps both of them small and far apart.' },
      { layer: 'Lighting', ref: 'Low-contrast ambience', text: 'One soft top source plus window light: nobody is singled out, nobody is safe.' },
    ],
    notes,
    scene: { objects, actors, cameras: cams, lights: lights.map((w) => makeLight(w, room)), activeCam: 'cam_a' },
  }
}

function recipeBoiling(ctx) {
  const { room, base, kit } = ctx
  const an = anchors(room, base)
  const notes = []
  const objects = base.map((o) => ({ ...o }))
  // pull a table into the middle as an obstacle
  let table = objects.find((o) => ['dining_table', 'coffee_round', 'desk'].includes(o.asset))
  if (!table) {
    let spot = null, asset = 'dining_table'
    for (const [a, size, clear] of [['dining_table', [1.6, 0.9], 2.2], ['dining_table', [1.6, 0.9], 1.4], ['side_table', [0.45, 0.45], 1.8], ['side_table', [0.45, 0.45], 0.9]]) {
      spot = freeSpot(room, objects, size, clear)
      if (spot) { asset = a; break }
    }
    spot = spot || [0, room.d / 4]
    table = { id: newId('obj'), asset, x: spot[0], z: spot[1], y: 0, rot: 0, layer: 'dressing', source: 'ai' }
    objects.push(table)
    notes.push(asset === 'dining_table' ? 'Added a table as the barrier between them.' : 'Not enough floor for a table: a side table marks the line between them.')
  } else if (table.asset === 'coffee_round') {
    table.x = r2(an.seat ? an.seat.x : 0)
    table.z = r2((an.seat ? an.seat.z : 0) + 1.35)
    notes.push('Pulled the coffee table forward so it sits between them.')
  }
  const tz = table.z
  const actors = ctx.actors.map((a, i) => ({ ...a, pose: 'stand', x: r2(table.x + (i ? 0.95 : -0.95)), z: r2(tz + (i ? -0.05 : 0.05)), rot: i ? -Math.PI / 2 : Math.PI / 2 }))
  const A = actors[0], B = actors[1] || actors[0]
  const cams = [
    camera('A', [A.x - 0.25, 1.6, A.z + 0.85], actorFace(B), 50, 'Over ' + A.name + '’s shoulder'),
    camera('B', [B.x + 0.25, 1.6, B.z + 0.85], actorFace(A), 50, 'Over ' + B.name + '’s shoulder'),
  ]
  const wants = [
    { kind: 'hardkey', role: 'key', label: 'Hard side key', pos: [table.x - 0.3, Math.min(room.h - 0.25, 2.25), tz - 1.4], aim: actorFace(A), intensity: 0.55, stops: 0.4, cct: 3200, diffusion: 0.1 },
    { kind: 'back', role: 'back', label: 'Backlight', pos: [table.x + 1.9, 2.1, tz - 1.0], aim: actorFace(B), intensity: 0.6, stops: -0.2, cct: 3200, diffusion: 0.2 },
  ]
  const { lights, dropped } = allocate(kit, wants)
  dropped.forEach((d) => notes.push(`No unit left for the ${d.label.toLowerCase()}.`))
  if (!kit.fresnel) notes.push('No Fresnel in your kit: the panel runs without diffusion for a harder edge.')
  return {
    key: 'boiling',
    name: 'Boiling point',
    mood: 'Standing, a table between them, hard light and long shadows on the wall. Nobody sits down.',
    difficulty: 'Hard', setupMin: 50,
    why: [
      { layer: 'Dressing', ref: 'Obstacle in frame', text: 'The table becomes the line neither of them crosses.' },
      { layer: 'Blocking', ref: 'Over-the-shoulder reverses', text: 'Matched 50 mm overs on the same side of the line keep the eyelines locked.' },
      { layer: 'Lighting', ref: 'Hard side light', text: 'Undiffused key from high and to the side; no fill, so half of each face falls away.' },
    ],
    notes,
    scene: { objects, actors, cameras: cams, lights: lights.map((w) => makeLight(w, room)), activeCam: 'cam_a' },
  }
}

const RECIPES = [recipeTrapped, recipeColdWar, recipeBoiling]

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

// synchronous version for the landing page and previews
export function sampleScene(baseScene, kit, brief, which = 0) {
  const ctx = { room: baseScene.room, base: baseScene.objects, actors: baseScene.actors, kit, brief }
  const d = RECIPES[which](ctx)
  let scene = { ...baseScene, ...d.scene }
  for (const c of runChecks(scene, kit)) {
    if (c.fix && (c.fix.type === 'pushOutOfFrame' || c.fix.type === 'mirrorCam')) scene = applyFix(scene, c.fix)
  }
  return fitCameraSettings(scene).scene
}

// order directions by what the brief asks for
function rank(text) {
  const t = (text || '').toLowerCase()
  const score = [0, 0, 0]
  if (/(trap|leave|door|warm|intimate|close|stay|离开|门|温暖)/.test(t)) score[0] += 2
  if (/(lonely|distance|cold|silent|apart|empty|孤独|距离|冷|沉默)/.test(t)) score[1] += 2
  if (/(fight|angry|shout|explode|hard|confront|吵|愤怒|爆发|对峙)/.test(t)) score[2] += 2
  return [0, 1, 2].sort((a, b) => score[b] - score[a])
}

// ---------------- pipeline: plan → design → validate → review ----------------

export async function generateDirections({ setup, baseScene }, onEvent) {
  const kit = setup.kit
  const ctx = { room: baseScene.room, base: baseScene.objects, actors: baseScene.actors, kit, brief: setup.brief }
  const order = rank(setup.brief.text)
  onEvent({ type: 'stage', stage: 'plan', text: `Planning ${order.length} directions that differ in mood, style and gear load` })
  await wait(1100)
  onEvent({ type: 'plan', names: order.map((i) => ['Trapped', 'Cold war', 'Boiling point'][i]) })
  const results = []
  for (const [n, idx] of order.entries()) {
    onEvent({ type: 'stage', stage: 'design', index: n, text: `Designing dressing, blocking and lighting` })
    await wait(900 + n * 500)
    const d = RECIPES[idx](ctx)
    let scene = { ...baseScene, ...d.scene }
    onEvent({ type: 'stage', stage: 'validate', index: n, text: 'Checking gear, stands in frame, exposure and the 180° line' })
    await wait(650)
    // real checks + one deterministic repair round
    let issues = runChecks(scene, kit).filter((c) => c.level !== 'ok')
    const repaired = []
    for (const c of issues) {
      if (c.fix && (c.fix.type === 'pushOutOfFrame' || c.fix.type === 'mirrorCam')) {
        scene = applyFix(scene, c.fix)
        repaired.push(c.title)
      }
    }
    const fit = fitCameraSettings(scene)
    if (fit.changed) { scene = fit.scene; d.notes.push(`Your kit is light on output: shoot at T${scene.tstop}, ISO ${scene.iso}.`) }
    issues = runChecks(scene, kit).filter((c) => c.level !== 'ok')
    onEvent({ type: 'stage', stage: 'review', index: n, text: 'Reviewing as a DP: does every layer tell the same story?' })
    await wait(550)
    const dir = {
      id: newId('dir'), key: d.key, name: d.name, mood: d.mood, difficulty: d.difficulty, setupMin: d.setupMin,
      why: d.why, notes: d.notes, repaired, openIssues: issues.map((i) => ({ level: i.level, title: i.title })),
      gearUse: scene.lights.reduce((m, l) => ({ ...m, [l.fixture]: (m[l.fixture] || 0) + 1 }), {}),
      layers: {
        dressing: scene.objects,
        blocking: { actors: scene.actors, cameras: scene.cameras, activeCam: scene.activeCam },
        lighting: { lights: scene.lights, practicals: scene.objects.filter((o) => getAsset(o.asset)?.practical).map((o) => ({ id: o.id, on: o.on !== false })) },
      },
      scene,
    }
    results.push(dir)
    onEvent({ type: 'direction', direction: dir })
  }
  onEvent({ type: 'done' })
  return results
}

// mix layers from different directions
export function mixDirections(base, pick, dirs) {
  const by = (id) => dirs.find((d) => d.id === id)
  const D = by(pick.dressing), B = by(pick.blocking), L = by(pick.lighting)
  let objects = D.layers.dressing.map((o) => ({ ...o }))
  // carry practical on/off from the lighting direction when the same object exists
  for (const p of L.layers.lighting.practicals) {
    const o = objects.find((x) => x.id === p.id)
    if (o) o.on = p.on
  }
  const scene = {
    ...base,
    objects,
    actors: B.layers.blocking.actors,
    cameras: B.layers.blocking.cameras,
    activeCam: B.layers.blocking.activeCam,
    lights: L.layers.lighting.lights.map((l) => ({ ...l })),
  }
  // re-aim lights at the nearest actor face of the new blocking
  for (const l of scene.lights) {
    if (!scene.actors.length) break
    let best = scene.actors[0], bd = 1e9
    for (const a of scene.actors) {
      const dd = Math.hypot(a.x - l.aim[0], a.z - l.aim[2])
      if (dd < bd) { bd = dd; best = a }
    }
    if (l.role !== 'ambient') l.aim = actorFace(best)
  }
  return scene
}

// ---------------- natural-language edits ----------------

const has = (t, re) => re.test(t)

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
  await wait(700 + Math.random() * 500)
  const t = text.toLowerCase().trim()
  const s = structuredClone(scene)
  const changed = new Set()
  const parts = []
  let ref = null
  const who = subjectActor(t, s, hintActor)

  const scaleLights = (k, filter = () => true) => s.lights.filter(filter).forEach((l) => { l.intensity = Math.max(0.05, Math.min(1, +(l.intensity * k).toFixed(2))); changed.add(l.id) })

  if (has(t, /(face|脸).*(dark|暗)|too dark on|(dark|暗).*(face|脸)|看不清/)) {
    const a = who || s.actors[1] || s.actors[0]
    const l = nearestLight(s, a, ['key', 'rim', 'ambient'])
    if (l) {
      l.intensity = Math.min(1, +(l.intensity * 1.45 + 0.08).toFixed(2))
      l.aim = actorFace(a)
      changed.add(l.id)
      parts.push(`Raised the ${l.label?.toLowerCase() || 'key'} to ${Math.round(l.intensity * 100)}% and re-aimed it at ${a.name}`)
      ref = 'Key-to-face exposure'
    }
  } else if (has(t, /(darker|moodier|low.?key|more contrast|暗一点|更暗|压暗|低调)/)) {
    scaleLights(0.7, (l) => l.role !== 'key')
    scaleLights(0.85, (l) => l.role === 'key')
    parts.push('Brought fill and ambience down 30% and the key down 15%')
    ref = 'Low-key ratio'
  } else if (has(t, /(brighter|lift|more light|亮一点|更亮|提亮)/)) {
    scaleLights(1.3)
    parts.push('Raised every unit by 30%')
  }

  if (has(t, /(warmer|warm|暖)/)) {
    const k = s.lights.filter((l) => l.role === 'key')
    ;(k.length ? k : s.lights).forEach((l) => { l.cct = Math.max(FIXTURES[l.fixture].cctMin, l.cct - 500); changed.add(l.id) })
    parts.push('Shifted the key 500 K warmer')
    ref = ref || 'Warm / cool split'
  }
  if (has(t, /(cooler|colder|cool|cold|冷)/)) {
    s.lights.filter((l) => l.role !== 'key').forEach((l) => { l.cct = Math.min(FIXTURES[l.fixture].cctMax, l.cct + 700); changed.add(l.id) })
    parts.push('Pushed the edge and ambience 700 K cooler')
    ref = ref || 'Warm / cool split'
  }

  if (has(t, /(door|门)/) && who) {
    const door = s.room.openings.find((o) => o.type === 'door')
    if (door) {
      const c = openingCenter(s.room, door), f = wallFrame(s.room, door.wall)
      const tgt = [c[0] + f.n[0] * 0.9, c[1] + f.n[1] * 0.9]
      who.x = +(who.x + (tgt[0] - who.x) * 0.6).toFixed(2)
      who.z = +(who.z + (tgt[1] - who.z) * 0.6).toFixed(2)
      who.pose = 'stand'
      changed.add(who.id)
      parts.push(`Moved ${who.name} toward the door, standing`)
      ref = ref || 'Blocking toward the exit'
    }
  }
  if (has(t, /(window|窗)/) && who && !has(t, /(light|光)/)) {
    const win = s.room.openings.find((o) => o.type === 'window')
    if (win) {
      const c = openingCenter(s.room, win), f = wallFrame(s.room, win.wall)
      who.x = +(c[0] + f.n[0] * 0.75).toFixed(2)
      who.z = +(c[1] + f.n[1] * 0.75).toFixed(2)
      who.pose = 'stand'
      changed.add(who.id)
      parts.push(`Moved ${who.name} to the window`)
    }
  }
  if (has(t, /(apart|further|lonely|distance|分开|远一点|孤独)/) && s.actors.length > 1) {
    const [A, B] = s.actors
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1
    B.x = +(B.x + (dx / L) * 0.7).toFixed(2); B.z = +(B.z + (dz / L) * 0.7).toFixed(2)
    clampToRoom(s.room, B, 0.4)
    changed.add(B.id)
    parts.push(`Moved ${B.name} 0.7 m further from ${A.name}`)
    ref = ref || 'Distance as relationship'
  }
  if (has(t, /(closer together|together|靠近|近一点)/) && s.actors.length > 1) {
    const [A, B] = s.actors
    B.x = +(B.x + (A.x - B.x) * 0.35).toFixed(2); B.z = +(B.z + (A.z - B.z) * 0.35).toFixed(2)
    changed.add(B.id)
    parts.push(`Brought ${B.name} closer to ${A.name}`)
  }

  const addProp = (asset, label, near) => {
    const a = near || who || s.actors[0]
    const o = { id: newId('obj'), asset, x: +(a.x + 0.7).toFixed(2), z: +(a.z - 0.5).toFixed(2), y: 0, rot: 0, layer: 'dressing', source: 'ai' }
    clampToRoom(s.room, o, 0.35)
    s.objects.push(o)
    changed.add(o.id)
    parts.push(`Added a ${label}`)
  }
  if (has(t, /(plant|植物|绿植)/)) addProp('plant_tall', 'plant beside ' + (who?.name || 'the actors'))
  if (has(t, /(lamp|practical|台灯|落地灯)/) && !has(t, /(off|关)/)) { addProp('floor_lamp', 'practical floor lamp'); ref = ref || 'Motivated practical' }
  if (has(t, /(rug|地毯)/)) { const seat = s.objects.find((o) => o.asset === 'sofa'); addProp('rug', 'rug', seat ? { x: seat.x - 0.7, z: seat.z + 1.3 } : null) }
  if (has(t, /(art|picture|painting|挂画|画)/)) addProp('wall_art', 'framed print')
  if (has(t, /(clean|clear|declutter|simpler|minimal|简洁|干净|清空)/)) {
    const before = s.objects.length
    s.objects = s.objects.filter((o) => !(getAsset(o.asset)?.tags?.includes('clutter') || o.asset === 'plant_small' || o.asset === 'wall_art'))
    parts.push(`Removed ${before - s.objects.length} small props`)
    ref = ref || 'Negative space'
  }
  if (has(t, /(lamp|practical|台灯|灯).*(off|关)|turn off the lamp|关灯/)) {
    s.objects.forEach((o) => { if (getAsset(o.asset)?.practical) { o.on = false; changed.add(o.id) } })
    parts.push('Switched the practicals off')
  }

  const cam = s.cameras.find((c) => c.id === s.activeCam) || s.cameras[0]
  if (cam) {
    if (has(t, /(close.?up|closer shot|tighter|特写|近景)/)) {
      cam.focal = Math.min(100, Math.round(cam.focal * 1.6)); changed.add(cam.id)
      cam.shot = 'Close-up'
      parts.push(`Cam ${cam.label} to ${cam.focal} mm`)
    } else if (has(t, /(wider|wide shot|wide|全景|广角)/)) {
      cam.focal = Math.max(18, Math.round(cam.focal / 1.6)); changed.add(cam.id)
      cam.shot = 'Wide'
      parts.push(`Cam ${cam.label} to ${cam.focal} mm`)
    }
    if (has(t, /(low angle|lower|仰拍|低机位)/)) { cam.y = Math.max(0.5, +(cam.y - 0.4).toFixed(2)); changed.add(cam.id); parts.push(`Cam ${cam.label} down to ${cam.y} m`) }
    if (has(t, /(high angle|higher|俯拍|高机位)/)) { cam.y = Math.min(2.3, +(cam.y + 0.45).toFixed(2)); changed.add(cam.id); parts.push(`Cam ${cam.label} up to ${cam.y} m`) }
  }
  if (has(t, /(rim|edge|backlight|轮廓|逆光)/)) {
    const l = s.lights.find((x) => x.role === 'rim' || x.role === 'back')
    if (l) { l.intensity = Math.min(1, +(l.intensity + 0.2).toFixed(2)); changed.add(l.id); parts.push('Raised the edge light') }
    else parts.push('No spare unit for an edge light in this kit')
  }

  if (!parts.length) {
    return {
      ok: false,
      message: 'I couldn’t turn that into a set change.',
      suggestions: ['Her face is too dark', 'Make it moodier', 'Move her closer to the door', 'Add a practical lamp', 'Tighter on cam A', 'Clear the clutter'],
    }
  }
  const issues = runChecks(s, kit).filter((c) => c.level !== 'ok')
  return {
    ok: true,
    summary: parts.join('. ') + '.',
    ref,
    changed: [...changed],
    scene: s,
    issues: issues.slice(0, 3).map((i) => i.title),
  }
}

// ---------------- simulated reference frame ----------------
// Real version: viewport screenshot + prompt + preserve list → image-edit model.
// Simulated version: the engine renders the camera view and we grade it like a film still.

export async function generateReference(engine, scene, { width = 1280 } = {}) {
  await wait(1600 + Math.random() * 900)
  const aspect = { '2.39': 2.39, '1.85': 1.85, '16:9': 16 / 9 }[scene.aspect] || 2.39
  const h = Math.round(width / aspect)
  const src = engine.snapshot(width, h)
  const c = document.createElement('canvas')
  c.width = width; c.height = h
  const g = c.getContext('2d')
  // warm/cool balance from the plan
  const keyCct = (scene.lights.find((l) => l.role === 'key') || scene.lights[0] || { cct: 4300 }).cct
  const warm = keyCct < 4300
  g.filter = `contrast(1.12) saturate(${warm ? 1.15 : 0.9}) brightness(1.04)`
  g.drawImage(src, 0, 0, width, h)
  g.filter = 'none'
  // bloom from highlights
  g.globalCompositeOperation = 'screen'
  g.globalAlpha = 0.35
  g.filter = 'blur(18px) brightness(1.3)'
  g.drawImage(src, 0, 0, width, h)
  g.filter = 'none'
  g.globalAlpha = 1
  // split tone
  g.globalCompositeOperation = 'soft-light'
  const grad = g.createLinearGradient(0, 0, width, h)
  grad.addColorStop(0, warm ? 'rgba(40,70,110,0.35)' : 'rgba(30,60,100,0.45)')
  grad.addColorStop(1, warm ? 'rgba(255,170,90,0.35)' : 'rgba(150,180,200,0.2)')
  g.fillStyle = grad
  g.fillRect(0, 0, width, h)
  // vignette
  g.globalCompositeOperation = 'multiply'
  const v = g.createRadialGradient(width / 2, h / 2, h * 0.35, width / 2, h / 2, width * 0.62)
  v.addColorStop(0, 'rgba(255,255,255,1)')
  v.addColorStop(1, 'rgba(60,60,60,1)')
  g.fillStyle = v
  g.fillRect(0, 0, width, h)
  // grain
  g.globalCompositeOperation = 'overlay'
  const noise = g.createImageData(width, h)
  for (let i = 0; i < noise.data.length; i += 4) {
    const n = 128 + (Math.random() - 0.5) * 38
    noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = n
    noise.data[i + 3] = 40
  }
  const nc = document.createElement('canvas')
  nc.width = width; nc.height = h
  nc.getContext('2d').putImageData(noise, 0, 0)
  g.drawImage(nc, 0, 0)
  g.globalCompositeOperation = 'source-over'
  return c.toDataURL('image/jpeg', 0.86)
}
