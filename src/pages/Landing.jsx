import PlanSVG from '../components/PlanSVG.jsx'
import { MarketingNav, Footer } from './Marketing.jsx'
import { emptyScene, defaultSetup, setState, navigate } from '../store.js'
import { sampleScene } from '../ai/sim.js'
import { cctToHex } from '../data/gear.js'

const SAMPLE = (() => {
  const d = defaultSetup('living')
  const setup = { ...d, brief: { ...d.brief, time: 'night' } }
  const base = emptyScene(setup)
  return { setup, scene: sampleScene(base, setup.kit, setup.brief, 'trapped') }
})()

export function openSample(which = 'trapped', template = 'living', time = 'night') {
  const d = defaultSetup(template)
  const setup = { ...d, brief: { ...d.brief, time, text: time === 'night' ? d.brief.text.replace('Late afternoon.', 'Night.') : d.brief.text } }
  const base = emptyScene(setup)
  const scene = sampleScene(base, setup.kit, setup.brief, which)
  setState({ setup, scene, baseScene: base, activeDirection: null, history: [], future: [], pending: null, selection: null, status: 'studio' })
  navigate('/studio')
}

const STEPS = [
  ['Set up', 'Describe the location in a sentence, or drag out the floor plan. Add the lights you own and paste the scene.'],
  ['Directions', 'Four distinct ways to shoot it, each with set dressing, blocking, camera and light, and the reasons.'],
  ['Studio', 'Walk the 3D set, look through every lens, and tell the AI what to change in plain words.'],
  ['Review', 'Send a link to the DP or the client. Their notes come back as changes you can apply.'],
  ['Shot plan', 'Lighting diagram, shot list, gear list and a shooting order the crew can print.'],
]

const AI = [
  ['Draws the room from a description', 'Set up'],
  ['Reads a script page for time, cast and mood', 'Set up'],
  ['Proposes four directions using only your gear', 'Directions'],
  ['Watches exposure, stands in frame and the 180° line', 'Studio'],
  ['Offers three alternatives for any light, camera or prop', 'Studio'],
  ['Turns review notes into set changes', 'Review'],
  ['Writes the shooting order and the risks', 'Shot plan'],
]

const DIRECTIONS = [
  { key: 'trapped', name: 'Trapped', line: 'A warm pool on the couch, cold night at the window.', gear: '2 panels, bounce, 40 min' },
  { key: 'coldwar', name: 'Cold war', line: 'Different corners of one room, flat cool light.', gear: '2 panels, 20 min' },
  { key: 'boiling', name: 'Boiling point', line: 'Standing, a table between them, hard side light.', gear: '2 panels, 50 min' },
  { key: 'lastlight', name: 'Last light', line: 'She sits in the window light, he stays in the dark.', gear: '1 panel, bounce, 15 min' },
]

