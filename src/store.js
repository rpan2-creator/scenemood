import { useSyncExternalStore, useRef } from 'react'
import { getTemplate } from './data/rooms.js'
import { getKit } from './data/gear.js'

// One state object with immutable updates and a selector hook.
// Projects hold scenes; the active scene's working data sits at the top level and
// is swapped in and out of `sceneStore` when the user changes scene.
// The scene itself is a plain JSON document that the 3D engine, the plans, the checks
// and the (simulated) AI all read and write.

let uid = 1
export const newId = (p = 'id') => `${p}_${Date.now().toString(36)}_${(uid++).toString(36)}`

export function roomFromTemplate(id) {
  const t = getTemplate(id)
  return {
    template: t.id, kind: t.kind || 'interior', ground: t.ground, haze: t.haze || 0, name: t.name, w: t.w, d: t.d, h: t.h, floor: t.floor, wall: t.wall, floorType: t.floorType,
    openings: t.openings.map((o) => ({ ...o })),
    outlets: t.outlets.map((o) => ({ ...o })),
  }
}

export function starterObjects(templateId) {
  return getTemplate(templateId).starter.map((s) => ({ id: newId('obj'), layer: 'dressing', y: 0, ...s, source: 'location' }))
}

export const ACTOR_PRESETS = [
  { id: 'actor_a', name: 'Theo', label: 'A', tone: 'medium', pose: 'sit', model: 'male' },
  { id: 'actor_b', name: 'Ana', label: 'B', tone: 'deep', pose: 'sit', model: 'female' },
  { id: 'actor_c', name: 'June', label: 'C', tone: 'light', pose: 'stand', model: 'third' },
]

export function defaultActors(n = 2, tones = {}, names = {}) {
  return ACTOR_PRESETS.slice(0, n).map((a, i) => ({ ...a, name: names[a.id] || a.name, tone: tones[a.id] || a.tone, x: -0.6 + i * 1.2, z: 0, rot: 0 }))
}

export function defaultSetup(templateId = 'living') {
  return {
    templateId,
    room: roomFromTemplate(templateId),
    objects: starterObjects(templateId),
    kitId: 'two',
    kit: { ...getKit('two').items },
    brief: {
      text: 'Late afternoon. Ana and Theo argue on the couch. She wants to leave but doesn’t. Tense, quiet, close.',
      time: 'day',
      aspect: '2.39',
      actors: 2,
      names: { actor_a: 'Theo', actor_b: 'Ana', actor_c: 'June' },
      tones: { actor_a: 'medium', actor_b: 'deep', actor_c: 'light' },
      refs: ['motivated light', 'tension'],
      maxSetup: 45,
    },
    startedAt: Date.now(),
  }
}

export const emptyScene = (setup) => ({
  room: setup.room,
  objects: (setup.objects || starterObjects(setup.room.template)).map((o) => ({ ...o, id: newId('obj') })),
  actors: defaultActors(setup.brief.actors, setup.brief.tones, setup.brief.names),
  cameras: [],
  lights: [],
  time: setup.brief.time,
  aspect: setup.brief.aspect,
  activeCam: null,
  iso: 800,
  tstop: 2.8,
})

const SCENE_FIELDS = ['setup', 'directions', 'activeDirection', 'scene', 'history', 'future', 'frames', 'comments', 'votes', 'versions', 'baseScene', 'firstDirectionAt', 'learning', 'status']
const blankSceneData = (templateId = 'living') => ({
  setup: defaultSetup(templateId), directions: [], activeDirection: null, scene: null, history: [], future: [],
  frames: [], comments: [], votes: {}, versions: [], baseScene: null, firstDirectionAt: null, learning: false, status: 'setup',
})

const firstProject = {
  id: 'proj_demo', name: 'Leaving Hour', type: 'Short film', aspect: '2.39', shootDate: '2026-11-14', createdAt: Date.now(),
  scenes: [
    { id: 'scene_04', num: '04', name: 'Living room, night', status: 'setup' },
    { id: 'scene_07', num: '07', name: 'Kitchen, morning after', status: 'setup', template: 'diner' },
  ],
}

