import { useEffect, useState } from 'react'
import { MarketingNav, Footer } from './Marketing.jsx'
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

// pre-rendered previs frames from the real engine (see dev/), shown full-bleed in the hero
const FRAMES = [
  { src: 'hero/apartment.jpg', slug: 'INT. APARTMENT, NIGHT', cam: 'A', mm: 21, t: '2.8', iso: 800, k: '3200K / 5600K' },
  { src: 'hero/street.jpg', slug: 'EXT. STREET, NIGHT', cam: 'A', mm: 24, t: '2', iso: 1600, k: '2100K / 4300K' },
  { src: 'hero/trench.jpg', slug: 'EXT. TRENCH, DUSK', cam: 'A', mm: 24, t: '4', iso: 800, k: '1800K / 5600K' },
]

const STEPS = [
  ['Set up', 'Describe the location in a sentence, or drag out the floor plan. Add the lights you own and paste the scene.'],
  ['Directions', 'Four distinct ways to shoot it, each with set dressing, blocking, camera and light, and the reasons.'],
  ['Studio', 'Walk the set in 3D, look through every lens, and tell the AI what to change in plain words.'],
  ['Review', 'Send a link to the DP or the client. Their notes come back as changes you can apply.'],
  ['Shot plan', 'Lighting plot, shot list, gear list and a shooting order the crew can print.'],
]

const AI = [
  ['Draws the location from a description', 'Set up'],
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

const LOCATIONS = [
  ['living', 'trapped', 'night', 'Living room'], ['bedroom', 'coldwar', 'night', 'Bedroom'], ['office', 'coldwar', 'night', 'Office'], ['diner', 'coldwar', 'day', 'Kitchen'],
  ['warehouse', 'coldwar', 'night', 'Warehouse'], ['street', 'trapped', 'night', 'Street'], ['forest', 'coldwar', 'dusk', 'Forest'], ['battlefield', 'coldwar', 'dusk', 'Battlefield'],
]

export default function Landing() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((x) => (x + 1) % FRAMES.length), 5200)
    return () => clearInterval(t)
  }, [])
  const f = FRAMES[i]
  return (
    <div className="landing b">
      <MarketingNav />

      <header className="b-hero">
        <div className="b-frame" aria-hidden="true">
          {FRAMES.map((x, j) => <img key={x.src} src={x.src} alt="" className={j === i ? 'on' : ''} />)}
          <div className="b-hud">
            <span className="vf tl" /><span className="vf tr" />
            <div className="b-hud-line"><b>● CAM {f.cam}</b><span>{f.mm} MM</span><span>T{f.t}</span><span>ISO {f.iso}</span><span>{f.k}</span></div>
          </div>
        </div>
        <div className="b-copy">
          <h1>See the shot before you light it.</h1>
          <p>Describe the location and the scene. SceneMood blocks the actors, places your lights and frames every camera in 3D, using only the gear your crew owns.</p>
          <div className="b-cta">
            <a className="btn primary lg" href="#/login">Start a scene</a>
            <button className="btn lg" onClick={() => openSample()}>Open the sample scene</button>
          </div>
          <div className="b-slug" aria-live="polite"><span>{f.slug}</span><span className="dim">Previs render from SceneMood</span></div>
        </div>
      </header>

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

      <section className="b-sec" aria-labelledby="how">
        <div className="b-head"><h2 id="how">From an empty room to a shot plan.</h2></div>
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
