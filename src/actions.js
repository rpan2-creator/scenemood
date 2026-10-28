import { getState, setState, commitScene, emptyScene, newId, navigate, setSceneStatus, logSuggestion, activeProject, activeSceneMeta } from './store.js'
import { generateDirections, moreVariants, interpretCommand, mixDirections, qcReference } from './ai/sim.js'
import { applyFix, stopsAt } from './engine/checks.js'
import { renderStill } from './engine/SceneEngine.js'
import { FIXTURES } from './data/gear.js'
import { getAsset } from './data/assets.js'

export const engineRef = { current: null }

// ---------------------------------------------------------------- stills (cached in memory)
const stills = new Map()
const stillListeners = new Set()
export const onStill = (fn) => { stillListeners.add(fn); return () => stillListeners.delete(fn) }
export function stillFor(dir, w = 720) {
  const key = dir.id + w
  if (stills.has(key)) return stills.get(key)
  stills.set(key, null)
  renderStill(dir.scene, { w }).then((url) => { stills.set(key, url); stillListeners.forEach((l) => l(key)) })
  return null
}

// ---------------------------------------------------------------- directions

let genToken = 0
export async function runGeneration() {
  const token = ++genToken
  const { setup } = getState()
  const base = emptyScene(setup)
  const t0 = Date.now()
  setState({ directions: [], gen: { status: 'running', stage: 'plan', index: -1, plan: [], log: [] }, baseScene: base, firstDirectionAt: null })
  setSceneStatus('directions')
  await generateDirections({ setup, baseScene: base, count: 4 }, (ev) => {
    if (token !== genToken) return
    setState((s) => {
      const gen = { ...s.gen }
      if (ev.type === 'stage') { gen.stage = ev.stage; gen.index = ev.index ?? -1; gen.log = [...gen.log, ev.text] }
      if (ev.type === 'plan') gen.plan = ev.names
      if (ev.type === 'done') { gen.status = 'done'; gen.stage = 'done' }
      const directions = ev.type === 'direction' ? [...s.directions, ev.direction] : s.directions
      const firstDirectionAt = ev.type === 'direction' && !s.firstDirectionAt ? { ms: Date.now() - (s.setup.startedAt || t0), gen: Date.now() - t0 } : s.firstDirectionAt
      return { gen, directions, firstDirectionAt }
    })
    if (ev.type === 'direction') stillFor(ev.direction)
  })
}

export async function runVariants(key) {
  const { setup, baseScene, directions } = getState()
  const base = baseScene || emptyScene(setup)
  setState((s) => ({ gen: { ...s.gen, variantFor: key } }))
  await moreVariants({ setup, baseScene: base, key, existing: directions }, (ev) => {
    if (ev.type === 'direction') {
      setState((s) => ({ directions: [...s.directions, ev.direction] }))
      stillFor(ev.direction)
    }
  })
  setState((s) => ({ gen: { ...s.gen, variantFor: null } }))
  toast('Two variants added')
}

export function openDirection(dir) {
  setState({ scene: structuredClone(dir.scene), activeDirection: dir.id, history: [], future: [], selection: null, pending: null })
  setSceneStatus('studio')
  navigate('/studio')
}

export function openMix(pick) {
  const { directions, baseScene, setup } = getState()
  const base = baseScene || emptyScene(setup)
  const scene = mixDirections(base, pick, directions)
  setState({ scene, activeDirection: 'mix', history: [], future: [], selection: null, pending: null })
  setSceneStatus('studio')
  navigate('/studio')
}

// learning mode: start from the room and the actors only; the student lights it first
export function startLearning() {
  const { setup } = getState()
  const base = emptyScene(setup)
  base.actors = base.actors.map((a, i) => ({ ...a, x: -0.55 + i * 1.15, z: (setup.objects.find((o) => o.asset === 'sofa')?.z ?? -1.6) + 0.1 }))
  base.cameras = [{ id: 'cam_a', label: 'A', x: 0, y: 1.2, z: Math.min(setup.room.d / 2 - 0.4, 1.4), aim: [0, 1.0, -1.5], focal: 35, shot: 'Your first angle', source: 'user' }]
  base.activeCam = 'cam_a'
  setState({ scene: base, activeDirection: 'learning', learning: true, history: [], future: [], selection: null, pending: null })
  setSceneStatus('studio')
  navigate('/studio')
}

// ---------------------------------------------------------------- natural-language edits

