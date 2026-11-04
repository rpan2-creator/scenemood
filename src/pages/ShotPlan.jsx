import { useEffect, useMemo, useState } from 'react'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, navigate, activeProject, activeSceneMeta, commitScene } from '../store.js'
import { FIXTURES } from '../data/gear.js'
import { getAsset } from '../data/assets.js'
import { runChecks, stopsAt, exposureTarget } from '../engine/checks.js'
import { useCamStills } from '../components/useCamStills.js'
import { Modal } from './Projects.jsx'
import { productionNotes } from '../ai/copilot.js'
import { storyboard, COVERAGE, coverageCamera, MOVES } from '../plan/storyboard.js'
import { frameCamera } from '../ai/sim.js'
import { setSceneStatus, getState } from '../store.js'
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

// Storyboard notation: an arrow drawn on the frame for the camera move.
function MoveMark({ move }) {
  if (!move || move === 'Static') return null
  const A = (d) => <path d={d} />
  const shapes = {
    'Push in': [A('M8 7 L22 15'), A('M92 7 L78 15'), A('M8 35 L22 27'), A('M92 35 L78 27')],
    'Pull out': [A('M22 15 L8 7'), A('M78 15 L92 7'), A('M22 27 L8 35'), A('M78 27 L92 35')],
    'Pan left': [A('M70 34 L30 34')], 'Pan right': [A('M30 34 L70 34')],
    'Tilt up': [A('M92 32 L92 10')], 'Tilt down': [A('M92 10 L92 32')],
    'Track left': [A('M70 33 L30 33'), A('M70 36.5 L30 36.5')], 'Track right': [A('M30 33 L70 33'), A('M30 36.5 L70 36.5')],
    'Handheld': [<path key="h" d="M80 35 q2 -3 4 0 t4 0 t4 0" markerEnd="none" />],
  }
  return (
    <svg className="sb-move" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
      <defs><marker id="mv-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#fff" /></marker></defs>
      <g fill="none" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" markerEnd="url(#mv-head)" vectorEffect="non-scaling-stroke">{shapes[move]?.map((x, i) => <g key={i}>{x}</g>)}</g>
    </svg>
  )
}

// A text field that saves when you leave it, so typing doesn't fill the undo history.
function Note({ value, placeholder, onSave, label, rows = 2 }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <textarea className="sb-note" rows={rows} aria-label={label} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
}

// One printed page of the scene packet: cream paper, a running header, a page footer.
function Sheet({ sec, title, proj, meta, page, version, children }) {
  return (
    <section className="paper" data-sec={sec}>
      <header className="paper-h"><span><b>{proj?.name}</b> · Scene {meta?.num} · {title}</span><span>{version}</span></header>
      {children}
      <footer className="paper-f"><span>SceneMood previs. Frames are rendered from the 3D plan, not photographs of the location.</span><span>{page}</span></footer>
    </section>
  )
}

const TABS = [['board', 'Storyboard'], ['sheet', 'Scene sheet'], ['shots', 'Shot list'], ['light', 'Lighting + gear'], ['all', 'All pages'], ['notes', 'AI notes']]
const PER_PAGE = 6

export default function ShotPlan() {
  const st = useStore((s) => ({ scene: s.scene, setup: s.setup, directions: s.directions, activeDirection: s.activeDirection, frames: s.frames, team: s.team, projects: s.projects, activeProjectId: s.activeProjectId, activeSceneId: s.activeSceneId, status: s.status, approvals: s.approvals || [] }))
  const { scene, setup, directions, activeDirection } = st
  const checks = useMemo(() => (scene ? runChecks(scene, setup.kit) : []), [scene, setup.kit])
  const geo = useMemo(() => (scene ? { ...scene, boardNotes: undefined } : null), [scene])
  const stills = useCamStills(geo, 720)
  const [modal, setModal] = useState(null)
  const [notes, setNotes] = useState(null)
  const [tab, setTab] = useState('board')
  const [exports, setExports] = useState({ sheet: true, board: true, shots: true, light: true, csv: false, gear: false })
  const dir = directions.find((d) => d.id === activeDirection)
  const meta0 = activeSceneMeta(st)
  const board = useMemo(() => (scene ? storyboard(scene, meta0?.num || 1, dir?.setupMin || 30) : []), [scene, meta0?.num, dir?.setupMin])
  useEffect(() => { const g = getState(); if (g.scene && ['setup', 'directions', 'studio'].includes(g.status)) setSceneStatus('plan') }, [])
  useEffect(() => { let on = true; setNotes(null); if (scene) productionNotes(scene, setup.kit).then((n) => on && setNotes(n)); return () => { on = false } }, [scene, setup.kit])
  if (!scene) {
    return (
      <div className="page"><div className="page-head"><div><div className="kicker"><span className="stepno">4</span> Storyboard</div><h1>No plan yet</h1><p>Block and light a look first. Every camera you place becomes a panel here.</p></div></div>
        <button className="btn primary" onClick={() => navigate('/setup')}>Start the breakdown</button></div>
    )
  }
  const addShot = (kind, actorId) => {
    const label = String.fromCharCode(65 + scene.cameras.length)
    const c = coverageCamera(scene, kind, actorId, label, frameCamera)
    if (c) { commitScene({ ...scene, cameras: [...scene.cameras, c] }, `Add ${c.shot}`); toast(`Added ${c.shot} as Cam ${label}`) }
  }
  const removeShot = (id) => commitScene({ ...scene, cameras: scene.cameras.filter((c) => c.id !== id), activeCam: scene.activeCam === id ? scene.cameras.find((c) => c.id !== id)?.id : scene.activeCam }, 'Remove shot')
  const note = (id, patch, label = 'Edit storyboard') => commitScene({ ...scene, boardNotes: { ...scene.boardNotes, [id]: { ...scene.boardNotes?.[id], ...patch } } }, label)
  const proj = activeProject(st), meta = meta0
  const used = {}
  scene.lights.forEach((l) => { used[l.fixture] = (used[l.fixture] || 0) + 1 })
  const short = Object.entries(used).some(([k, n]) => n > (setup.kit[k] || 0))
  const props = scene.objects.map((o) => ({ o, a: getAsset(o.asset) })).filter((x) => x.a)
  const open = checks.filter((c) => c.level !== 'ok')
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const version = st.status === 'approved' ? `Approved v${st.approvals.length} · ${today}` : `Draft · ${today}`
  const ext = scene.room.kind === 'exterior'
  const slug = `${ext ? 'EXT' : 'INT'}. ${scene.room.name.toUpperCase()} — ${String(scene.time || 'day').toUpperCase()}`
  const total = board.reduce((t, p) => t + p.minutes, 0)
  const wardrobe = setup.brief.wardrobe || {}
  const pages = []
  for (let i = 0; i < board.length; i += PER_PAGE) pages.push(board.slice(i, i + PER_PAGE))
  const nPages = 1 + pages.length + 2
  const doExport = () => {
    if (exports.csv) exportShotList()
    if (exports.gear) exportGearList()
    setModal(null)
    const secs = ['sheet', 'board', 'shots', 'light'].filter((k) => exports[k])
    if (!secs.length) return
    requestAnimationFrame(() => {
      document.body.dataset.print = secs.join(' ')
      window.print()
      setTimeout(() => { delete document.body.dataset.print }, 500)
    })
  }

  return (
    <div className="page board-page">
      <div className="page-head no-print">
        <div>
          <div className="kicker"><span className="stepno">4</span> Storyboard · {st.status === 'approved' ? `approved v${st.approvals.length}` : 'draft, share it for notes before you approve'}</div>
          <h1>{slug}</h1>
          <div className="plan-meta">
            <span>{proj?.name} · Scene {meta?.num}</span>
            <span>{dir ? `Look: ${dir.name}` : activeDirection === 'mix' ? 'Mixed look' : 'Custom look'}</span>
            <span>{board.length} setups · about {Math.round(total / 5) * 5} min</span>
            <span>T{scene.tstop} · ISO {scene.iso} · {scene.aspect}:1</span>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigate('/studio')}>Back to block + light</button>
          <button className="btn primary" onClick={() => setModal('export')}><Icon name="download" size={15} /> Export scene packet</button>
        </div>
      </div>

      {!!st.approvals.length && <details className="sheet no-print"><summary>Approved versions · {st.approvals.length} saved</summary>{st.approvals.map((v, i) => <div className="row" key={v.id} style={{ padding: 12 }}><span>Approved v{i + 1} · {new Date(v.at).toLocaleString()}</span><button className="btn sm" onClick={() => { commitScene(structuredClone(v.scene), `Restore approved v${i + 1}`); navigate('/studio') }}>Restore as draft</button></div>)}</details>}

      <div className="board-bar no-print">
        <div className="tabs" role="tablist" aria-label="Scene packet pages">
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <span className="dim">Each sheet below is one page of the PDF, exactly as it prints.</span>
      </div>

      {tab === 'board' && (
        <div className="board-add no-print">
          <span>Add a shot</span>
          {COVERAGE.map((c) => c.needs ? scene.actors.map((a) => <button key={c.id + a.id} className="pill" onClick={() => addShot(c.id, a.id)}>+ {c.label} · {a.name}</button>) : <button key={c.id} className="pill" onClick={() => addShot(c.id)}>+ {c.label}</button>)}
        </div>
      )}

      <div className="packet" data-tab={tab}>
        <Sheet sec="sheet" title="Scene sheet" proj={proj} meta={meta} page={`1 / ${nPages}`} version={version}>
          <div className="ss">
            <div className="ss-l">
              <div className="ss-slug">{slug}</div>
              <h2>{meta?.name || 'Scene'}</h2>
              <p className="ss-syn">{setup.brief.text}</p>
              <dl className="ss-facts">
                <div><dt>Look</dt><dd>{dir ? `${dir.name}. ${dir.mood}` : 'Custom'}</dd></div>
                <div><dt>Location</dt><dd>{scene.room.w} × {scene.room.d} m{ext ? '' : `, ceiling ${scene.room.h} m`} · {scene.room.openings.filter((o) => o.type === 'window').length} windows · {scene.room.outlets?.length || 0} outlets</dd></div>
                <div><dt>Camera</dt><dd>T{scene.tstop} · ISO {scene.iso} · {scene.aspect}:1</dd></div>
                <div><dt>Setups</dt><dd>{board.length}, about {Math.round(total / 5) * 5} min including the first lighting setup</dd></div>
              </dl>
              <table className="ptbl">
                <thead><tr><th>Cast</th><th>Blocking</th><th>Wardrobe</th></tr></thead>
                <tbody>{scene.actors.map((a) => <tr key={a.id}><td><b>{a.label}</b> {a.name}</td><td>{POSE[a.pose] || a.pose}</td><td>{wardrobe[a.id] || '—'}</td></tr>)}</tbody>
              </table>
            </div>
            <figure className="ss-r">
              <PlanSVG scene={scene} labels paper width={640} height={520} />
              <figcaption>Overhead: actors (letters), cameras with their field of view, lights with their beam. 1 m scale bar below the room.</figcaption>
            </figure>
          </div>
        </Sheet>

        {pages.map((pg, pi) => (
          <Sheet key={pi} sec="board" title={`Storyboard${pages.length > 1 ? ` ${pi + 1} of ${pages.length}` : ''}`} proj={proj} meta={meta} page={`${pi + 2} / ${nPages}`} version={version}>
            <div className={'sb-grid' + (board.length <= 2 ? ' two' : '')}>
              {pg.map((p) => {
                const i = board.indexOf(p)
                return (
                  <article key={p.id} className="sb-panel">
                    <div className="sb-frame">
                      {stills[p.id] ? <img src={stills[p.id]} alt={`Shot ${p.code}: ${p.shot}`} /> : <div className="sb-wait"><div className="spinner" /></div>}
                      <MoveMark move={p.move} />
                      <span className="sb-tag">{p.code}</span>
                      <span className="sb-size">{p.size} · {p.focal} mm</span>
                      <span className="sb-mini" aria-hidden="true"><PlanSVG scene={{ ...scene, activeCam: p.id, cameras: scene.cameras.filter((c) => c.id === p.id) }} width={150} height={104} /></span>
                      {scene.cameras.length > 1 && <button className="icon-btn sb-x no-print" aria-label={`Remove shot ${p.code}`} title="Remove this shot" onClick={() => removeShot(p.id)}><Icon name="x" size={13} /></button>}
                    </div>
                    <div className="sb-h">
                      <span>{p.angle} · Cam {p.cam} at {p.height.toFixed(2)} m</span>
                      <label className="sb-mv"><span className="sr-only">Camera move for {p.code}</span>
                        <select value={p.move} onChange={(e) => note(p.id, { move: e.target.value }, `Move ${p.code}: ${e.target.value}`)}>{MOVES.map((m) => <option key={m}>{m}</option>)}</select>
                      </label>
                    </div>
                    <Note label={`Action for ${p.code}`} value={p.action} placeholder="What happens in this shot" onSave={(v) => note(p.id, { action: v })} />
                    <Note label={`Dialogue or sound for ${p.code}`} rows={1} value={p.dialogue} placeholder="Add a line of dialogue or a sound cue" onSave={(v) => note(p.id, { dialogue: v })} />
                    <details className="sb-more">
                      <summary><span>{i === 0 ? 'Before the first take' : `Changes from ${board[i - 1].code}`}</span><span className="mono">≈ {p.minutes} min</span></summary>
                      <ul className="sb-ch">{p.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                    </details>
                  </article>
                )
              })}
            </div>
          </Sheet>
        ))}

        <Sheet sec="shots" title="Shot list" proj={proj} meta={meta} page={`${pages.length + 2} / ${nPages}`} version={version}>
          <table className="ptbl">
            <thead><tr><th>Shot</th><th>Size</th><th>Angle</th><th>Move</th><th>Lens</th><th>Height</th><th>Action</th><th>Dialogue / sound</th><th>Est.</th></tr></thead>
            <tbody>{board.map((p) => <tr key={p.id}><td><b>{p.code}</b></td><td>{p.size}</td><td>{p.angle}</td><td>{p.move}</td><td className="num">{p.focal} mm</td><td className="num">{p.height.toFixed(2)} m</td><td>{p.action}</td><td>{p.dialogue || '—'}</td><td className="num">{p.minutes} min</td></tr>)}
              <tr className="tot"><td colSpan={8}>Total, in shooting order</td><td className="num">{total} min</td></tr></tbody>
          </table>
          <h3 className="ph3">Between setups</h3>
          <ol className="ptbl-list">{board.slice(1).map((p, i) => <li key={p.id}><b>{board[i].code} → {p.code}</b> {p.changes.join(' ')}</li>)}</ol>
        </Sheet>

        <Sheet sec="light" title="Lighting, gear and set dressing" proj={proj} meta={meta} page={`${pages.length + 3} / ${nPages}`} version={version}>
          <table className="ptbl">
            <thead><tr><th>Unit</th><th>Fixture</th><th>Output</th><th>Colour</th><th>Diffusion</th><th>Height</th></tr></thead>
            <tbody>
              {scene.lights.map((l) => {
                const fx = FIXTURES[l.fixture]
                const d = l.diffusion ?? fx.softness
                return <tr key={l.id}><td><b>{l.label || l.role}</b></td><td>{fx.name}</td><td className="num">{l.on === false ? 'off' : Math.round(l.intensity * 100) + '%'}</td><td className="num">{l.cct} K</td><td>{d < 0.3 ? 'Hard, no diffusion' : d < 0.7 ? 'Light diffusion' : 'Full diffusion / softbox'}</td><td className="num">{l.y.toFixed(2)} m</td></tr>
              })}
              {props.filter(({ a }) => a.practical).map(({ o, a }) => <tr key={o.id}><td><b>Practical</b></td><td>{a.name}</td><td className="num">{o.on === false ? 'off' : 'on'}</td><td className="num">{a.practical.cct} K</td><td>Shade</td><td className="num">in set</td></tr>)}
            </tbody>
          </table>
          <div className="p2">
            <div>
              <h3 className="ph3">Gear to pull</h3>
              <table className="ptbl">
                <thead><tr><th>Item</th><th>Need</th><th>In kit</th></tr></thead>
                <tbody>
                  {Object.entries(FIXTURES).filter(([k]) => used[k] || setup.kit[k]).map(([k, fx]) => <tr key={k}><td>{fx.name}</td><td className="num">{used[k] || 0}</td><td className={'num' + ((used[k] || 0) > (setup.kit[k] || 0) ? ' short' : '')}>{setup.kit[k] || 0}</td></tr>)}
                  <tr><td>Stands, sandbags, stingers</td><td className="num">{scene.lights.length}</td><td className="num">check</td></tr>
                </tbody>
              </table>
              {short && <button className="btn sm no-print" style={{ marginTop: 10 }} onClick={() => setModal('quote')}><Icon name="truck" size={14} /> Rent what’s missing</button>}
            </div>
            <div>
              <h3 className="ph3">Set dressing</h3>
              <table className="ptbl">
                <thead><tr><th>Piece</th><th>Source</th></tr></thead>
                <tbody>{props.map(({ o, a }) => <tr key={o.id}><td>{a.name}</td><td>{o.source === 'ai' ? 'Bring or borrow' : o.source === 'user' ? 'Added in block + light' : 'Already at the location'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <h3 className="ph3">Light on each face</h3>
          <table className="ptbl">
            <tbody>{scene.actors.map((a) => { const ex = stopsAt(scene, a); return <tr key={a.id}><td><b>{a.label}</b> {a.name}</td><td className="num">{Math.round(ex.lux)} lux</td><td className="num">{ex.stops >= 0 ? '+' : ''}{ex.stops.toFixed(1)} EV at T{scene.tstop}</td></tr> })}</tbody>
          </table>
        </Sheet>

        <section className="sheet ai-sheet no-print" data-sec="notes">
          <div className="sheet-h"><h2><span className="ai-mark">✦</span> Shooting order and risks</h2><span className="dim mono" style={{ fontSize: 12 }}>{notes ? `≈ ${Math.round(notes.total / 60 * 10) / 10} h for this scene` : 'Planning the day…'}</span></div>
          {!notes ? <div className="card-b row"><span className="spinner sm" /> <span className="muted">Working out the order, setup times and risks…</span></div> : (
            <div className="grid2 prod">
              <ol className="order">{notes.order.map((o, i) => <li key={o.cam}><b>Setup {i + 1} · Cam {o.cam} · {o.shot}</b><span className="mono dim">{o.focal} mm · ≈ {o.minutes} min</span>{o.notes.map((n) => <p key={n}>{n}</p>)}</li>)}</ol>
              <div>
                <h3 className="sub-h" style={{ margin: '0 0 8px' }}>Watch out for</h3>
                <ul className="ai-list checks">{notes.risks.map((r) => <li key={r.text} className={r.level}>{r.text}</li>)}</ul>
                <h3 className="sub-h" style={{ margin: '18px 0 8px' }}>Checks</h3>
                <ul className="ai-list checks">{(open.length ? open : checks.slice(0, 4)).map((c) => <li key={c.id} className={c.level}>{c.title}. <span className="dim">{c.detail}</span></li>)}</ul>
              </div>
            </div>
          )}
        </section>
      </div>

      {modal === 'export' && (
        <Modal title="Export the scene packet" onClose={() => setModal(null)}>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>One PDF for the crew, printed landscape on A4 or Letter. Your browser’s print dialog opens: choose “Save as PDF”.</p>
            <fieldset className="exp"><legend>PDF pages</legend>
              {[['sheet', 'Scene sheet', 'Slugline, synopsis, cast and wardrobe, overhead diagram'], ['board', 'Storyboard', `${board.length} panels, ${PER_PAGE} per page, in shooting order`], ['shots', 'Shot list', 'Size, angle, move, lens, action, minutes, changeovers'], ['light', 'Lighting + gear', 'Lighting plot, gear to pull, set dressing']].map(([k, l, d]) => <label key={k} className="exp-row"><input type="checkbox" checked={exports[k]} onChange={(e) => setExports({ ...exports, [k]: e.target.checked })} /><span><b>{l}</b><small>{d}</small></span></label>)}
            </fieldset>
            <fieldset className="exp"><legend>Spreadsheets</legend>
              {[['csv', 'Shot list · CSV', 'Opens in Excel, Sheets or StudioBinder'], ['gear', 'Gear and props · CSV', 'For the rental house or the art department']].map(([k, l, d]) => <label key={k} className="exp-row"><input type="checkbox" checked={exports[k]} onChange={(e) => setExports({ ...exports, [k]: e.target.checked })} /><span><b>{l}</b><small>{d}</small></span></label>)}
            </fieldset>
            <div className="row"><button className="btn primary" disabled={!Object.values(exports).some(Boolean)} onClick={doExport}>Export</button><button className="btn" onClick={() => { setTab('all'); setModal(null) }}>Preview every page first</button><button className="btn ghost" onClick={() => setModal('call')}>Call sheet</button></div>
          </div>
        </Modal>
      )}
      {modal === 'call' && <Modal title="Call sheet" onClose={() => setModal(null)}><CallSheet st={st} scene={scene} proj={proj} meta={meta} dir={dir} used={used} /><button className="btn primary" onClick={() => window.print()}><Icon name="print" size={15} /> Print</button></Modal>}
      {modal === 'quote' && <Quote scene={scene} kit={setup.kit} onClose={() => setModal(null)} />}
    </div>
  )
}
