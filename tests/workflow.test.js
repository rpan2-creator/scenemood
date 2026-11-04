import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feedbackFor, readFeedback } from '../src/feedback.js'
const store = await import('../src/store.js')
const actions = await import('../src/actions.js')
globalThis.window = { location: { hash: '#/studio' } }
test('feedback roundtrip validates scene and maps camera; wrong-scene and malformed files rejected', () => {
  const data = { projectId: 'p', sceneId: 's' }
  const local = { vote: 'd', comments: [{ id: 'unique', name: 'DP', text: 'Warmer', cam: 'A', at: 12 }] }
  const payload = feedbackFor(data, local, 'DP')
  assert.equal(readFeedback(payload, 'p', 's', [{ id: 'cam-a', label: 'A' }])[0].frame, 'cam-a')
  assert.throws(() => readFeedback(payload, 'p', 'other', []))
  assert.throws(() => readFeedback({ ...payload, comments: [{}] }, 'p', 's', []))
})
test('switching directions restores edited scene and undo history', () => {
  store.setState({ pending: null, scene: { marker: 'edited-a' }, activeDirection: 'a', history: [{ label: 'edit' }], future: [], directionDrafts: {} })
  actions.openDirection({ id: 'b', scene: { marker: 'original-b' } })
  assert.equal(store.getState().scene.marker, 'original-b')
  actions.openDirection({ id: 'a', scene: { marker: 'original-a' } })
  assert.equal(store.getState().scene.marker, 'edited-a')
  assert.equal(store.getState().history[0].label, 'edit')
})
test('approval snapshots survive editing; project scene returns to draft', () => {
  const s = store.getState()
  store.setState({ status: 'review', approvals: [], scene: { marker: 'approved' } })
  store.setSceneStatus('plan')
  store.commitScene({ marker: 'new-draft' }, 'edit')
  assert.equal(store.getState().status, 'studio')
  assert.equal(store.getState().approvals[0].scene.marker, 'approved')
  const project = store.getState().projects.find((p) => p.id === s.activeProjectId)
  assert.equal(project.scenes.find((x) => x.id === s.activeSceneId).status, 'studio')
})
test('unconfirmed AI previews block leaving studio', () => {
  window.location.hash = '#/studio'
  store.setState({ pending: { scene: {} } })
  store.navigate('/review')
  assert.equal(window.location.hash, '#/studio')
  store.setState({ pending: null })
  store.navigate('/review')
  assert.equal(window.location.hash, '#/review')
})

test('storyboard orders setups by direction, widest first, and lists what changes', async () => {
  const { storyboard, shootingOrder } = await import('../src/plan/storyboard.js')
  const cam = (id, label, x, z, aimZ, focal) => ({ id, label, x, y: 1.4, z, aim: [0, 1.2, aimZ], focal, shot: 'Shot' })
  const scene = { aspect: '2.39', actors: [{ id: 'a', name: 'Theo', pose: 'sit' }], lights: [{ id: 'k', role: 'key', label: 'Key', fixture: 'led_panel', intensity: 0.5, cct: 3200, x: 3, y: 2, z: 3 }],
    cameras: [cam('c1', 'A', 0, 3, 0, 50), cam('c2', 'B', 0, -3, 0, 32), cam('c3', 'C', 0.5, 3, 0, 24)] }
  assert.deepEqual(shootingOrder(scene.cameras).map((c) => c.id), ['c3', 'c1', 'c2'])
  const b = storyboard(scene, 4)
  assert.equal(b[0].code, '4A')
  assert.match(b[0].changes[0], /First setup/)
  assert.match(b[2].changes.join(' '), /Turnaround/)
  assert.match(b[1].changes.join(' '), /Lens change: 24 mm to 50 mm/)
  assert.match(b[0].action, /Theo seated/)
})

test('blocking preferences from set up override the direction', async () => {
  const { applyBlockingPrefs } = await import('../src/ai/sim.js')
  const room = { kind: 'interior', w: 5, d: 4, h: 2.6, openings: [], outlets: [] }
  const scene = { room, objects: [{ id: 's', asset: 'sofa', x: 0, z: -1, rot: 0 }], actors: [{ id: 'actor_a', name: 'Theo', pose: 'stand', x: 1, z: 0 }, { id: 'actor_b', name: 'Ana', pose: 'sit', x: 0.6, z: -0.9 }] }
  const r = applyBlockingPrefs(scene, { actor_a: 'sit', actor_b: 'stand' })
  assert.equal(r.scene.actors[0].pose, 'sit')
  assert.ok(['stand', 'crossed'].includes(r.scene.actors[1].pose))
  const bare = applyBlockingPrefs({ ...scene, objects: [] }, { actor_a: 'sit' })
  assert.equal(bare.scene.actors[0].pose, 'stand')
  assert.equal(bare.notes.length, 1)
})

test('reply feedback merges without duplicates', async () => {
  const { mergeFeedback } = await import('../src/feedback.js')
  assert.equal(mergeFeedback([{ id: 'x' }], [{ id: 'x' }, { id: 'y' }]).length, 2)
})
