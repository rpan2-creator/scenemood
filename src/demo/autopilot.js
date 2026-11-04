// The full workflow, played by the simulated AI from a blank breakdown to an approved storyboard.
// Every step calls the same functions the buttons call, so what the demo shows is what the product does.
import { getState, setState, navigate, defaultSetup, commitScene, setSceneStatus } from '../store.js'
import { parseScript, parseLocation, digestComments } from '../ai/copilot.js'
import { runGeneration, openDirection, sendCommand, acceptPending, addComment, commentToAI, toast } from '../actions.js'
import { coverageCamera } from '../plan/storyboard.js'
import { frameCamera } from '../ai/sim.js'
import { approveScene } from '../components/TopBar.jsx'

const SCRIPT = `INT. APARTMENT - NIGHT

Rain against the window. ANA sits on the arm of the couch, coat already on. THEO doesn't look at her.

THEO
You said you'd stay till Sunday.

ANA
I said I'd think about it.`

const LOCATION = 'Small apartment living room, about 5 by 4 m, a window on the left wall, a sofa, a round coffee table and a floor lamp.'

export const DEMO_STEPS = [
  { step: 'Breakdown', text: 'The AI reads a script page: time of day, who is in the scene, the mood.' },
  { step: 'Breakdown', text: 'One sentence about the location becomes a floor plan at real size.' },
  { step: 'Looks', text: 'Four ways to shoot it, each lit only with the two LED panels in the kit.' },
  { step: 'Block + light', text: 'The best-rated look opens in 3D. Every camera is a real lens at a real height.' },
  { step: 'Block + light', text: '“Her face is too dark.” The AI proposes a change. Nothing moves until you accept it.' },
  { step: 'Storyboard', text: 'Each camera is a panel, in shooting order, with what changes between setups.' },
  { step: 'Storyboard', text: 'Coverage added: a close-up on Ana, kept on the same side of the eyeline.' },
  { step: 'Share + approve', text: 'The DP leaves a note on a frame. The AI turns it into a set change.' },
  { step: 'Share + approve', text: 'Version locked. The scene packet is ready to print for the crew.' },
]

let run = 0
const wait = (ms, id) => new Promise((res, rej) => setTimeout(() => (id === run ? res() : rej(new Error('stopped'))), ms))
async function until(fn, id, ms = 30000) {
  const t0 = Date.now()
  while (!fn()) { if (Date.now() - t0 > ms) return; await wait(250, id) }
}
const say = (i, extra = {}) => setState({ demo: { i, total: DEMO_STEPS.length, ...DEMO_STEPS[i], running: true, ...extra } })

export function stopDemo() { run++; setState({ demo: null }) }

export async function startDemo() {
  const id = ++run
  try {
    const d = defaultSetup('living')
    setState({ setup: { ...d, brief: { ...d.brief, text: '', names: {} } }, scene: null, baseScene: null, directions: [], activeDirection: null, history: [], future: [], pending: null, selection: null, comments: [], aiLog: [], status: 'setup' })
    navigate('/setup')
    say(0); await wait(1600, id)
    const s = await parseScript(SCRIPT)
    const names = { ...getState().setup.brief.names }
    ;['actor_a', 'actor_b'].forEach((k, i) => { if (s.names[i]) names[k] = s.names[i] })
    setState((st) => ({ setup: { ...st.setup, brief: { ...st.setup.brief, text: s.brief || st.setup.brief.text, time: s.time || 'night', names: { actor_a: names.actor_a || 'Theo', actor_b: names.actor_b || 'Ana', actor_c: 'June' }, refs: s.refs?.length ? s.refs : st.setup.brief.refs } } }))
    await wait(2600, id)

    say(1); await wait(1200, id)
    const loc = await parseLocation(LOCATION)
    setState((st) => ({ setup: { ...st.setup, room: loc.room, objects: loc.objects, templateId: loc.room.template } }))
    await wait(3200, id)

    say(2)
    runGeneration(); navigate('/directions')
    await until(() => getState().gen?.status === 'done', id, 60000)
    await wait(2400, id)

    say(3)
    const dirs = getState().directions
    openDirection(dirs[0])
    await wait(5000, id)

    say(4)
    const ana = getState().scene.actors.find((a) => a.id === 'actor_b')
    await sendCommand('Her face is too dark', { hintActor: ana?.id })
    await until(() => !getState().thinking, id)
    await wait(3400, id)
    if (getState().pending) acceptPending()
    await wait(1800, id)

    say(5)
    setSceneStatus('plan'); navigate('/plan')
    await wait(5000, id)

    say(6)
    const sc = getState().scene
    const label = String.fromCharCode(65 + sc.cameras.length)
    const cam = coverageCamera(sc, 'close', ana?.id || sc.actors[0].id, label, frameCamera)
    if (cam) commitScene({ ...sc, cameras: [...sc.cameras, cam] }, `Add ${cam.shot}`)
    await wait(4500, id)

    say(7)
    setSceneStatus('review'); navigate('/review')
    await wait(1500, id)
    const first = getState().scene.cameras[0]
    addComment({ text: 'Can we bring a little more light onto Ana in this one?', author: 'Sam Ortiz (DP)', frame: first?.id })
    await wait(1800, id)
    await digestComments(getState().comments, getState().scene)
    const c = getState().comments.at(-1)
    await commentToAI(c)
    await until(() => !getState().thinking, id)
    await wait(2600, id)
    if (getState().pending) acceptPending()
    await wait(1600, id)

    say(8)
    approveScene()
    navigate('/plan')
    await wait(6000, id)
    say(8, { running: false, done: true })
  } catch (e) {
    if (e.message !== 'stopped') { console.error(e); toast('The demo stopped. You can carry on from here.'); setState({ demo: null }) }
  }
}