const initial = {
  user: null,
  team: { name: 'Northside Films', plan: 'Pro', seats: 5, members: [
    { name: 'You', role: 'Director', email: '' },
    { name: 'Jordan Lee', role: 'DP', email: 'jordan@northside.film' },
    { name: 'Sam Ortiz', role: 'Gaffer', email: 'sam@northside.film' },
  ] },
  usage: { hdFrames: 12, hdQuota: 100, scenesThisMonth: 3 },
  settings: { improve: true, retention: '30', model: 'simulated', endpoint: '', learningDefault: false },
  projects: [firstProject],
  activeProjectId: 'proj_demo',
  activeSceneId: 'scene_04',
  sceneStore: {},
  library: { rooms: [], kits: [] },
  log: [],
  ...blankSceneData('living'),
  gen: { status: 'idle', stages: [], log: [] },
  pending: null,
  selection: null,
  ui: { view: 'split', cones: true, falseColor: false, frameGuides: true, leftTab: 'layers', rightTab: 'ai', labels: true, haze: false, histogram: false, setLight: 'work' },
  aiLog: [],
}

const KEY = 'scenemood.v3'
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial
    const saved = JSON.parse(raw)
    return { ...initial, ...saved, gen: { status: saved.directions?.length ? 'done' : 'idle', stages: [], log: [] }, pending: null, thinking: false, toast: null }
  } catch {
    return initial
  }
}

let state = load()
const listeners = new Set()
let saveTimer = null

export function getState() { return state }

function persist() {
  try {
    const keep = ['user', 'team', 'usage', 'settings', 'projects', 'activeProjectId', 'activeSceneId', 'sceneStore', 'library', 'log', 'ui', 'aiLog', ...SCENE_FIELDS]
    const out = {}
    for (const k of keep) out[k] = state[k]
    out.frames = (state.frames || []).filter((f) => f.status === 'done').slice(-6)
    out.aiLog = (state.aiLog || []).slice(-40)
    out.history = (state.history || []).slice(-25)
    out.future = []
    out.sceneStore = Object.fromEntries(Object.entries(state.sceneStore || {}).map(([k, v]) => [k, { ...v, frames: (v.frames || []).slice(-3), history: (v.history || []).slice(-10), future: [] }]))
    localStorage.setItem(KEY, JSON.stringify(out))
  } catch {
    // storage full: drop the heaviest data and keep working in memory
    try { localStorage.setItem(KEY, JSON.stringify({ ...state, frames: [], sceneStore: {}, history: [], future: [], gen: undefined })) } catch { /* ignore */ }
  }
}

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...next }
  listeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 400)
}

export function subscribe(l) { listeners.add(l); return () => listeners.delete(l) }

function shallowEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.is(a[k], b[k]))
}

export function useStore(selector = (s) => s) {
  const sel = useRef(selector)
  const last = useRef({ state: undefined, value: undefined })
  sel.current = selector
  const get = () => {
    if (last.current.state === state) return last.current.value
    const v = sel.current(state)
    const value = shallowEqual(v, last.current.value) ? last.current.value : v
    last.current = { state, value }
    return value
  }
  return useSyncExternalStore(subscribe, get, get)
}

export function resetAll() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  state = { ...initial, ...blankSceneData('living') }
  listeners.forEach((l) => l())
}

// ---------- projects and scenes ----------

export const activeProject = (s = state) => s.projects.find((p) => p.id === s.activeProjectId) || s.projects[0]
export const activeSceneMeta = (s = state) => activeProject(s)?.scenes.find((x) => x.id === s.activeSceneId)

function snapshotScene(s) {
  const out = {}
  for (const k of SCENE_FIELDS) out[k] = s[k]
  return out
}

export function openScene(projectId, sceneId) {
  setState((s) => {
    if (s.activeSceneId === sceneId) return { activeProjectId: projectId }
    const store = { ...s.sceneStore, [s.activeSceneId]: snapshotScene(s) }
    const proj = s.projects.find((p) => p.id === projectId)
    const meta = proj?.scenes.find((x) => x.id === sceneId)
    const data = store[sceneId] || blankSceneData(meta?.template || 'living')
    if (!store[sceneId] && proj) data.setup.brief.aspect = proj.aspect || '2.39'
    return { ...data, sceneStore: store, activeProjectId: projectId, activeSceneId: sceneId, pending: null, selection: null, gen: { status: data.directions?.length ? 'done' : 'idle', stages: [], log: [] } }
  })
}

