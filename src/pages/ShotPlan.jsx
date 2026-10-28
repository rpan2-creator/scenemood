import { useEffect, useMemo, useState } from 'react'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, navigate, activeProject, activeSceneMeta } from '../store.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { getAsset } from '../data/assets.js'
import { runChecks, stopsAt, exposureTarget } from '../engine/checks.js'
import { useCamStills } from '../components/useCamStills.js'
import { Modal } from './Projects.jsx'
import { productionNotes } from '../ai/copilot.js'
import { toast, shareLink, exportShotList, exportGearList, RENTAL_HOUSES, quoteFor } from '../actions.js'

const POSE = { sit: 'Seated', hunched: 'Seated, leaning in', turned: 'Turned away', stand: 'Standing', crossed: 'Standing, arms crossed' }

function CallSheet({ st, scene, proj, meta, dir, used }) {
  const date = proj?.shootDate || new Date().toISOString().slice(0, 10)
  return (
    <div className="callsheet">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div><h2>{proj?.name}</h2><div>Scene {meta?.num} · {meta?.name}</div></div>
        <div style={{ textAlign: 'right' }}><b>Shoot day</b><div>{date}</div><div>Crew call 2 h before first shot</div></div>
      </div>
      <table>
        <thead><tr><th>Shot</th><th>Description</th><th>Lens</th><th>Cast</th><th>Est. setup</th></tr></thead>
        <tbody>{scene.cameras.map((c, i) => <tr key={c.id}><td>{meta?.num}{String.fromCharCode(65 + i)}</td><td>{c.shot}</td><td>{c.focal} mm</td><td>{scene.actors.map((a) => a.name).join(', ')}</td><td>{i === 0 ? `${dir?.setupMin || 30} min` : '10 min'}</td></tr>)}</tbody>
      </table>
      <table>
        <thead><tr><th>Crew</th><th>Role</th><th>Contact</th></tr></thead>
        <tbody>{st.team.members.map((m) => <tr key={m.name}><td>{m.name}</td><td>{m.role}</td><td>{m.email || '—'}</td></tr>)}</tbody>
      </table>
      <table>
        <thead><tr><th>Lighting</th><th>Qty</th><th>Notes</th></tr></thead>
        <tbody>{Object.entries(used).map(([k, n]) => <tr key={k}><td>{FIXTURES[k].name}</td><td>{n}</td><td>{FIXTURES[k].spec}</td></tr>)}<tr><td>Stands, sandbags, stingers</td><td>{scene.lights.length}</td><td>One per unit</td></tr></tbody>
      </table>
      <p style={{ marginTop: 10 }}>Exposure: T{scene.tstop}, ISO {scene.iso}, {scene.aspect}:1. Look: {dir?.name || 'Custom'}{dir?.mood ? ` — ${dir.mood}` : ''}</p>
    </div>
  )
}

function Quote({ scene, kit, onClose }) {
  const [house, setHouse] = useState(RENTAL_HOUSES[0].id)
  const [days, setDays] = useState(1)
  const [onlyShort, setOnlyShort] = useState(true)
  const h = RENTAL_HOUSES.find((x) => x.id === house)
  const q = quoteFor(h, scene, kit, days)
  const total = (onlyShort ? q.shortOnly : q.sub) + q.delivery
  return (
    <Modal title="Request a rental quote" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Demo partners and rates. In production this sends the gear list to the rental house and returns their quote.</p>
      <div className="cards">{RENTAL_HOUSES.map((r) => <button key={r.id} type="button" className={'pick' + (house === r.id ? ' on' : '')} onClick={() => setHouse(r.id)}><b>{r.name}</b><span>{r.distance} · delivery ${r.delivery}</span></button>)}</div>
      <div className="row wrap">
        <label className="row" style={{ gap: 6 }}><span className="muted" style={{ fontSize: 12.5 }}>Days</span><input className="input" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Math.max(1, +e.target.value || 1))} style={{ width: 70 }} /></label>
        <label className="switch" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} /><span>Only what your kit is missing</span></label>
      </div>
      <table className="tbl card">
        <thead><tr><th>Item</th><th>Need</th><th>Short</th><th>Rate/day</th></tr></thead>
        <tbody>{q.lines.map((l) => <tr key={l.item}><td>{l.item}</td><td className="num">{l.qty}</td><td className="num" style={{ color: l.short ? 'var(--warn)' : undefined }}>{l.short}</td><td className="num">${l.rate}</td></tr>)}
          <tr><td>Delivery</td><td /><td /><td className="num">${q.delivery}</td></tr>
          <tr><td><b>Estimate</b></td><td /><td /><td className="num"><b>${total}</b></td></tr>
        </tbody>
      </table>
      <button className="btn primary" onClick={() => { onClose(); toast(`Quote request sent to ${h.name} (simulated)`) }}>Send request</button>
    </Modal>
  )
}

