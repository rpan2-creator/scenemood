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
