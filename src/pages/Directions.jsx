import { useEffect, useState } from 'react'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, navigate } from '../store.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { runGeneration, runVariants, openDirection, openMix, stillFor, onStill, vote, startLearning } from '../actions.js'

const STAGES = [['plan', 'Plan', 'Distinct looks'], ['design', 'Design', 'Dressing, blocking, lighting'], ['validate', 'Validate', 'Gear, frame, exposure, 180°'], ['review', 'Review', 'A DP reads every layer']]

function useStills() {
  const [, force] = useState(0)
  useEffect(() => onStill(() => force((x) => x + 1)), [])
}

import { POSE_LABEL } from '../plan/storyboard.js'

// The three things that actually differ between looks, in the words a DP would use.
function lookSpec(d) {
  const sc = d.scene
  const cam = sc.cameras.find((c) => c.id === sc.activeCam) || sc.cameras[0]
  const key = sc.lights.find((l) => l.role === 'key') || sc.lights[0]
  let side = ''
  if (cam && key) { const ax = cam.aim[0] - cam.x, az = cam.aim[2] - cam.z, lx = key.x - cam.x, lz = key.z - cam.z; side = ax * lz - az * lx > 0 ? 'camera right' : 'camera left' }
  return [
    ['Blocking', sc.actors.map((a) => `${a.name} ${POSE_LABEL[a.pose] || a.pose}`).join(', ')],
    ['Key light', key ? `${FIXTURES[key.fixture]?.name || 'Light'} from ${side}, ${key.cct} K at ${Math.round(key.intensity * 100)}%` : 'Available light only'],
    ['Coverage', `${sc.cameras.length} camera${sc.cameras.length > 1 ? 's' : ''}: ${sc.cameras.map((c) => `${c.focal} mm`).join(', ')}`],
    ['To light', `About ${d.setupMin} min with ${sc.lights.length} unit${sc.lights.length > 1 ? 's' : ''}`],
  ]
}

const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

function Pipeline({ gen }) {
  const order = STAGES.map((s) => s[0])
  const cur = gen.status === 'done' ? 4 : order.indexOf(gen.stage)
  return (
    <div className="pipeline" aria-live="polite">
      {STAGES.map(([k, name, desc], i) => {
        const st = gen.status === 'done' || i < cur ? 'done' : i === cur ? 'on' : ''
        return <div key={k} className={st}><b>{st === 'done' ? '✓ ' : ''}{name}{st === 'on' && gen.index >= 0 ? ` · ${gen.index + 1} of ${gen.plan?.length || 4}` : ''}</b><span>{st === 'on' ? gen.log[gen.log.length - 1] : desc}</span></div>
      })}
    </div>
  )
}