export async function sendCommand(text, opts = {}) {
  const { scene, setup } = getState()
  if (!scene || !text.trim()) return
  setState((s) => ({ aiLog: [...s.aiLog, { id: newId('msg'), role: 'user', text, at: Date.now(), source: opts.source || 'command' }], thinking: true, pending: null }))
  const res = await interpretCommand(text, scene, { kit: setup.kit, hintActor: opts.hintActor })
  if (!res.ok) {
    setState((s) => ({ thinking: false, aiLog: [...s.aiLog, { id: newId('msg'), role: 'ai', ok: false, text: res.message, suggestions: res.suggestions }] }))
    return
  }
  setState((s) => ({
    thinking: false,
    pending: { scene: res.scene, changed: res.changed, summary: res.summary, ref: res.ref, issues: res.issues, prompt: text, source: opts.source || 'command' },
    aiLog: [...s.aiLog, { id: newId('msg'), role: 'ai', ok: true, text: res.summary, ref: res.ref }],
  }))
}

export function acceptPending() {
  const { pending } = getState()
  if (!pending) return
  commitScene(pending.scene, 'AI: ' + pending.prompt, { ai: true })
  logSuggestion({ why: { ref: pending.ref || pending.prompt } }, 'accepted', 'lights')
  setState((s) => ({ pending: null, comments: pending.commentId ? s.comments.map((c) => (c.id === pending.commentId ? { ...c, resolved: true } : c)) : s.comments }))
  toast('Change accepted')
}

export function discardPending() {
  const { pending } = getState()
  if (pending) logSuggestion({ why: { ref: pending.ref || pending.prompt } }, 'rejected', 'lights')
  setState({ pending: null })
}

export function fixIssue(fix) {
  const { scene } = getState()
  commitScene(applyFix(scene, fix), fix.label)
  toast(fix.label)
}

// ---------------------------------------------------------------- reference frames + QC

export async function makeReference({ hd = false } = {}) {
  const { scene, activeDirection, directions, usage } = getState()
  if (!scene || !scene.activeCam) return
  if (hd && usage.hdFrames >= usage.hdQuota) { toast('Monthly HD frames used up. Drafts are still free.'); hd = false }
  const cam = scene.cameras.find((c) => c.id === scene.activeCam)
  const id = newId('ref')
  const dirName = directions.find((d) => d.id === activeDirection)?.name || (activeDirection === 'mix' ? 'Mix' : 'Custom')
  setState((s) => ({ frames: [...s.frames, { id, status: 'running', stage: 'Rendering the lens view', cam: cam.label, focal: cam.focal, dir: dirName, hd, at: Date.now() }] }))
  await new Promise((r) => setTimeout(r, 400))
  const url = await renderStill(scene, { w: hd ? 1600 : 900 })
  setState((s) => ({ frames: s.frames.map((f) => (f.id === id ? { ...f, stage: 'Checking the frame against the plan' } : f)) }))
  const qc = await qcReference(scene)
  setState((s) => ({
    frames: s.frames.map((f) => (f.id === id ? { ...f, status: 'done', url, qc } : f)),
    usage: hd ? { ...s.usage, hdFrames: s.usage.hdFrames + 1 } : s.usage,
  }))
}

// ---------------------------------------------------------------- comments, votes, review

export function addComment({ text, target, x, y, author, frame }) {
  setState((s) => ({ comments: [...s.comments, { id: newId('cmt'), text, target, x, y, frame, author: author || s.user?.name || 'You', at: Date.now(), resolved: false }] }))
}

export async function commentToAI(comment) {
  await sendCommand(comment.text + (comment.target?.name ? ` (on ${comment.target.name})` : ''), { hintActor: comment.target?.kind === 'actors' ? comment.target.id : undefined, source: 'comment' })
  setState((s) => ({ pending: s.pending ? { ...s.pending, commentId: comment.id } : s.pending }))
}

export function vote(dirId, who = 'You') {
  setState((s) => {
    const votes = { ...(s.votes || {}) }
    for (const k of Object.keys(votes)) votes[k] = (votes[k] || []).filter((n) => n !== who)
    votes[dirId] = [...(votes[dirId] || []), who]
    return { votes }
  })
}