export default function Landing() {
  const cam = SAMPLE.scene.cameras.find((c) => c.id === SAMPLE.scene.activeCam)
  return (
    <div className="landing">
      <MarketingNav />

      <header className="hero">
        <div className="hero-copy">
          <h1>Plan every shot before you’re on set.</h1>
          <p>Tell SceneMood the room, the gear you own and what the scene should feel like. Its AI proposes where things go, where people stand and where each light sits. You check every shot through the lens before the crew arrives.</p>
          <div className="hero-cta">
            <a className="btn primary lg" href="#/login">Start a scene</a>
            <button className="btn lg quiet" onClick={() => openSample()}>Open the sample scene</button>
          </div>
          <p className="hero-note">Free for two scenes a month. Works in the browser.</p>
        </div>

        <figure className="plate" aria-label="A lighting and blocking diagram with the view through camera A">
          <div className="plate-plan"><PlanSVG scene={SAMPLE.scene} labels width={760} height={560} /></div>
          <div className="plate-key">
            {SAMPLE.scene.lights.map((l) => <span key={l.id}><i style={{ background: cctToHex(l.cct) }} />{l.label}<em>{l.cct} K</em></span>)}
          </div>
          <div className="plate-lens">
            <img src="stills/living-trapped.jpg" alt="The two-shot through camera A: warm lamplight on the couch, cool light at the window" />
            <span className="vf tl" /><span className="vf tr" /><span className="vf bl" /><span className="vf br" />
            <figcaption><b>Cam {cam.label}</b><span>{cam.focal} mm</span><span>T{SAMPLE.scene.tstop}</span><span>ISO {SAMPLE.scene.iso}</span></figcaption>
          </div>
        </figure>
      </header>

      <section className="l-section steps-sec" aria-labelledby="how">
        <h2 id="how">From an empty room to a shot plan</h2>
        <ol className="steps">
          {STEPS.map(([t, d], i) => <li key={t}><span className="step-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}
        </ol>
      </section>

      <section className="l-section ai-sec" aria-labelledby="ai">
        <div className="ai-intro">
          <h2 id="ai">AI does the prep work with you</h2>
          <p>Every suggestion comes with its reason, and nothing changes until you accept it. Code checks the gear, the exposure and the eyelines, so a plan never needs a light you don’t have.</p>
          <img src="story/overview-work.jpg" alt="The living room set in the 3D view, with two actors on the couch, two cameras and two lights on stands" loading="lazy" />
        </div>
        <ul className="ai-rows">
          {AI.map(([t, step]) => <li key={t}><span className="ai-mark">✦</span><span>{t}</span><small>{step}</small></li>)}
        </ul>
      </section>

      <section className="l-section" aria-labelledby="dirs">
        <h2 id="dirs">One brief, four ways to shoot it</h2>
        <p className="sub">“Night. She wants to leave but doesn’t.” The same room and the same two-light kit, read four ways.</p>
        <div className="still-grid">
          {DIRECTIONS.map((d) => (
            <figure className="still" key={d.key}>
              <img src={`stills/living-${d.key}.jpg`} alt={`${d.name}: ${d.line}`} loading="lazy" />
              <figcaption>
                <div><b>{d.name}</b><p>{d.line}</p></div>
                <span className="mono">{d.gear}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="l-section" aria-labelledby="checks">
        <h2 id="checks">Checks a crew can trust</h2>
        <div className="checks3">
          <div><b className="mono">0</b><h3>Lights you don’t own</h3><p>Plans use only the fixtures in your kit, with real output and beam angles.</p></div>
          <div><b className="mono">±1.5 EV</b><h3>On every face</h3><p>Exposure is worked out per actor at your T-stop and ISO, with skin tone set per actor.</p></div>
          <div><b className="mono">180°</b><h3>Eyelines that cut</h3><p>Cameras crossing the line, stands in frame and lights blocking the lens are flagged with a fix.</p></div>
        </div>
      </section>

      <section className="l-section" aria-labelledby="model">
        <h2 id="model">The 3D plan is the source of truth</h2>
        <p className="sub">Our first test with a real image model kept the room and the light we asked for, but added props and changed furniture. So every generated frame is checked against the plan before the crew sees it.</p>
        <div className="compare">
          <figure><img src="refs/location-input.jpg" alt="Empty living room in daylight with a green sofa, round table and floor lamp" loading="lazy" /><figcaption>Input: the location in daylight</figcaption></figure>
          <figure><img src="refs/model-output.jpg" alt="The same room at night, two people on the sofa lit by a warm lamp, cool light at the windows" loading="lazy" /><figcaption>Model output: warm practical key and cool window light, plus props nobody asked for</figcaption></figure>
        </div>
      </section>

      <section className="l-section closing">
        <h2>Rehearse the shoot day here first.</h2>
        <div className="hero-cta">
          <a className="btn primary lg" href="#/login">Start a scene</a>
          <a className="btn lg quiet" href="#/pricing">See pricing</a>
        </div>
      </section>
      <Footer />
    </div>
  )
}
