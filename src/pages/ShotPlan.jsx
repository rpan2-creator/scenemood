import { useMemo } from 'react'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, navigate } from '../store.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { getAsset } from '../data/assets.js'
import { runChecks, stopsAt, exposureTarget } from '../engine/checks.js'
import { toast } from '../actions.js'

export default function ShotPlan() {
  const { scene, setup, project, directions, activeDirection, frames } = useStore((s) => ({ scene: s.scene, setup: s.setup, project: s.project, directions: s.directions, activeDirection: s.activeDirection, frames: s.frames }))
  const checks = useMemo(() => (scene ? runChecks(scene, setup.kit) : []), [scene, setup.kit])
  if (!scene) {
    return (
      <div className="dirs"><div className="dirs-head"><div><h1>No plan yet</h1><p>Open a direction in the studio first.</p></div></div>
        <button className="btn primary" onClick={() => navigate('/setup')}>Set up a scene</button></div>
    )
  }
  const dir = directions.find((d) => d.id === activeDirection)
  const used = {}
  scene.lights.forEach((l) => { used[l.fixture] = (used[l.fixture] || 0) + 1 })
  const props = scene.objects.map((o) => ({ o, a: getAsset(o.asset) })).filter((x) => x.a)
  const open = checks.filter((c) => c.level !== 'ok')
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href) } catch { /* clipboard blocked */ }
    toast('Link copied. Review links open read-only once accounts are connected.')
  }

  return (
    <div className="plan-page">
      <div className="plan-head">
        <div>
          <h1>Shot plan · Scene {project.scene}</h1>
          <div className="plan-meta">
            <span>{project.name}</span>
            <span>{dir ? `Direction: ${dir.name}` : activeDirection === 'mix' ? 'Mixed direction' : 'Custom'}</span>
            <span>{scene.room.name}, {scene.time}</span>
            <span>T{scene.tstop} · ISO {scene.iso} · {scene.aspect}:1</span>
            <span>{today}</span>
          </div>
        </div>
        <div className="row no-print">
          <button className="btn" onClick={() => navigate('/studio')}>Back to studio</button>
          <button className="btn" onClick={share}><Icon name="link" size={15} /> Copy link</button>
          <button className="btn primary" onClick={() => window.print()}><Icon name="print" size={15} /> Print or save PDF</button>
        </div>
      </div>

      {dir && <p className="muted" style={{ marginTop: 0, maxWidth: '60em' }}>{dir.mood}</p>}

      <section className="sheet">
        <div className="sheet-h"><h2>Lighting and blocking diagram</h2><span className="dim mono" style={{ fontSize: 12 }}>Top view · dashed outlines were added by the AI</span></div>
        <div className="plan-diagram"><PlanSVG scene={scene} labels width={960} height={600} /></div>
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
          <div className="sheet-h"><h2>Gear to pull</h2></div>
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
                return <tr key={a.id}><td><b>{a.label}</b> {a.name}</td><td>{a.pose === 'sit' ? 'Seated' : 'Standing'}</td><td className="num">{Math.round(ex.lux)} lux · {ex.stops >= 0 ? '+' : ''}{ex.stops.toFixed(1)} EV</td></tr>
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
    </div>
  )
}
