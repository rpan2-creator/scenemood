import { useEffect } from 'react'
import { MarketingNav, Footer } from './Marketing.jsx'
import StageHero from '../components/StageHero.jsx'
import Icon from '../components/Icons.jsx'
import { startDemo } from '../demo/autopilot.js'
import { emptyScene, defaultSetup, setState, navigate } from '../store.js'
import { sampleScene } from '../ai/sim.js'

export function openSample(which = 'trapped', template = 'living', time = 'night') {
  const d = defaultSetup(template)
  const setup = { ...d, brief: { ...d.brief, time, text: time === 'night' ? d.brief.text.replace('Late afternoon.', 'Night.') : d.brief.text } }
  const base = emptyScene(setup)
  const scene = sampleScene(base, setup.kit, setup.brief, which)
  setState({ setup, scene, baseScene: base, activeDirection: null, history: [], future: [], pending: null, selection: null, status: 'studio' })
  navigate('/studio')
}

const STEPS = [
  ['Breakdown', 'Inside or outside, day or night, the room’s real size, who is in the scene, what they wear, the props and the lights you own.'],
  ['Looks', 'Four ways to shoot it with that gear, each with blocking, set dressing, cameras and the reason behind it.'],
  ['Block + light', 'Walk the set in 3D, look through every lens and move actors, props and lights until each frame works.'],
  ['Storyboard', 'Every camera becomes a panel in shooting order: shot size, lens, move, action, and what the crew changes between setups.'],
  ['Share + approve', 'Send the boards to the DP or client. Their notes come back onto the right panel, then you lock the version.'],
]

const AI = [
  ['Draws the location from a description or a script page', 'Breakdown'],
  ['Proposes four looks using only your gear', 'Looks'],
  ['Watches exposure, stands in frame and the 180° line', 'Block + light'],
  ['Offers alternatives for any light, camera or prop', 'Block + light'],
  ['Adds coverage on the right side of the eyeline', 'Storyboard'],
  ['Writes the shooting order and the changeovers', 'Storyboard'],
  ['Turns review notes into set changes', 'Share + approve'],
]

const DIRECTIONS = [
  { key: 'trapped', name: 'Trapped', line: 'A warm pool on the couch, cold night at the window.', gear: '2 panels, bounce, 40 min' },
  { key: 'coldwar', name: 'Cold war', line: 'Different corners of one room, flat cool light.', gear: '2 panels, 20 min' },
  { key: 'boiling', name: 'Boiling point', line: 'Standing, a table between them, hard side light.', gear: '2 panels, 50 min' },
  { key: 'lastlight', name: 'Last light', line: 'She sits in the window light, he stays in the dark.', gear: '1 panel, bounce, 15 min' },
]

const LOCATIONS = [
  ['living', 'trapped', 'night', 'Living room'], ['bedroom', 'coldwar', 'night', 'Bedroom'], ['office', 'coldwar', 'night', 'Office'], ['diner', 'coldwar', 'day', 'Kitchen'],
  ['warehouse', 'coldwar', 'night', 'Warehouse'], ['street', 'trapped', 'night', 'Street'], ['forest', 'coldwar', 'dusk', 'Forest'], ['battlefield', 'coldwar', 'dusk', 'Battlefield'],
]