export default function ShotPlan() {
  const st = useStore((s) => ({ scene: s.scene, setup: s.setup, directions: s.directions, activeDirection: s.activeDirection, frames: s.frames, team: s.team, projects: s.projects, activeProjectId: s.activeProjectId, activeSceneId: s.activeSceneId, status: s.status }))
  const { scene, setup, directions, activeDirection, frames } = st
  const checks = useMemo(() => (scene ? runChecks(scene, setup.kit) : []), [scene, setup.kit])
  const stills = useCamStills(scene, 720)
  const [modal, setModal] = useState(null)
  const [notes, setNotes] = useState(null)
  useEffect(() => { let on = true; setNotes(null); if (scene) productionNotes(scene, setup.kit).then((n) => on && setNotes(n)); return () => { on = false } }, [scene, setup.kit])
  if (!scene) {
    return (
      <div className="page"><div className="page-head"><div><div className="kicker"><span className="stepno">5</span> Shot plan</div><h1>No plan yet</h1><p>Open a direction in the studio first.</p></div></div>
        <button className="btn primary" onClick={() => navigate('/setup')}>Set up a scene</button></div>
    )
  }
  const proj = activeProject(st), meta = activeSceneMeta(st)
  const dir = directions.find((d) => d.id === activeDirection)
  const used = {}
  scene.lights.forEach((l) => { used[l.fixture] = (used[l.fixture] || 0) + 1 })
  const short = Object.entries(used).some(([k, n]) => n > (setup.kit[k] || 0))
  const props = scene.objects.map((o) => ({ o, a: getAsset(o.asset) })).filter((x) => x.a)
  const open = checks.filter((c) => c.level !== 'ok')
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const share = async () => {
    const l = await shareLink()
    try { await navigator.clipboard.writeText(l); toast('Review link copied') } catch { toast('Review link ready'); window.open(l, '_blank') }
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker"><span className="stepno">5</span> Shot plan · {st.status === 'plan' ? 'locked. Print it, export it, pull the gear.' : 'not locked yet'}</div>
          <h1>Scene {meta?.num} · {meta?.name}</h1>
          <div className="plan-meta">
            <span>{proj?.name}</span>
            <span>{dir ? `Direction: ${dir.name}` : activeDirection === 'mix' ? 'Mixed direction' : 'Custom'}</span>
            <span>{scene.room.name}, {scene.time}</span>
            <span>T{scene.tstop} · ISO {scene.iso} · {scene.aspect}:1</span>
            <span>{today}</span>
          </div>
        </div>
        <div className="row no-print">
          <button className="btn" onClick={() => navigate('/studio')}>Back to studio</button>
          <button className="btn" onClick={share}><Icon name="link" size={15} /> Review link</button>
          <button className="btn" onClick={exportShotList}><Icon name="download" size={15} /> Shot list CSV</button>
          <button className="btn" onClick={exportGearList}><Icon name="download" size={15} /> Gear CSV</button>
          <button className="btn" onClick={() => setModal('call')}><Icon name="book" size={15} /> Call sheet</button>
          <button className="btn primary" onClick={() => window.print()}><Icon name="print" size={15} /> Print or save PDF</button>
        </div>
      </div>

      {dir && <p className="muted" style={{ marginTop: 0, maxWidth: '60em' }}>{dir.mood}</p>}

      <section className="sheet">
        <div className="sheet-h"><h2>Lighting and blocking diagram</h2><span className="dim mono" style={{ fontSize: 12 }}>Top view · dashed outlines were added by the AI</span></div>
        <div className="plan-diagram"><PlanSVG scene={scene} labels width={960} height={600} /></div>
      </section>

      <section className="sheet">
        <div className="sheet-h"><h2>Shots</h2><span className="dim mono" style={{ fontSize: 12 }}>Rendered from the plan · simulated reference</span></div>
        <div className="ref-row">
          {scene.cameras.map((c, i) => (
            <figure key={c.id} className="ref-card" style={{ margin: 0 }}>
              {stills[c.id] ? <img src={stills[c.id]} alt={`Shot ${meta?.num}${String.fromCharCode(65 + i)}`} /> : <div style={{ aspectRatio: '2.39', display: 'grid', placeItems: 'center', background: '#000' }}><div className="spinner" /></div>}
              <figcaption className="cap"><span>{meta?.num}{String.fromCharCode(65 + i)} · Cam {c.label} · {c.shot}</span><span>{c.focal}mm</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="sheet ai-sheet">
        <div className="sheet-h"><h2><span className="ai-mark">✦</span> Shooting order and notes</h2><span className="dim mono" style={{ fontSize: 12 }}>{notes ? `≈ ${Math.round(notes.total / 60 * 10) / 10} h for this scene` : 'AI is planning the day…'}</span></div>
        {!notes ? <div className="card-b row"><span className="spinner sm" /> <span className="muted">Working out the order, setup times and risks…</span></div> : (
          <div className="grid2 prod">
            <ol className="order">
              {notes.order.map((o, i) => (
                <li key={o.cam}><b>Setup {i + 1} · Cam {o.cam} · {o.shot}</b><span className="mono dim">{o.focal} mm · ≈ {o.minutes} min</span>{o.notes.map((n) => <p key={n}>{n}</p>)}</li>
              ))}
            </ol>
            <div>
              <h3 className="sub-h" style={{ margin: '0 0 8px' }}>Watch out for</h3>
              <ul className="ai-list checks">{notes.risks.map((r) => <li key={r.text} className={r.level}>{r.text}</li>)}</ul>
            </div>
          </div>
        )}
      </section>

      <section className="sheet">
        <div className="sheet-h"><h2>Cameras</h2></div>
        <table className="tbl">
          <thead><tr><th>Cam</th><th>Shot</th><th>Lens</th><th>Height</th><th>Position (x, z)</th></tr></thead>
          <tbody>
            {scene.cameras.map((c) => (
              <tr key={c.id}><td><b>{c.label}</b>{c.id === scene.activeCam ? <span className="dim"> · main</span> : ''}</td><td>{c.shot}</td><td className="num">{c.focal} mm</td><td className="num">{c.y.toFixed(2)} m</td><td className="num">{c.x.toFixed(2)}, {c.z.toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sheet">
        <div className="sheet-h"><h2>Lighting</h2><span className="dim mono" style={{ fontSize: 12 }}>Exposure target {Math.round(exposureTarget(scene.iso, scene.tstop))} lux at T{scene.tstop}, ISO {scene.iso}</span></div>
        <table className="tbl">
          <thead><tr><th>Unit</th><th>Fixture</th><th>Output</th><th>Color</th><th>Diffusion</th><th>Height</th></tr></thead>
          <tbody>
            {scene.lights.map((l) => {
              const fx = FIXTURES[l.fixture]
              const d = l.diffusion ?? fx.softness
              return (
                <tr key={l.id}>
                  <td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: cctToHex(l.cct) }} />{l.label || l.role}</span></td>
                  <td>{fx.name}<div className="dim" style={{ fontSize: 12 }}>{fx.spec}</div></td>
                  <td className="num">{l.on === false ? 'off' : Math.round(l.intensity * 100) + '%'}</td>
                  <td className="num">{l.cct} K</td>
                  <td>{d < 0.3 ? 'Hard, no diffusion' : d < 0.7 ? 'Light diffusion' : 'Full diffusion / softbox'}</td>
                  <td className="num">{l.y.toFixed(2)} m</td>
                </tr>
              )
            })}
            {props.filter(({ a }) => a.practical).map(({ o, a }) => (
              <tr key={o.id}><td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: cctToHex(a.practical.cct) }} />Practical</span></td><td>{a.name}</td><td className="num">{o.on === false ? 'off' : 'on'}</td><td className="num">{a.practical.cct} K</td><td>Shade</td><td className="num">in set</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="two">
        <section className="sheet">
          <div className="sheet-h"><h2>Gear to pull</h2><button className="btn sm no-print" onClick={() => setModal('quote')}><Icon name="truck" size={14} /> {short ? 'Rent what’s missing' : 'Rental quote'}</button></div>
          <table className="tbl">
            <thead><tr><th>Item</th><th>Need</th><th>Have</th></tr></thead>
            <tbody>
              {Object.entries(FIXTURES).filter(([k]) => used[k] || setup.kit[k]).map(([k, fx]) => (
                <tr key={k}><td>{fx.name}</td><td className="num">{used[k] || 0}</td><td className="num" style={{ color: (used[k] || 0) > (setup.kit[k] || 0) ? 'var(--bad)' : undefined }}>{setup.kit[k] || 0}</td></tr>
              ))}
              <tr><td>Stands, sandbags, stingers</td><td className="num">{scene.lights.length}</td><td className="dim">check</td></tr>
            </tbody>
          </table>
        </section>
        <section className="sheet">
          <div className="sheet-h"><h2>Set dressing</h2></div>
          <table className="tbl">
            <thead><tr><th>Piece</th><th>Source</th></tr></thead>
            <tbody>
              {props.map(({ o, a }) => <tr key={o.id}><td>{a.name}</td><td className="dim">{o.source === 'ai' ? 'Bring or borrow (AI proposal)' : o.source === 'user' ? 'Added in studio' : 'Already in the room'}</td></tr>)}
            </tbody>
          </table>
        </section>
      </div>

      <div className="two">
        <section className="sheet">
          <div className="sheet-h"><h2>Blocking</h2></div>
          <table className="tbl">
            <thead><tr><th>Actor</th><th>Position</th><th>Light on face</th></tr></thead>
            <tbody>
              {scene.actors.map((a) => {
                const ex = stopsAt(scene, a)
                return <tr key={a.id}><td><b>{a.label}</b> {a.name}</td><td>{POSE[a.pose] || a.pose}</td><td className="num">{Math.round(ex.lux)} lux · {ex.stops >= 0 ? '+' : ''}{ex.stops.toFixed(1)} EV</td></tr>
              })}
            </tbody>
          </table>
        </section>
        <section className="sheet">
          <div className="sheet-h"><h2>Open notes</h2><span className="dim mono" style={{ fontSize: 12 }}>{open.length ? `${open.length} to review` : 'All checks pass'}</span></div>
          <table className="tbl">
            <tbody>
              {(open.length ? open : checks.slice(0, 4)).map((c) => (
                <tr key={c.id}><td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: c.level === 'ok' ? 'var(--ok)' : c.level === 'warn' ? 'var(--warn)' : 'var(--bad)' }} />{c.title}</span><div className="dim" style={{ fontSize: 12, marginLeft: 15 }}>{c.detail}</div></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {frames.some((f) => f.status === 'done') && (
        <section className="sheet" style={{ marginTop: 14 }}>
          <div className="sheet-h"><h2>Reference frames</h2></div>
          <div className="ref-row">
            {frames.filter((f) => f.status === 'done').slice(-6).map((f) => (
              <figure key={f.id} className="ref-card" style={{ margin: 0 }}>
                <img src={f.url} alt={`Reference for Cam ${f.cam}`} />
                <figcaption className="cap"><span>Cam {f.cam} · {f.focal}mm</span><span>{f.dir}</span></figcaption>
              </figure>
            ))}
          </div>
          <div className="disclaimer">Reference frames show mood, not a promise of the final image. Light positions and exposure come from the plan above.</div>
        </section>
      )}
      {modal === 'call' && <Modal title="Call sheet" onClose={() => setModal(null)}><CallSheet st={st} scene={scene} proj={proj} meta={meta} dir={dir} used={used} /><button className="btn primary" onClick={() => window.print()}><Icon name="print" size={15} /> Print</button></Modal>}
      {modal === 'quote' && <Quote scene={scene} kit={setup.kit} onClose={() => setModal(null)} />}
    </div>
  )
}
