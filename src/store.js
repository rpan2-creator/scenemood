import { useSyncExternalStore, useRef } from 'react'
import { getTemplate } from './data/rooms.js'
import { getKit } from './data/gear.js'

// A tiny store: one state object, immutable updates, selector hook.
// The scene is a plain JSON document that the 3D engine, the plan drawings,
// the feasibility checks and the (simulated) AI all read and write.

let uid = 1
export const newId = (p = 'id') => `${p}_${Date.now().toString(36)}_${(uid++).toString(36)}`

export function roomFromTemplate(id) {
  const t = getTemplate(id)
  return {
    template: t.id, name: t.name, w: t.w, d: t.d, h: t.h, floor: t.floor, wall: t.wall,
    openings: t.openings.map((o) => ({ ...o })),
    outlets: t.outlets.map((o) => ({ ...o })),
  }
}

export function starterObjects(templateId) {
  return getTemplate(templateId).starter.map((s) => ({ id: newId('obj'), layer: 'dressing', y: 0, ...s, source: 'location' }))
}

export function defaultActors(n = 2) {
  const base = [
    { id: 'actor_a', name: 'Theo', label: 'A', tone: 'medium', pose: 'sit' },
    { id: 'actor_b', name: 'Ana', label: 'B', tone: 'deep', pose: 'sit' },
    { id: 'actor_c', name: 'June', label: 'C', tone: 'light', pose: 'stand' },
  ]
  return base.slice(0, n).map((a, i) => ({ ...a, x: -0.6 + i * 1.2, z: 0, rot: 0 }))
}

const DEFAULT_SETUP = {
  templateId: 'living',
  room: roomFromTemplate('living'),
  objects: starterObjects('living'),
  kitId: 'two',
  kit: { ...getKit('two').items },
  brief: {
    text: 'Night. Ana and Theo argue on the couch. She wants to leave but doesn’t. Tense, quiet, close.',
    time: 'night',
    aspect: '2.39',
    actors: 2,
    tones: { actor_a: 'medium', actor_b: 'deep' },
    maxSetup: 45,
  },
}

export const emptyScene = (setup) => ({
  room: setup.room,
  objects: (setup.objects || starterObjects(setup.room.template)).map((o) => ({ ...o, id: newId('obj') })),
  actors: defaultActors(setup.brief.actors),
  cameras: [],
  lights: [],
  time: setup.brief.time,
  aspect: setup.brief.aspect,
  activeCam: null,
  iso: 800,
  tstop: 2.8,
})

const initial = {
  project: { name: 'Untitled short', scene: '04', shot: 'Living room, night' },
  setup: DEFAULT_SETUP,
  directions: [],
  gen: { status: 'idle', stages: [], log: [] },
  activeDirection: null,
  scene: null,
  history: [],
  future: [],
  pending: null,
  selection: null,
  ui: { view: 'split', cones: true, falseColor: false, frameGuides: true, assetsOpen: true, leftTab: 'layers' },
  frames: [],
  comments: [],
  aiLog: [],
}

const KEY = 'scenemood.v1'
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial
    const saved = JSON.parse(raw)
    return { ...initial, ...saved, gen: { status: saved.directions?.length ? 'done' : 'idle', stages: [], log: [] }, pending: null }
  } catch {
    return initial
  }
}

let state = load()
const listeners = new Set()
let saveTimer = null

export function getState() { return state }

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...next }
  listeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const { project, setup, directions, activeDirection, scene, ui, frames, comments, aiLog } = state
      localStorage.setItem(KEY, JSON.stringify({ project, setup, directions, activeDirection, scene, ui, frames: frames.slice(-12), comments, aiLog: aiLog.slice(-40) }))
    } catch { /* storage full or blocked: keep working in memory */ }
  }, 300)
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
  state = { ...initial, setup: { ...DEFAULT_SETUP, room: roomFromTemplate('living') } }
  listeners.forEach((l) => l())
}

// ---------- scene editing with undo ----------

export function commitScene(scene, label = 'Edit') {
  setState((s) => ({
    scene,
    history: s.scene ? [...s.history.slice(-49), { scene: s.scene, label }] : s.history,
    future: [],
  }))
}

export function undo() {
  setState((s) => {
    if (!s.history.length) return {}
    const prev = s.history[s.history.length - 1]
    return { scene: prev.scene, history: s.history.slice(0, -1), future: [{ scene: s.scene, label: prev.label }, ...s.future], pending: null }
  })
}

export function redo() {
  setState((s) => {
    if (!s.future.length) return {}
    const nxt = s.future[0]
    return { scene: nxt.scene, future: s.future.slice(1), history: [...s.history, { scene: s.scene, label: nxt.label }], pending: null }
  })
}

export function updateItem(kind, id, changes, label) {
  const s = state.scene
  if (!s) return
  const list = s[kind].map((it) => (it.id === id ? { ...it, ...changes } : it))
  commitScene({ ...s, [kind]: list }, label || 'Edit')
}

export function removeItem(kind, id) {
  const s = state.scene
  commitScene({ ...s, [kind]: s[kind].filter((it) => it.id !== id) }, 'Remove')
  if (state.selection?.id === id) setState({ selection: null })
}

export function addObject(obj) {
  const s = state.scene
  const item = { id: newId('obj'), layer: 'dressing', y: 0, rot: 0, source: 'user', ...obj }
  commitScene({ ...s, objects: [...s.objects, item] }, 'Add ' + obj.asset)
  setState({ selection: { kind: 'objects', id: item.id } })
}

export function findItem(scene, id) {
  for (const kind of ['objects', 'actors', 'lights', 'cameras']) {
    const it = scene?.[kind]?.find((x) => x.id === id)
    if (it) return { kind, item: it }
  }
  return null
}

export function navigate(path) {
  window.location.hash = '#' + path
}
