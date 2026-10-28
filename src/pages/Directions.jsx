import { useEffect, useState } from 'react'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, navigate } from '../store.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { runGeneration, openDirection, openMix } from '../actions.js'

const STAGES = [
  ['plan', 'Plan', 'Three distinct directions'],
  ['design', 'Design', 'Dressing, blocking, lighting'],
  ['validate', 'Validate', 'Gear, frame, exposure, 180°'],
  ['review', 'Review', 'A DP reads every layer'],
]

function Pipeline({ gen, count }) {
  const order = STAGES.map((s) => s[0])
  const cur = gen.status === 'done' ? 4 : order.indexOf(gen.stage)
  return (
    <div className="pipeline" aria-live="polite">
      {STAGES.map(([k, name, desc], i) => {
        const state = gen.status === 'done' || i < cur ? 'done' : i === cur ? 'on' : ''
        return (
          <div key={k} className={state}>
            <b>{name}{state === 'on' && gen.index >= 0 ? ` · ${gen.index + 1} of 3` : ''}</b>
            <span>{state === 'on' ? gen.log[gen.log.length - 1] : desc}</span>
          </div>
        )
      })}
      {count === 0 && gen.status === 'idle' && null}
    </div>
  )
}

function DirectionCard({ d, index }) {
  const lights = d.scene.lights
  return (
    <article className="dir">
      <div className="dir-plan">
        <PlanSVG scene={d.scene} width={400} height={300} />
      </div>
      <div className="dir-body">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{d.name}</h3>
          <span className="mono dim" style={{ fontSize: 12 }}>{String.fromCharCode(65 + index)}</span>
        </div>
        <p className="mood">{d.mood}</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="chip">{d.difficulty}</span>
          <span className="chip mono">≈ {d.setupMin} min to light</span>
          {Object.entries(d.gearUse).map(([k, v]) => <span key={k} className="chip">{v} × {FIXTURES[k].name}</span>)}
        </div>
        <div className="row" style={{ gap: 4 }} aria-label="Color temperatures">
          {lights.map((l) => <span key={l.id} className="chip" style={{ height: 22 }}><span className="dot" style={{ background: cctToHex(l.cct) }} /><span className="mono">{l.cct} K</span></span>)}
        </div>
        <ul className="why">
          {d.why.map((w) => (
            <li key={w.layer}>
              <span className="layer">{w.layer}</span>
              <span><span className="ref">{w.ref}</span><span className="txt">{w.text}</span></span>
            </li>
          ))}
        </ul>
        {(d.notes.length > 0 || d.repaired.length > 0) && (
          <ul className="notes">
            {d.notes.map((n) => <li key={n}>{n}</li>)}
            {d.repaired.map((n) => <li key={n}>Fixed in validation: {n}</li>)}
          </ul>
        )}
      </div>
      <div className="dir-foot">
        <button className="btn primary" onClick={() => openDirection(d)}>Open in studio <Icon name="arrowR" size={15} /></button>
        <span className="row dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
          {d.openIssues.length ? `${d.openIssues.length} note${d.openIssues.length > 1 ? 's' : ''} to review` : 'All checks pass'}
        </span>
      </div>
    </article>
  )
}

export default function Directions() {
  const { gen, directions, setup } = useStore((s) => ({ gen: s.gen, directions: s.directions, setup: s.setup }))
  const [pick, setPick] = useState({})
  useEffect(() => {
    if (directions.length >= 3) setPick((p) => (p.dressing ? p : { dressing: directions[0].id, blocking: directions[0].id, lighting: directions[0].id }))
  }, [directions])

  if (gen.status === 'idle' && !directions.length) {
    return (
      <div className="dirs">
        <div className="dirs-head"><div><h1>No directions yet</h1><p>Set up the room, your gear and the scene first.</p></div></div>
        <button className="btn primary" onClick={() => navigate('/setup')}>Go to set up</button>
      </div>
    )
  }
  const slots = [0, 1, 2]
  return (
    <div className="dirs">
      <div className="dirs-head">
        <div>
          <h1>Three directions</h1>
          <p>“{setup.brief.text}”</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigate('/setup')}>Edit set up</button>
          <button className="btn" onClick={() => runGeneration()} disabled={gen.status === 'running'}><Icon name="refresh" size={15} /> Regenerate</button>
        </div>
      </div>
      <Pipeline gen={gen} count={directions.length} />
      <div className="dir-grid">
        {slots.map((i) => directions[i]
          ? <DirectionCard key={directions[i].id} d={directions[i]} index={i} />
          : (
            <div key={i} className="dir loading">
              <div className="skeleton">
                <div className="spinner" />
                <span>{gen.plan?.[i] ? `Designing “${gen.plan[i]}”` : 'Waiting for the plan'}</span>
              </div>
            </div>
          ))}
      </div>
      {directions.length >= 3 && (
        <div className="mix">
          <h4>Mix layers</h4>
          {['dressing', 'blocking', 'lighting'].map((layer) => (
            <label className="field" key={layer}>
              <span>{layer === 'dressing' ? 'Set dressing from' : layer === 'blocking' ? 'Blocking and camera from' : 'Lighting from'}</span>
              <select className="select" value={pick[layer] || ''} onChange={(e) => setPick({ ...pick, [layer]: e.target.value })}>
                {directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          ))}
          <button className="btn" onClick={() => openMix(pick)}>Open mix in studio</button>
        </div>
      )}
    </div>
  )
}
