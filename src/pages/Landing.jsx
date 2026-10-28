import { useEffect, useRef, useState } from 'react'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { MarketingNav, Footer } from './Marketing.jsx'
import { emptyScene, defaultSetup, setState, navigate } from '../store.js'
import { sampleScene } from '../ai/sim.js'
import { FIXTURES, cctToHex } from '../data/gear.js'

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

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

const DIRECTIONS = [
  { key: 'trapped', name: 'Trapped', line: 'Warm pool on the couch, cold night at the window.', gear: '2 panels + bounce · 40 min' },
  { key: 'coldwar', name: 'Cold war', line: 'Different corners of one room, flat cool light.', gear: '2 panels · 20 min' },
  { key: 'boiling', name: 'Boiling point', line: 'Standing, a table between them, hard side light.', gear: '2 panels · 50 min' },
  { key: 'lastlight', name: 'Last light', line: 'She sits in the window light, he stays in the dark.', gear: '1 panel + bounce · 15 min' },
]

export default function Landing() {
  const storyRef = useRef(null)
  const [p, setP] = useState(0)
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = storyRef.current
        if (!el) return
        const total = el.offsetHeight - window.innerHeight
        setP(Math.max(0, Math.min(1, window.scrollY / total)))
        setSolid(window.scrollY > el.offsetHeight - window.innerHeight * 0.9)
      })
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])

  const beat = p < 0.16 ? 0 : p < 0.4 ? 1 : p < 0.62 ? 2 : 3
  const lensT = smooth(0.6, 0.92, p)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const bar = Math.max(0, (vh - vw / 2.39) / 2)
  const hud = smooth(0.82, 0.95, p)
  const cam = SAMPLE.scene.cameras.find((c) => c.id === SAMPLE.scene.activeCam)
  const key = SAMPLE.scene.lights.find((l) => l.role === 'key')

  return (
    <div className="landing">
      <MarketingNav solid={solid} />
      <section className="story" ref={storyRef} aria-label="How SceneMood works">
        <div className="story-stage">
          <div className="story-canvas" aria-hidden="true">
            <img className={'story-img' + (beat === 0 ? ' on' : '')} src="story/overview-work.jpg" alt="" />
            <div className={'story-img plan' + (beat === 1 ? ' on' : '')}><PlanSVG scene={SAMPLE.scene} labels width={960} height={600} /></div>
            <img className={'story-img' + (beat === 2 ? ' on' : '')} src="story/overview-lit.jpg" alt="" />
            <img className={'story-img lens' + (beat === 3 ? ' on' : '')} src="stills/living-trapped.jpg" alt="" style={{ transform: `scale(${1.08 - lensT * 0.08})` }} />
          </div>
          <div className="story-shade" style={{ opacity: 1 - hud * 0.85 }} />
          <div className="lens-hud" style={{ opacity: hud }} aria-hidden="true">
            <div className="bar" style={{ top: 0, height: bar }} />
            <div className="bar" style={{ bottom: 0, height: bar }} />
            {[['tl', { top: bar + 20, left: 24, borderTopWidth: 2, borderLeftWidth: 2 }], ['tr', { top: bar + 20, right: 24, borderTopWidth: 2, borderRightWidth: 2 }], ['bl', { bottom: bar + 20, left: 24, borderBottomWidth: 2, borderLeftWidth: 2 }], ['br', { bottom: bar + 20, right: 24, borderBottomWidth: 2, borderRightWidth: 2 }]].map(([k, st]) => <div key={k} className="corner" style={st} />)}
            <div className="rec" style={{ top: bar + 24, left: 60 }}><span className="dot" style={{ background: 'var(--tally)', boxShadow: '0 0 8px var(--tally)' }} />CAM {cam.label} · {cam.shot}</div>
            <div className="strip" style={{ bottom: Math.max(14, bar - 30), left: 24 }}>
              <span>CAM <b>{cam.label}</b></span><span><b>{cam.focal}</b> MM</span><span><b>T{SAMPLE.scene.tstop}</b></span><span>ISO <b>{SAMPLE.scene.iso}</b></span><span>KEY <b>{key?.cct}K</b></span><span><b>2.39</b>:1</span>
            </div>
          </div>

          <div className={'story-copy' + (beat === 0 ? '' : ' hidden')}>
            <h1>Design the scene before the shoot.</h1>
            <p>Describe the room and the mood. SceneMood’s AI proposes where things go, where people stand and where every light sits, using only the gear you own. Then you check every shot through the lens.</p>
            <div className="row wrap">
              <a className="btn primary lg" href="#/login">Start a scene <Icon name="arrowR" /></a>
              <button className="btn lg" onClick={() => openSample()}>Open the sample scene</button>
            </div>
          </div>
          <div className={'beat' + (beat === 1 ? '' : ' hidden')}>
            <span className="n">1</span>
            <h2>Tell it the room and the gear you own</h2>
            <p>Pick a room template, set the size, mark doors, windows and outlets, tick your lights. Three minutes.</p>
          </div>
          <div className={'beat' + (beat === 2 ? '' : ' hidden')}>
            <span className="n">2</span>
            <h2>Get four directions in a minute</h2>
            <p>Each one dresses the set, blocks the actors and places the lights, and every suggestion says why. Nothing it proposes needs gear you don&apos;t have.</p>
          </div>
          <div className={'beat' + (beat === 3 ? '' : ' hidden')} style={{ bottom: bar + 70 }}>
            <span className="n">3</span>
            <h2>Check it through the lens</h2>
            <p>Look through every camera, read exposure on each face, and tell it what to change in plain words. Then hand the crew a shot plan.</p>
          </div>
          <div className="legend" style={{ opacity: beat === 1 || beat === 2 ? 1 : 0 }} aria-hidden={!(beat === 1 || beat === 2)}>
            {beat === 1 && <>
              <span className="chip">Living room · 5.4 × 4.4 m · 2 windows · 1 door</span>
              {Object.entries(SAMPLE.setup.kit).map(([k, n]) => <span key={k} className="chip">{n} × {FIXTURES[k].name}</span>)}
            </>}
            {beat === 2 && SAMPLE.scene.lights.map((l) => (
              <span key={l.id} className="chip"><span className="dot" style={{ background: cctToHex(l.cct) }} />{l.label} · {l.cct} K · {l.why?.ref}</span>
            ))}
          </div>
          <div className="progress-dots" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={beat === i ? 'on' : ''} />)}</div>
          {beat === 0 && <div className="scroll-cue">Scroll to step onto the set</div>}
        </div>
      </section>

      <section className="l-section" id="ai">
        <div className="slate-rule" />
        <h2>An AI first AD at every step</h2>
        <p className="sub">SceneMood doesn’t just draw a 3D room. The AI does the tedious parts of prep with you, and every suggestion says why, so you stay in charge.</p>
        <div className="ai-grid">
          {[
            ['Draws the room from a sentence', '“Old living room, 5 by 4, two windows on the left.” It builds the floor plan; you drag to fix.', 'Set up'],
            ['Reads your script page', 'Paste the scene. It pulls out day or night, the characters and the mood.', 'Set up'],
            ['Proposes four directions', 'Dressing, blocking, camera and light, built only from the gear you own, each with its reasons.', 'Directions'],
            ['Watches the set with you', 'Flags a face that’s two stops under or a stand in frame, and offers the fix in one click.', 'Studio'],
            ['Turns notes into changes', 'The DP and client comment on a link. It groups the notes into set changes and applies them.', 'Review'],
            ['Plans the shoot day', 'Shooting order, setup times, power and continuity risks, written into the call sheet.', 'Shot plan'],
          ].map(([t, d, step]) => <div key={t} className="ai-card-l"><span className="ai-mark">✦</span><h3>{t}</h3><p>{d}</p><span className="chip">{step}</span></div>)}
        </div>
      </section>

      <section className="l-section" id="directions" style={{ paddingTop: 0 }}>
        <div className="slate-rule" />
        <h2>One brief, four ways to shoot it</h2>
        <p className="sub">“Night. She wants to leave but doesn&apos;t.” The same room and the same two-light kit, read four different ways. Each direction changes the set dressing, the blocking and the light, and comes with its setup time.</p>
        <div className="still-grid">
          {DIRECTIONS.map((d) => (
            <figure className="still" key={d.key} style={{ margin: 0 }}>
              <img src={`stills/living-${d.key}.jpg`} alt={`${d.name}: ${d.line}`} loading="lazy" />
              <figcaption>
                <div><b>{d.name}</b><div className="muted" style={{ fontSize: 13.5 }}>{d.line}</div></div>
                <span className="mono">{d.gear}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="l-section" style={{ paddingTop: 0 }}>
        <div className="slate-rule" />
        <h2>Checks a crew can trust</h2>
        <p className="sub">The model proposes. Code checks. Every direction is validated before you see it, and the checks keep running while you edit.</p>
        <div className="trust">
          <div><span className="big warm">0</span><h3>Lights you don&apos;t own</h3><p>Plans use only the fixtures in your kit, with real output in candela and real beam angles.</p></div>
          <div><span className="big">±1.5</span><h3>Stops on every face</h3><p>Exposure is calculated per actor at your T-stop and ISO, with skin tone set per actor so darker skin isn&apos;t left underlit.</p></div>
          <div><span className="big cool">180°</span><h3>Eyelines that cut</h3><p>Cameras that cross the line, stands in frame and lights blocking the lens are flagged with a one-click fix.</p></div>
        </div>
      </section>

      <section className="l-section" style={{ paddingTop: 0 }} id="model">
        <div className="slate-rule" />
        <h2>The 3D plan is the source of truth</h2>
        <p className="sub">Our first test with a real image model kept the room and the light we asked for, but added a mug and bowl and changed small furniture details. So every generated frame is checked against the plan before the crew sees it.</p>
        <div className="compare">
          <figure><img src="refs/location-input.jpg" alt="Empty living room in daylight with a green sofa, round table and floor lamp" loading="lazy" /><figcaption>Input: the location, in daylight</figcaption></figure>
          <figure><img src="refs/model-output.jpg" alt="The same room at night, two people on the sofa lit by a warm lamp, cool moonlight at the windows" loading="lazy" /><figcaption>Model output: night, warm practical key, cool window light. Not requested: props on the table.</figcaption></figure>
        </div>
      </section>

      <section className="l-section" style={{ paddingTop: 0 }}>
        <div className="cta-band">
          <div>
            <h2 style={{ fontSize: 'clamp(40px, 4vw, 60px)' }}>Your next shoot day is expensive.<br />Rehearse it here first.</h2>
            <p className="muted" style={{ margin: '10px 0 0' }}>Free for two scenes a month. Project passes from $19.</p>
          </div>
          <div className="row wrap">
            <a className="btn primary lg" href="#/login">Start a scene</a>
            <a className="btn lg" href="#/pricing">See pricing</a>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