export default function Landing() {
  // section headings pull focus as they come into view, like a focus puller landing the mark
  useEffect(() => {
    const els = document.querySelectorAll('.b-sec h2')
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.6 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return (
    <div className="landing b">
      <MarketingNav />

      <StageHero>
        <a className="btn primary lg" href="#/login">Start a scene</a>
        <button className="btn lg" onClick={startDemo}><Icon name="play" size={15} /> Watch the whole workflow</button>
      </StageHero>

      <section className="b-sec" aria-labelledby="loc">
        <div className="b-head">
          <h2 id="loc">One brief, any location.</h2>
          <p>A living room, a street corner, a trench at dusk. Describe it in a sentence or drag out the plan; the 3D set, the light and the cameras follow.</p>
        </div>
        <div className="b-locs">
          {LOCATIONS.map(([id, key, time, name]) => (
            <button key={id} className="b-loc" onClick={() => openSample(key, id, time)}>
              <img src={`stills/${id}-${key}.jpg`} alt="" loading="lazy" />
              <span>{name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="b-sec" aria-labelledby="board">
        <div className="b-head">
          <h2 id="board">From a 3D set to a storyboard.</h2>
          <p>Every camera you place in the set is one frame of the storyboard. SceneMood renders what that lens sees, then writes down what the crew has to change between setups.</p>
        </div>
        <div className="b-pipe">
          <figure><img src="story/overview-work.jpg" alt="The 3D set from above: two actors on a sofa, two cameras and three lights" loading="lazy" /><figcaption><b>1. The set</b><span>Room, actors, props and lights at real size.</span></figcaption></figure>
          <figure><img src="stills/living-trapped.jpg" alt="Camera A's view: a medium two-shot of the two actors on the sofa" loading="lazy" /><figcaption><b>2. The lens</b><span>Cam A, 21 mm, 1.15 m high: exactly what it records.</span></figcaption></figure>
          <figure className="b-sb">
            <div className="b-sb-card">
              <div className="b-sb-h"><b>4B · Medium close-up</b><span className="mono">50 mm · Eye level</span></div>
              <p>Ana seated, turned away. Theo out of frame.</p>
              <ul><li>Move the camera 1.4 m.</li><li>Lens change: 32 mm to 50 mm.</li><li>Lighting stays as it is.</li></ul>
            </div>
            <figcaption><b>3. The storyboard</b><span>Panels in shooting order with what changes between setups, exported as one PDF for the crew.</span></figcaption>
          </figure>
        </div>
      </section>

      <section className="b-sec" aria-labelledby="how">
        <div className="b-head"><h2 id="how">Five steps, one evening of prep.</h2></div>
        <ol className="b-steps">
          {STEPS.map(([t, d], n) => <li key={t}><span className="mono">{String(n + 1)}</span><h3>{t}</h3><p>{d}</p></li>)}
        </ol>
      </section>

      <section className="b-sec b-ai" aria-labelledby="ai">
        <div>
          <h2 id="ai">AI does the prep work with you.</h2>
          <p className="b-lead">Every suggestion comes with its reason, and nothing changes until you accept it. Code checks the gear, the exposure and the eyelines, so a plan never needs a light you don’t have.</p>
          <figure className="b-plate"><img src="story/overview-work.jpg" alt="The living room set in the 3D view: two actors on the couch, two cameras, two lights on stands" loading="lazy" /><figcaption className="mono">3D SET, WORK LIGHT</figcaption></figure>
        </div>
        <ul className="b-rows">
          {AI.map(([t, step]) => <li key={t}><span className="ai-mark">✦</span><span>{t}</span><small>{step}</small></li>)}
        </ul>
      </section>

      <section className="b-sec" aria-labelledby="dirs">
        <div className="b-head">
          <h2 id="dirs">Four ways to shoot the same scene.</h2>
          <p>“Night. She wants to leave but doesn’t.” The same room and the same two-light kit, read four ways.</p>
        </div>
        <div className="b-stills">
          {DIRECTIONS.map((d) => (
            <figure key={d.key}>
              <img src={`stills/living-${d.key}.jpg`} alt={`${d.name}: ${d.line}`} loading="lazy" />
              <figcaption><div><b>{d.name}</b><p>{d.line}</p></div><span className="mono">{d.gear}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="b-sec" aria-labelledby="checks">
        <div className="b-head"><h2 id="checks">Checks a crew can trust.</h2></div>
        <div className="b-checks">
          <div><b className="mono">0</b><h3>Lights you don’t own</h3><p>Plans use only the fixtures in your kit, with real output and beam angles.</p></div>
          <div><b className="mono">±1.5 EV</b><h3>On every face</h3><p>Exposure is worked out per actor at your T-stop and ISO.</p></div>
          <div><b className="mono">180°</b><h3>Eyelines that cut</h3><p>Cameras crossing the line, stands in frame and lights blocking the lens are flagged with a fix.</p></div>
        </div>
      </section>

      <section className="b-sec b-close">
        <h2>Rehearse the shoot day here first.</h2>
        <div className="b-cta"><a className="btn primary lg" href="#/login">Start a scene</a><a className="btn lg" href="#/pricing">See pricing</a></div>
      </section>
      <Footer />
    </div>
  )
}
