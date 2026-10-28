import { getState, setState, commitScene, emptyScene, newId, navigate } from './store.js'
import { generateDirections, interpretCommand, generateReference, mixDirections } from './ai/sim.js'
import { applyFix } from './engine/checks.js'

export const engineRef = { current: null }

let genToken = 0
export async function runGeneration() {
  const token = ++genToken
  const { setup } = getState()
  const base = emptyScene(setup)
  // actors take the tones chosen in setup
  base.actors = base.actors.map((a) => ({ ...a, tone: setup.brief.tones?.[a.id] || a.tone }))
  setState({ directions: [], gen: { status: 'running', stage: 'plan', index: -1, plan: [], log: [] }, baseScene: base })
  await generateDirections({ setup, baseScene: base }, (ev) => {
    if (token !== genToken) return
    setState((s) => {
      const gen = { ...s.gen }
      if (ev.type === 'stage') { gen.stage = ev.stage; gen.index = ev.index ?? -1; gen.log = [...gen.log, ev.text] }
      if (ev.type === 'plan') gen.plan = ev.names
      if (ev.type === 'done') { gen.status = 'done'; gen.stage = 'done' }
      const directions = ev.type === 'direction' ? [...s.directions, ev.direction] : s.directions
      return { gen, directions }
    })
  })
}

export function openDirection(dir) {
  setState({ scene: structuredClone(dir.scene), activeDirection: dir.id, history: [], future: [], selection: null, pending: null, frames: getState().frames })
  navigate('/studio')
}

export function openMix(pick) {
  const { directions, baseScene, setup } = getState()
  const base = baseScene || emptyScene(setup)
  const scene = mixDirections(base, pick, directions)
  setState({ scene, activeDirection: 'mix', history: [], future: [], selection: null, pending: null })
  navigate('/studio')
}

export async function sendCommand(text, opts = {}) {
  const { scene, setup } = getState()
  if (!scene || !text.trim()) return
  const id = newId('msg')
  setState((s) => ({ aiLog: [...s.aiLog, { id, role: 'user', text, at: Date.now(), source: opts.source || 'command' }], thinking: true, pending: null }))
  const res = await interpretCommand(text, scene, { kit: setup.kit, hintActor: opts.hintActor })
  if (!res.ok) {
    setState((s) => ({ thinking: false, aiLog: [...s.aiLog, { id: newId('msg'), role: 'ai', ok: false, text: res.message, suggestions: res.suggestions }] }))
    return
  }
  setState((s) => ({
    thinking: false,
    pending: { scene: res.scene, changed: res.changed, summary: res.summary, ref: res.ref, issues: res.issues, prompt: text },
    aiLog: [...s.aiLog, { id: newId('msg'), role: 'ai', ok: true, text: res.summary, ref: res.ref }],
  }))
}

export function acceptPending() {
  const { pending } = getState()
  if (!pending) return
  commitScene(pending.scene, 'AI: ' + pending.prompt)
  setState({ pending: null })
  toast('Change accepted')
}

export function discardPending() {
  setState({ pending: null })
}

export function fixIssue(fix) {
  const { scene } = getState()
  commitScene(applyFix(scene, fix), fix.label)
  toast(fix.label)
}

export async function makeReference() {
  const { scene, activeDirection, directions } = getState()
  const eng = engineRef.current
  if (!scene || !eng || !scene.activeCam) return
  const cam = scene.cameras.find((c) => c.id === scene.activeCam)
  const id = newId('ref')
  const dirName = directions.find((d) => d.id === activeDirection)?.name || 'Custom'
  setState((s) => ({ frames: [...s.frames, { id, status: 'running', cam: cam.label, focal: cam.focal, dir: dirName, at: Date.now() }] }))
  const url = await generateReference(eng, scene, { width: 960 })
  setState((s) => ({ frames: s.frames.map((f) => (f.id === id ? { ...f, status: 'done', url } : f)) }))
}

let toastTimer
export function toast(text) {
  setState({ toast: text })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => setState({ toast: null }), 2200)
}