export function setSceneStatus(status) {
  setState((s) => ({
    status,
    projects: s.projects.map((p) => p.id !== s.activeProjectId ? p : { ...p, scenes: p.scenes.map((x) => (x.id === s.activeSceneId ? { ...x, status } : x)) }),
  }))
}

export function createProject({ name, type, aspect, shootDate }) {
  const id = newId('proj')
  const sid = newId('scene')
  setState((s) => ({ projects: [...s.projects, { id, name, type, aspect, shootDate, createdAt: Date.now(), scenes: [{ id: sid, num: '01', name: 'Scene 1', status: 'setup' }] }] }))
  openScene(id, sid)
  return id
}

export function createScene({ name, template }) {
  const p = activeProject()
  const sid = newId('scene')
  const num = String(p.scenes.length + 1).padStart(2, '0')
  setState((s) => ({ projects: s.projects.map((x) => x.id !== p.id ? x : { ...x, scenes: [...x.scenes, { id: sid, num, name, status: 'setup', template }] }) }))
  openScene(p.id, sid)
}

// ---------- scene editing with undo and named versions ----------

export function commitScene(scene, label = 'Edit', meta) {
  setState((s) => ({
    scene,
    history: s.scene ? [...s.history.slice(-49), { scene: s.scene, label, at: Date.now(), ...meta }] : s.history,
    future: [],
  }))
}

export function undo() {
  setState((s) => {
    if (!s.history.length) return {}
    const prev = s.history[s.history.length - 1]
    return { scene: prev.scene, history: s.history.slice(0, -1), future: [{ scene: s.scene, label: prev.label, at: Date.now() }, ...s.future], pending: null }
  })
}

export function redo() {
  setState((s) => {
    if (!s.future.length) return {}
    const nxt = s.future[0]
    return { scene: nxt.scene, future: s.future.slice(1), history: [...s.history, { scene: s.scene, label: nxt.label, at: Date.now() }], pending: null }
  })
}

export function saveVersion(name) {
  setState((s) => ({ versions: [...(s.versions || []), { id: newId('ver'), name: name || `Version ${(s.versions || []).length + 1}`, at: Date.now(), scene: s.scene }] }))
}

export function restoreVersion(id) {
  const v = (state.versions || []).find((x) => x.id === id)
  if (v) commitScene(structuredClone(v.scene), 'Restore ' + v.name)
}

export function updateItem(kind, id, changes, label) {
  const s = state.scene
  if (!s) return
  const before = s[kind].find((it) => it.id === id)
  const touch = before?.source === 'ai' && !before.edited && !('kept' in changes) && !('on' in changes)
  const list = s[kind].map((it) => (it.id === id ? { ...it, ...changes, ...(touch ? { edited: true } : {}) } : it))
  commitScene({ ...s, [kind]: list }, label || 'Edit')
  if (touch) logSuggestion(before, 'edited', kind)
}

export function removeItem(kind, id) {
  const s = state.scene
  const removed = s[kind].find((x) => x.id === id)
  commitScene({ ...s, [kind]: s[kind].filter((it) => it.id !== id) }, 'Remove')
  if (removed?.source === 'ai') logSuggestion(removed, 'rejected', kind)
  if (state.selection?.id === id) setState({ selection: null })
}

export function addObject(obj) {
  const s = state.scene
  const item = { id: newId('obj'), layer: 'dressing', y: 0, rot: 0, source: 'user', ...obj }
  commitScene({ ...s, objects: [...s.objects, item] }, 'Add ' + obj.asset)
  setState({ selection: { kind: 'objects', id: item.id } })
}

// suggestion log: how the crew treated each AI proposal (feeds the insights page)
export function logSuggestion(item, outcome, kind) {
  if (!state.settings?.improve) return
  const layer = kind === 'lights' ? 'Lighting' : kind === 'objects' ? 'Dressing' : 'Blocking'
  setState((s) => ({ log: [...(s.log || []).slice(-300), { id: newId('log'), at: Date.now(), layer, ref: item.why?.ref || item.label || item.asset || item.name, outcome, scene: s.activeSceneId }] }))
}

export function navigate(path) {
  window.location.hash = '#' + path
}