function DirectionCard({ d, index, maxSetup, votes, busy }) {
  const url = stillFor(d)
  const myVote = (votes[d.id] || []).length
  const over = d.setupMin > maxSetup
  return (
    <article className={'dir' + (myVote ? ' voted' : '')}>
      <div className="dir-still">
        {url ? <img src={url} alt={`${d.name}, main camera`} /> : <div className="loading"><div className="dir-plan-ph"><PlanSVG scene={d.scene} width={480} height={200} /></div><span className="mono">Rendering Cam {d.scene.cameras.find((c) => c.id === d.scene.activeCam)?.label || 'A'}…</span></div>}
        <div className="tagline">
          <span className="chip mono">{String.fromCharCode(65 + index)}</span>
          <span className="chip">{d.scene.cameras.find((c) => c.id === d.scene.activeCam)?.shot} · {d.scene.cameras.find((c) => c.id === d.scene.activeCam)?.focal}mm</span>
        </div>
      </div>
      <div className="dir-head">
        <div>
          <h3>{d.name}</h3>
          <p className="mood">{d.mood}</p>
        </div>
        <div className="mini-plan" title="Top view"><PlanSVG scene={d.scene} width={320} height={240} /></div>
      </div>
      <div className="dir-body">
        <dl className="dir-spec">{lookSpec(d).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>

        <details className="dir-details"><summary>Gear, technical details and reasoning</summary>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="chip">{d.difficulty}</span>
          <span className={'chip mono' + (over ? ' warm' : '')} title={over ? `Longer than your ${maxSetup} min limit` : ''}>≈ {d.setupMin} min to light{over ? ' · over limit' : ''}</span>
          {Object.entries(d.gearUse).map(([k, v]) => <span key={k} className="chip">{v} × {FIXTURES[k].name}</span>)}
          {d.scene.lights.map((l) => <span key={l.id} className="chip" style={{ height: 22 }}><span className="dot lamp" /><span className="mono">{l.cct} K</span></span>)}
          <span className="chip mono">T{d.scene.tstop} · ISO {d.scene.iso}</span>
        </div>
        <ul className="why">
          {d.why.map((w) => <li key={w.layer}><span className="layer">{w.layer}</span><span><span className="ref">{w.ref}</span><span className="txt">{w.text}</span></span></li>)}
        </ul>
        {(d.notes.length > 0 || d.repaired.length > 0) && (
          <ul className="notes">
            {d.notes.map((n) => <li key={n}>· {n}</li>)}
            {d.repaired.map((n) => <li key={n}>· Fixed in validation: {n}</li>)}
          </ul>
        )}
        </details>
      </div>
      <div className="dir-foot">
        <button className="btn primary" onClick={() => openDirection(d)}>Start from this look <Icon name="arrowR" size={15} /></button>
        <button className="btn" onClick={() => runVariants(d.key)} disabled={busy}><Icon name="sparkle" size={14} /> More like this</button>
        <button className={'btn ghost sm'} onClick={() => vote(d.id)} aria-pressed={!!myVote}><Icon name="vote" size={14} /> {myVote ? `Voted (${myVote})` : 'Vote'}</button>
        <span className="dim" style={{ fontSize: 12, marginLeft: 'auto' }}>{d.openIssues.length ? `${d.openIssues.length} note${d.openIssues.length > 1 ? 's' : ''}` : 'All checks pass'}</span>
      </div>
    </article>
  )
}

export default function Directions() {
  useStills()
  const { gen, directions, setup, votes, firstDirectionAt } = useStore((s) => ({ gen: s.gen, directions: s.directions, setup: s.setup, votes: s.votes || {}, firstDirectionAt: s.firstDirectionAt }))
  const [pick, setPick] = useState({})
  useEffect(() => {
    if (directions.length >= 2) setPick((p) => (p.dressing ? p : { dressing: directions[0].id, blocking: directions[0].id, lighting: directions[0].id }))
  }, [directions])

  if (gen.status === 'idle' && !directions.length) {
    return (
      <div className="page">
        <div className="page-head"><div><div className="kicker"><span className="stepno">2</span> Looks</div><h1>No looks yet</h1><p>Finish the set up, then generate. It takes about a minute.</p></div></div>
        <div className="row"><button className="btn primary" onClick={() => navigate('/setup')}>Go to set up</button><button className="btn" onClick={() => { runGeneration() }}>Generate with the current set up</button></div>
      </div>
    )
  }
  const slots = Math.max(gen.plan?.length || 4, directions.length)
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker"><span className="stepno">2</span> Looks</div>
          <h1>{gen.status === 'running' ? 'Lighting four looks' : 'Pick a starting look'}</h1>
          <p className="looks-lead">Same scene, same kit, four different ways to shoot it. Each look decides where the actors sit or stand, where the key light comes from and where the cameras go. Pick the one closest to what you imagine. You can change every part of it in the next step.</p>
          <p className="looks-brief">“{setup.brief.text}”</p>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', gap: 18 }}>
          {firstDirectionAt && (
            <div title="From starting set up to the first direction. Goal: under 5 minutes.">
              <div className="dim" style={{ fontSize: 12 }}>First look after</div>
              <div className={'timer ' + (firstDirectionAt.ms < 300000 ? 'warm' : '')}>{fmt(firstDirectionAt.ms)}</div>
            </div>
          )}
          <button className="btn" onClick={() => navigate('/setup')}>Edit set up</button>
          <button className="btn" onClick={() => runGeneration()} disabled={gen.status === 'running'}><Icon name="refresh" size={15} /> Regenerate</button>
        </div>
      </div>
      <Pipeline gen={gen} />
      {gen.status === 'done' && directions.length > 0 && (() => {
        const best = [...directions].sort((a, b) => a.openIssues.length - b.openIssues.length || a.setupMin - b.setupMin)[0]
        const quick = [...directions].sort((p, q) => p.setupMin - q.setupMin)[0]
        return (
          <div className="ai-note pick">
            <div className="ai-note-h"><span className="ai-mark">✦</span>Where I would start</div>
            <p className="ai-say"><b>{best.name}</b> is a practical starting point: {best.openIssues.length} open checks and about {best.setupMin} minutes to light. {quick.id !== best.id ? <>If the schedule is tight, <b>{quick.name}</b> lights in about {quick.setupMin} minutes.</> : <>It’s also the quickest to light.</>}</p>
            <div className="row" style={{ gap: 6 }}><button className="btn ai sm" onClick={() => openDirection(best)}><span className="ai-mark">✦</span> Start from {best.name}</button>{quick.id !== best.id && <button className="btn sm" onClick={() => openDirection(quick)}>Start from {quick.name}</button>}</div>
          </div>
        )
      })()}
      <div className="dir-grid">
        {Array.from({ length: slots }, (_, i) => directions[i]
          ? <DirectionCard key={directions[i].id} d={directions[i]} index={i} maxSetup={setup.brief.maxSetup} votes={votes} busy={!!gen.variantFor} />
          : <div key={i} className="dir skeleton" style={{ '--d': `${i * 0.35}s` }}><div className="sk-lamps" aria-hidden="true"><i /><i /><i /></div><div className="sk-t"><span className="mono">Look {String.fromCharCode(65 + i)}</span><b>{gen.plan?.[i] ? `Lighting “${gen.plan[i]}”` : 'Waiting for the plan'}</b><small>Placing actors, then lights from your kit, then cameras</small></div></div>)}
      </div>
      {gen.variantFor && <p className="muted row" style={{ marginTop: 12 }}><span className="spinner" /> Designing variants…</p>}
      {directions.length >= 2 && (
        <details className="card mix"><summary>Advanced: mix layers from different looks</summary>
          <h4>Mix layers</h4>
          {['dressing', 'blocking', 'lighting'].map((layer) => (
            <label className="field" key={layer}><span>{layer === 'dressing' ? 'Set dressing from' : layer === 'blocking' ? 'Blocking and camera from' : 'Lighting from'}</span>
              <select className="select" value={pick[layer] || ''} onChange={(e) => setPick({ ...pick, [layer]: e.target.value })}>{directions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </label>
          ))}
          <button className="btn" onClick={() => openMix(pick)}>Open the mix</button>
        </details>
      )}
      <p className="dim" style={{ fontSize: 12.5, marginTop: 14 }}>Teaching or learning? <button className="btn ghost sm" onClick={startLearning}><Icon name="learn" size={14} /> Light it yourself first</button> and get a critique before seeing these.</p>
    </div>
  )
}