// share link: the whole plan compressed into the URL, so it opens without an account
async function deflate(str) {
  const cs = new CompressionStream('deflate-raw')
  const buf = await new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer()
  let bin = ''
  new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function inflate(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const ds = new DecompressionStream('deflate-raw')
  return new Response(new Blob([bytes]).stream().pipeThrough(ds)).text()
}

export async function shareLink() {
  const s = getState()
  const proj = activeProject(s), meta = activeSceneMeta(s)
  const dir = s.directions.find((d) => d.id === s.activeDirection)
  const payload = {
    v: 1, project: proj?.name, scene: meta ? `Scene ${meta.num} · ${meta.name}` : 'Scene', direction: dir ? { name: dir.name, mood: dir.mood, why: dir.why } : null,
    plan: s.scene, kit: s.setup.kit, from: s.user?.name || 'The director',
    options: s.directions.slice(0, 4).map((d) => ({ id: d.id, name: d.name, mood: d.mood, scene: d.scene })),
  }
  const code = await deflate(JSON.stringify(payload))
  return `${location.origin}${location.pathname}#/share/${code}`
}

// ---------------------------------------------------------------- exports

function download(name, text, type = 'text/csv') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
export function exportShotList() {
  const s = getState()
  const meta = activeSceneMeta(s)
  const rows = [['Scene', 'Shot', 'Camera', 'Description', 'Lens (mm)', 'Height (m)', 'Position x', 'Position z', 'Subject', 'T-stop', 'ISO', 'Aspect', 'Lighting setup']]
  const lights = s.scene.lights.map((l) => `${l.label || l.role}: ${FIXTURES[l.fixture]?.name} ${Math.round(l.intensity * 100)}% ${l.cct}K`).join('; ')
  s.scene.cameras.forEach((c, i) => {
    const subj = s.scene.actors.reduce((best, a) => { const d = Math.hypot(a.x - c.aim[0], a.z - c.aim[2]); return d < best.d ? { a, d } : best }, { a: null, d: 1e9 }).a
    rows.push([meta?.num || '', `${meta?.num || ''}${String.fromCharCode(65 + i)}`, c.label, c.shot, c.focal, c.y, c.x, c.z, subj?.name || '', s.scene.tstop, s.scene.iso, s.scene.aspect + ':1', lights])
  })
  download(`shot-list-scene-${meta?.num || 'x'}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'))
  toast('Shot list exported as CSV')
}

export function exportGearList() {
  const s = getState()
  const used = {}
  s.scene.lights.forEach((l) => { used[l.fixture] = (used[l.fixture] || 0) + 1 })
  const rows = [['Item', 'Spec', 'Quantity', 'In kit', 'Short by']]
  Object.entries(used).forEach(([k, n]) => rows.push([FIXTURES[k].name, FIXTURES[k].spec, n, s.setup.kit[k] || 0, Math.max(0, n - (s.setup.kit[k] || 0))]))
  rows.push(['C-stand / light stand', '', s.scene.lights.length, '', ''], ['Sandbag', '', s.scene.lights.length, '', ''], ['Stinger 25 ft', '', s.scene.lights.filter((l) => !FIXTURES[l.fixture]?.passive).length, '', ''])
  s.scene.objects.filter((o) => o.source === 'ai').forEach((o) => rows.push([getAsset(o.asset)?.name, 'Set dressing (AI proposal)', 1, '', '']))
  download('gear-and-props.csv', rows.map((r) => r.map(csvCell).join(',')).join('\n'))
  toast('Gear and props list exported')
}

// simulated rental partners for the "request a quote" flow (P2)
export const RENTAL_HOUSES = [
  { id: 'r1', name: 'Kino Rentals (demo partner)', distance: '2.1 mi', perDay: { led_panel: 35, fresnel: 55, cob: 65, tube: 30, reflector: 8 }, delivery: 25 },
  { id: 'r2', name: 'Lightworks Co-op (demo partner)', distance: '5.8 mi', perDay: { led_panel: 28, fresnel: 48, cob: 60, tube: 26, reflector: 6 }, delivery: 40 },
]
export function quoteFor(house, scene, kit, days = 1) {
  const used = {}
  scene.lights.forEach((l) => { used[l.fixture] = (used[l.fixture] || 0) + 1 })
  const lines = Object.entries(used).map(([k, n]) => {
    const short = Math.max(0, n - (kit[k] || 0))
    return { item: FIXTURES[k].name, qty: n, short, rate: house.perDay[k] || 0, total: (house.perDay[k] || 0) * n * days }
  })
  const sub = lines.reduce((a, l) => a + l.total, 0)
  const shortOnly = lines.reduce((a, l) => a + l.rate * l.short * days, 0)
  return { lines, sub, shortOnly, delivery: house.delivery, total: sub + house.delivery }
}

export function faceSummary(scene) {
  return scene.actors.map((a) => ({ a, ...stopsAt(scene, a) }))
}

// ---------------------------------------------------------------- toast

let toastTimer
export function toast(text) {
  setState({ toast: text })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => setState({ toast: null }), 2600)
}
