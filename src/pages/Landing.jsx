import { useMemo } from 'react'
import Logo from '../components/Logo.jsx'
import Viewport from '../components/Viewport.jsx'
import Icon from '../components/Icons.jsx'
import { emptyScene, roomFromTemplate, setState, navigate } from '../store.js'
import { sampleScene } from '../ai/sim.js'
import { getKit, FIXTURES, cctToHex } from '../data/gear.js'

const SAMPLE_SETUP = {
  room: roomFromTemplate('living'),
  kit: { ...getKit('two').items },
  brief: { text: 'Night. She wants to leave but doesn’t.', time: 'night', aspect: '2.39', actors: 2, tones: { actor_a: 'medium', actor_b: 'deep' } },
}

export default function Landing() {
  const scene = useMemo(() => {
    const base = emptyScene(SAMPLE_SETUP)
    base.actors = base.actors.map((a) => ({ ...a, tone: SAMPLE_SETUP.brief.tones[a.id] }))
    // the hero opens up one stop so the set reads on a web page
    return { ...sampleScene(base, SAMPLE_SETUP.kit, SAMPLE_SETUP.brief, 0), tstop: 2 }
  }, [])

  const openSample = () => {
    setState({ scene: structuredClone(scene), activeDirection: null, history: [], future: [], pending: null, selection: null })
    navigate('/studio')
  }

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-canvas">
          <Viewport scene={scene} mode="showcase" view="set" ui={{ cones: true }} camPos={[5.6, 4.2, 6.2]} target={[0.2, 0.7, -0.6]} className="vp" />
        </div>
        <div className="hero-shade" />
        <div className="hero-nav">
          <Logo size={26} />
          <nav>
            <a href="#how">How it works</a>
            <a href="#model">The model</a>
            <a href="#/studio" onClick={(e) => { e.preventDefault(); openSample() }}>Sample scene</a>
          </nav>
        </div>
        <div className="hero-copy">
          <h1>Design the scene before the shoot.</h1>
          <p className="lede">Describe the mood. SceneMood proposes where things go, where people stand and where the lights sit, using only the room and the gear you actually have. Then you check every shot through the lens.</p>
          <div className="hero-cta">
            <a className="btn primary lg" href="#/setup">Start a scene <Icon name="arrowR" /></a>
            <button className="btn lg" onClick={openSample}>Open the sample scene</button>
          </div>
        </div>
        <div className="hero-legend" aria-label="What the sample scene uses">
          {scene.lights.map((l) => (
            <span key={l.id} className="chip"><span className="dot" style={{ background: cctToHex(l.cct) }} />{l.label} · {FIXTURES[l.fixture].name} · {l.cct} K</span>
          ))}
          {scene.cameras.map((c) => <span key={c.id} className="chip"><span className="dot" style={{ background: c.id === scene.activeCam ? 'var(--tungsten)' : 'var(--dim)' }} />Cam {c.label} · {c.focal} mm</span>)}
        </div>
      </section>

      <section className="section" id="how">
        <h2>From a mood to a plan your crew can build</h2>
        <p className="sub">Small crews rarely have an art department or a previs budget. SceneMood gives them one afternoon of both, in about five minutes.</p>
        <div className="flow">
          <div className="flow-step">
            <span className="n">1</span>
            <h3>Describe the room and your kit</h3>
            <p>Pick a room template, set the size, mark doors, windows and outlets. Tick the lights you own. Write one line about the scene.</p>
            <span className="t">About 3 minutes</span>
          </div>
          <div className="flow-step">
            <span className="n">2</span>
            <h3>Pick from three directions</h3>
            <p>Each direction is a complete plan: set dressing, blocking and camera, lighting. They differ in mood and in how much gear they need, and every one passes the feasibility checks.</p>
            <span className="t">About 60 seconds</span>
          </div>
          <div className="flow-step">
            <span className="n">3</span>
            <h3>Check it through the lens</h3>
            <p>Edit in 3D, look through each camera, read exposure in false color, and tell the AI what to change in plain words. Export a shot plan for the crew.</p>
            <span className="t">As long as you like</span>
          </div>
        </div>
      </section>

      <section className="section" id="model" style={{ paddingTop: 0 }}>
        <h2>The 3D plan stays the source of truth</h2>
        <p className="sub">A pre-trained image model turns the camera view into a mood frame. Our first real test kept the room and the light we asked for, but it also added a mug and bowl and changed small furniture details. That is why SceneMood checks every generated frame against the plan before the crew sees it.</p>
        <div className="compare">
          <figure>
            <img src="refs/location-input.jpg" alt="Empty living room in daylight with a green sofa, round table and floor lamp" loading="lazy" />
            <figcaption>Input: location, daylight</figcaption>
          </figure>
          <figure>
            <img src="refs/model-output.jpg" alt="The same room at night, two actors on the sofa lit by a warm lamp, cool moonlight at the windows" loading="lazy" />
            <figcaption>Output: night, warm practical key, cool window light. Unrequested: props on the table.</figcaption>
          </figure>
        </div>
      </section>

      <footer className="footer">
        <span>SceneMood, a pre-trained model prototype. AI responses in this build are simulated; no API key is connected.</span>
        <span>Group 3 · AI Products P3</span>
      </footer>
    </div>
  )
}
