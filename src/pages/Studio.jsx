import { useEffect, useMemo, useRef, useState } from 'react'
import Viewport from '../components/Viewport.jsx'
import PlanEditor from '../components/PlanEditor.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, setState, getState, commitScene, updateItem, removeItem, addObject, undo, redo, navigate, newId, saveVersion, restoreVersion, logSuggestion } from '../store.js'
import { ASSETS, ASSET_CATS, getAsset } from '../data/assets.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { runChecks, stopsAt, exposureTarget, actorFace, ASPECTS, calibrate } from '../engine/checks.js'
import { critique } from '../ai/sim.js'
import { copilotSuggestions, explainItem, alternativesFor } from '../ai/copilot.js'
import { renderStill } from '../engine/SceneEngine.js'
import { engineRef, sendCommand, acceptPending, discardPending, fixIssue, makeReference, toast, addComment, commentToAI, runGeneration, runCopilotAction, previewAlternative, fixAllBlocking } from '../actions.js'

const deg = (r) => Math.round(((r || 0) * 180) / Math.PI)
const FOCALS = [18, 24, 32, 35, 50, 65, 85, 100, 135]
const POSES = [['sit', 'Seated'], ['hunched', 'Leaning in'], ['turned', 'Turned away'], ['stand', 'Standing'], ['crossed', 'Arms crossed']]
const QUICK = ['Her face is too dark', 'Make it moodier', 'Move the key to camera left', 'Add a candle', 'Tighter on this camera', 'Clear the clutter']
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago` }

// ---------------------------------------------------------------- left panel

function Why({ item }) {
  if (!item.why) return null
  return <div className="item-why"><b>{item.why.ref}.</b> {item.why.text}</div>
}

function Layers({ scene, selection, select, kit, showWhy }) {
  const sel = selection?.id
  const lightsLeft = Object.entries(kit).filter(([k, n]) => n > scene.lights.filter((l) => l.fixture === k).length)
  const addLight = (fx) => {
    const a = scene.actors[0]
    const l = { id: newId('light'), fixture: fx, role: 'fill', label: 'New ' + FIXTURES[fx].name.toLowerCase(), x: a ? a.x + 1.2 : 1, y: fx === 'reflector' ? 1.0 : 1.9, z: a ? a.z + 1.2 : 1, aim: a ? actorFace(a) : [0, 1, 0], intensity: 0.5, cct: Math.max(FIXTURES[fx].cctMin, Math.min(FIXTURES[fx].cctMax, 4300)), on: true, source: 'user' }
    commitScene({ ...scene, lights: [...scene.lights, l] }, 'Add light')
    select({ kind: 'lights', id: l.id })
  }
  const Row = ({ kind, item, dot, name, meta }) => (
    <>
      <div className={'item' + (sel === item.id ? ' sel' : '')} onClick={() => select({ kind, id: item.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select({ kind, id: item.id })}>
        {dot}
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>{item.source === 'ai' && <span className="tag">AI</span>}</span>
        <span className="meta">{meta}</span>
      </div>
      {showWhy && (sel === item.id || showWhy === 'all') && <Why item={item} />}
    </>
  )
  return (
    <div>
      <div className="group">
        <div className="group-h"><span>Set dressing</span><span className="mono">{scene.objects.length}</span></div>
        {scene.objects.map((o) => { const a = getAsset(o.asset); return <Row key={o.id} kind="objects" item={o} name={a?.name || o.asset} meta={a?.practical ? (o.on === false ? 'off' : 'on') : ''} dot={<Icon name="cube" size={14} style={{ color: 'var(--dim)' }} />} /> })}
      </div>
      <div className="group">
        <div className="group-h"><span>Blocking</span><span className="mono">{scene.actors.length}</span></div>
        {scene.actors.map((a) => <Row key={a.id} kind="actors" item={a} name={a.name} meta={POSES.find((p) => p[0] === a.pose)?.[1]} dot={<Icon name="person" size={14} style={{ color: 'var(--dim)' }} />} />)}
      </div>
      <div className="group">
        <div className="group-h"><span>Cameras</span><span className="mono">{scene.cameras.length}</span></div>
        {scene.cameras.map((c) => <Row key={c.id} kind="cameras" item={c} name={`Cam ${c.label} · ${c.shot || ''}`} meta={`${c.focal}mm`} dot={<span className="dot" style={{ background: c.id === scene.activeCam ? 'var(--tally)' : 'var(--hair-2)', marginLeft: 3 }} />} />)}
      </div>
      <div className="group">
        <div className="group-h"><span>Lighting</span><span className="mono">{scene.lights.length}</span></div>
        {scene.lights.map((l) => <Row key={l.id} kind="lights" item={l} name={l.label || l.role} meta={`${Math.round(l.intensity * 100)}%`} dot={<span className="dot" style={{ background: l.on === false ? 'var(--hair-2)' : cctToHex(l.cct), marginLeft: 3 }} />} />)}
        {lightsLeft.length > 0 && (
          <div style={{ padding: '6px 8px' }}>
            <select className="select" value="" onChange={(e) => e.target.value && addLight(e.target.value)} aria-label="Add a light from your kit" style={{ height: 30, fontSize: 12.5 }}>
              <option value="">Add a light from your kit…</option>
              {lightsLeft.map(([k]) => <option key={k} value={k}>{FIXTURES[k].name}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

function AssetLibrary({ onAdd }) {
  const [q, setQ] = useState('')
  const list = ASSETS.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.cat.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div style={{ padding: '8px 8px 0' }}><input className="input" placeholder={`Search ${ASSETS.length} assets`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assets" /></div>
      <div className="assets">
        {ASSET_CATS.map((cat) => {
          const items = list.filter((a) => a.cat === cat)
          if (!items.length) return null
          return (
            <div className="asset-cat" key={cat}>
              <h5>{cat}</h5>
              <div className="asset-grid">
                {items.map((a) => (
                  <button key={a.id} className="asset" draggable onDragStart={(e) => { e.dataTransfer.setData('text/asset', a.id); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => onAdd(a.id)} title={`${a.name}. Drag into the set, or click to add.`}>
                    <img src={`thumbs/${a.id}.png`} alt="" loading="lazy" />
                    {a.glb && <span className="tag">scan</span>}
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function History({ history, versions }) {
  const [name, setName] = useState('')
  return (
    <div>
      <div className="sec">
        <h4>Named versions</h4>
        <form className="row" onSubmit={(e) => { e.preventDefault(); saveVersion(name.trim()); setName(''); toast('Version saved') }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Version name" aria-label="Version name" />
          <button className="btn sm" type="submit"><Icon name="save" size={14} /> Save</button>
        </form>
        {(versions || []).slice().reverse().map((v) => (
          <div className="ver" key={v.id}><span>{v.name}<small>{ago(v.at)}</small></span><button className="btn sm" onClick={() => { restoreVersion(v.id); toast('Restored ' + v.name) }}>Restore</button></div>
        ))}
        {!versions?.length && <p className="hint">Save a version before a big change so you can come back to it.</p>}
      </div>
      <div className="sec">
        <h4>Edit history <span className="mono dim" style={{ fontWeight: 400 }}>{history.length}</span></h4>
        {history.slice().reverse().slice(0, 30).map((h, i) => (
          <div className="ver" key={i}><span>{h.ai ? <span className="tag" style={{ marginRight: 6 }}>AI</span> : null}{h.label}<small>{h.at ? ago(h.at) : ''}</small></span><button className="btn ghost sm" onClick={() => { for (let k = 0; k <= i; k++) undo() }}>Go back</button></div>
        ))}
        {!history.length && <p className="hint">Every change you or the AI make is listed here.</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- right panel

function Slider({ label, value, min, max, step = 0.01, onChange, fmt = (v) => v }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className="prop"><span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(+e.target.value)} onPointerUp={() => onChange(v)} onKeyUp={() => onChange(v)} onBlur={() => v !== value && onChange(v)} />
      <output>{fmt(v)}</output>
    </label>
  )
}

function AltThumb({ alt }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let on = true; renderStill(alt.scene, { w: 360 }).then((u) => on && setUrl(u)); return () => { on = false } }, [alt])
  return url ? <img src={url} alt="" /> : <div className="alt-ph"><span className="spinner sm" /></div>
}

function AskAI({ scene, kind, item, kit }) {
  const [alts, setAlts] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setAlts(null) }, [item.id])
  const text = explainItem(scene, kind, item)
  const more = async () => { setBusy(true); setAlts(await alternativesFor(scene, kind, item.id, kit)); setBusy(false) }
  return (
    <div className="ai-note">
      <div className="ai-note-h"><span className="ai-mark">✦</span>Why it’s here</div>
      <p className="ai-say">{text}</p>
      {!alts && <button type="button" className="btn ai sm" onClick={more} disabled={busy}><span className="ai-mark">✦</span> {busy ? 'Thinking of options…' : 'Show me 3 other ways'}</button>}
      {alts && (
        <div className="alts">
          {alts.map((a) => (
            <button key={a.id} type="button" className="alt" onClick={() => previewAlternative(a)} title="Preview this in the set and the lens">
              <AltThumb alt={a} />
              <b>{a.label}{a.issues ? <span className="warn-dot" title="Has a blocking issue" /> : null}</b>
              <span>{a.why}</span>
            </button>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => setAlts(null)}>Hide options</button>
        </div>
      )}
    </div>
  )
}

function Copilot({ scene, kit, aiLog, thinking }) {
  const sugg = useMemo(() => copilotSuggestions(scene, kit), [scene, kit])
  const blocking = sugg.filter((x) => x.level === 'error').length
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [aiLog.length])
  return (
    <div className="copilot">
      <div className="sec">
        <h4><span><span className="ai-mark">✦</span> AI co-pilot</span>{blocking > 0 && <button className="btn ai sm" onClick={fixAllBlocking}>Fix {blocking} blocking</button>}</h4>
        <p className="hint" style={{ marginTop: -4 }}>I watch the set while you work. Click a suggestion to preview it.</p>
        {sugg.map((g) => (
          <div key={g.id} className={'sugg ' + g.level}>
            <b>{g.title}</b>
            <span>{g.why}</span>
            {g.action && <button type="button" className={'btn sm ' + (g.level === 'error' ? 'primary' : 'ai')} onClick={() => runCopilotAction(g.action)} disabled={thinking}>{g.action.label}</button>}
          </div>
        ))}
      </div>
      <div className="sec" style={{ borderBottom: 0 }}>
        <h4>Conversation</h4>
        {!aiLog.length && <p className="hint">Type a change in the bar at the bottom (“her face is too dark”, “add a candle”), or click on the lens view to point at something.</p>}
        <div className="chat">
          {aiLog.slice(-24).map((m) => (
            <div key={m.id} className={'bubble ' + m.role + (m.ok === false ? ' miss' : '')}>
              {m.role === 'ai' && <span className="ai-mark">✦</span>}
              <span>{m.text}{m.ref ? <em> · {m.ref}</em> : null}</span>
            </div>
          ))}
          {thinking && <div className="bubble ai"><span className="ai-mark">✦</span><span className="typing"><i /><i /><i /></span></div>}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  )
}

function Inspector({ scene, selection, select, kit }) {
  const found = selection && ['objects', 'actors', 'lights', 'cameras'].map((k) => [k, scene[k].find((x) => x.id === selection.id)]).find(([, x]) => x)
  const { directions, activeDirection } = useStore((s) => ({ directions: s.directions, activeDirection: s.activeDirection }))
  if (!found) {
    const dir = directions.find((d) => d.id === activeDirection)
    return (
      <div className="insp">
        <h4>{dir ? dir.name : activeDirection === 'mix' ? 'Mixed direction' : activeDirection === 'learning' ? 'Your own setup' : 'Scene'}</h4>
        {dir && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{dir.mood}</p>}
        <dl className="kv">
          <dt>Room</dt><dd>{scene.room.w}×{scene.room.d} m</dd>
          <dt>Exposure target</dt><dd>{Math.round(exposureTarget(scene.iso, scene.tstop))} lux</dd>
          <dt>Lights</dt><dd>{scene.lights.length}</dd>
          <dt>Cameras</dt><dd>{scene.cameras.length}</dd>
        </dl>
        <p className="hint">Click anything in the set, or a label, to edit it. Drag assets in from the library.</p>
      </div>
    )
  }
  const [kind, it] = found
  const upd = (c, label) => updateItem(kind, it.id, c, label)
  const del = () => { removeItem(kind, it.id); select(null) }
  const keep = it.source === 'ai' && !it.kept ? <button className="btn ghost sm" onClick={() => { upd({ kept: true }); logSuggestion(it, 'accepted', kind); toast('Marked as kept') }}><Icon name="check" size={13} /> Keep</button> : null
  if (kind === 'objects') {
    const a = getAsset(it.asset)
    return (
      <div className="insp">
        <h4>{a?.name}<span className="row">{it.source === 'ai' && <span className="tag">AI</span>}{keep}</span></h4>
        <AskAI scene={scene} kind={kind} item={it} kit={kit} />
        <Slider label="Left / right" value={it.x} min={-scene.room.w / 2} max={scene.room.w / 2} onChange={(x) => upd({ x })} fmt={(v) => v.toFixed(2) + ' m'} />
        <Slider label="Front / back" value={it.z} min={-scene.room.d / 2} max={scene.room.d / 2} onChange={(z) => upd({ z })} fmt={(v) => v.toFixed(2) + ' m'} />
        {!a?.wall && <Slider label="Rotation" value={deg(it.rot)} min={-180} max={180} step={5} onChange={(d) => upd({ rot: (d * Math.PI) / 180 })} fmt={(v) => v + '°'} />}
        {a?.practical && <div className="row between"><span className="muted" style={{ fontSize: 12.5 }}>Practical · {a.practical.cct} K</span><div className="seg"><button className={it.on !== false ? 'on' : ''} onClick={() => upd({ on: true })}>On</button><button className={it.on === false ? 'on' : ''} onClick={() => upd({ on: false })}>Off</button></div></div>}
        {a?.credit && <span className="dim" style={{ fontSize: 11 }}>{a.credit}</span>}
        <button className="btn sm" onClick={del}><Icon name="trash" size={14} /> Remove from set</button>
      </div>
    )
  }
  if (kind === 'actors') {
    const ex = stopsAt(scene, it)
    return (
      <div className="insp">
        <h4>{it.name} <span className="mono dim" style={{ fontSize: 12, fontWeight: 400 }}>Actor {it.label}</span></h4>
        <AskAI scene={scene} kind={kind} item={it} kit={kit} />
        <div className="row wrap" style={{ gap: 4 }}>{POSES.map(([p, l]) => <button key={p} className={'chip' + (it.pose === p ? ' warm' : '')} onClick={() => upd({ pose: p }, 'Pose')}>{l}</button>)}</div>
        <Slider label="Facing" value={deg(it.rot)} min={-180} max={180} step={5} onChange={(d) => upd({ rot: (d * Math.PI) / 180 })} fmt={(v) => v + '°'} />
        <div className="row between"><span className="muted" style={{ fontSize: 12.5 }}>Skin tone</span><div className="seg">{['light', 'medium', 'deep'].map((t) => <button key={t} className={it.tone === t ? 'on' : ''} onClick={() => upd({ tone: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div></div>
        <dl className="kv"><dt>Light on face</dt><dd>{Math.round(ex.lux)} lux</dd><dt>Exposure</dt><dd style={{ color: Math.abs(ex.stops) > 1.6 ? 'var(--warn)' : 'var(--paper)' }}>{ex.stops >= 0 ? '+' : ''}{ex.stops.toFixed(1)} stops</dd></dl>
      </div>
    )
  }
  if (kind === 'lights') {
    const fx = FIXTURES[it.fixture]
    const aimAt = (id) => { const a = scene.actors.find((x) => x.id === id); if (a) upd({ aim: actorFace(a) }, 'Aim light') }
    return (
      <div className="insp">
        <h4><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: cctToHex(it.cct) }} />{it.label || it.role}</span><span className="row">{it.source === 'ai' && <span className="tag">AI</span>}{keep}</span></h4>
        <span className="mono dim" style={{ fontSize: 11.5, marginTop: -6 }}>{fx.name} · {fx.spec}</span>
        <AskAI scene={scene} kind={kind} item={it} kit={kit} />
        <Slider label="Output" value={it.intensity} min={0.05} max={1} onChange={(intensity) => upd({ intensity, target: undefined })} fmt={(v) => Math.round(v * 100) + '%'} />
        {fx.cctMin !== fx.cctMax && <Slider label="Color temp" value={it.cct} min={fx.cctMin} max={fx.cctMax} step={100} onChange={(cct) => upd({ cct })} fmt={(v) => v + ' K'} />}
        <Slider label="Height" value={it.y} min={0.4} max={Math.min(2.6, scene.room.h - 0.1)} onChange={(y) => upd({ y })} fmt={(v) => v.toFixed(2) + ' m'} />
        <Slider label="Diffusion" value={it.diffusion ?? fx.softness} min={0} max={1} onChange={(diffusion) => upd({ diffusion })} fmt={(v) => (v < 0.3 ? 'Hard' : v < 0.7 ? 'Medium' : 'Soft')} />
        <label className="prop"><span>Role</span><select className="select" style={{ gridColumn: 'span 2', height: 30 }} value={it.role} onChange={(e) => upd({ role: e.target.value })}>{['key', 'fill', 'rim', 'back', 'ambient'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></label>
        <label className="prop"><span>Aim at</span><select className="select" style={{ gridColumn: 'span 2', height: 30 }} value="" onChange={(e) => aimAt(e.target.value)}><option value="">Choose an actor…</option>{scene.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <div className="row"><div className="seg"><button className={it.on !== false ? 'on' : ''} onClick={() => upd({ on: true })}>On</button><button className={it.on === false ? 'on' : ''} onClick={() => upd({ on: false })}>Off</button></div><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={del}><Icon name="trash" size={14} /> Remove</button></div>
      </div>
    )
  }
  const aimAt = (id) => { const a = scene.actors.find((x) => x.id === id); if (a) upd({ aim: actorFace(a) }, 'Aim camera') }
  return (
    <div className="insp">
      <h4>Cam {it.label} <span className="mono dim" style={{ fontSize: 12, fontWeight: 400 }}>{it.shot}</span></h4>
      <AskAI scene={scene} kind={kind} item={it} kit={kit} />
      <div className="row wrap" style={{ gap: 4 }}>{FOCALS.map((f) => <button key={f} className={'chip' + (it.focal === f ? ' warm' : '')} onClick={() => upd({ focal: f })}>{f}</button>)}</div>
      <Slider label="Height" value={it.y} min={0.4} max={2.4} onChange={(y) => upd({ y })} fmt={(v) => v.toFixed(2) + ' m'} />
      <label className="prop"><span>Frame on</span><select className="select" style={{ gridColumn: 'span 2', height: 30 }} value="" onChange={(e) => aimAt(e.target.value)}><option value="">Choose an actor…</option>{scene.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <div className="row"><button className="btn sm" disabled={scene.activeCam === it.id} onClick={() => commitScene({ ...scene, activeCam: it.id }, 'Switch camera')}><Icon name="frame" size={14} /> Look through</button><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={del}><Icon name="trash" size={14} /> Remove</button></div>
    </div>
  )
}

function Checks({ checks, select }) {
  const n = { ok: 0, warn: 0, error: 0 }
  checks.forEach((c) => n[c.level]++)
  const sorted = [...checks].sort((a, b) => ({ error: 0, warn: 1, ok: 2 }[a.level] - { error: 0, warn: 1, ok: 2 }[b.level]))
  return (
    <div className="sec">
      <h4>Feasibility<span className="summary-dots"><span><span className="dot" style={{ background: 'var(--bad)' }} /> {n.error}</span><span><span className="dot" style={{ background: 'var(--warn)' }} /> {n.warn}</span><span><span className="dot" style={{ background: 'var(--ok)' }} /> {n.ok}</span></span></h4>
      {sorted.map((c) => (
        <div key={c.id} className={`check ${c.level}${c.target ? ' clickable' : ''}`} onClick={() => c.target && select({ id: c.target })}>
          <span className="check-ic" />
          <div><b>{c.title}</b><span>{c.detail}</span>{c.fix && <div className="fix"><button className="btn sm" onClick={(e) => { e.stopPropagation(); fixIssue(c.fix) }}>{c.fix.label}</button></div>}</div>
        </div>
      ))}
    </div>
  )
}

function Frames({ scene, frames, usage }) {
  const list = [...frames].reverse()
  return (
    <div className="sec" style={{ borderBottom: 0 }}>
      <h4>Reference frames <span className="mono dim" style={{ fontWeight: 400 }}>HD {usage.hdFrames}/{usage.hdQuota}</span></h4>
      <div className="row"><button className="btn sm" onClick={() => makeReference()} disabled={!scene.activeCam}><Icon name="image" size={14} /> Draft</button><button className="btn sm primary" onClick={() => makeReference({ hd: true })} disabled={!scene.activeCam}><Icon name="sparkle" size={14} /> HD frame</button></div>
      <p className="hint">Simulated: the lens view rendered at full quality and graded. With the image model connected this becomes a photoreal frame, checked against the plan the same way.</p>
      {list.map((f) => f.status === 'running'
        ? <div key={f.id} className="ref-progress"><div className="spinner" /><span>{f.stage}</span></div>
        : (
          <figure key={f.id} className="ref-card" style={{ margin: 0 }}>
            <img src={f.url} alt={`Reference frame for Cam ${f.cam}`} />
            <figcaption className="cap"><span>{f.hd ? 'HD' : 'Draft'} · Cam {f.cam} · {f.focal}mm</span><span>{f.dir}</span></figcaption>
            {f.qc && <div className="qc"><b style={{ color: f.qc.pass ? 'var(--ok)' : 'var(--warn)', fontWeight: 500 }}>{f.qc.pass ? 'Matches the plan' : 'Check before sharing'}</b>{f.qc.items.map((q) => <span key={q.text} className={q.ok ? 'ok' : 'bad'}>{q.text}</span>)}</div>}
          </figure>
        ))}
    </div>
  )
}

function Notes({ comments, scene, learning }) {
  const crit = useMemo(() => (learning ? critique(scene) : []), [learning, scene])
  return (
    <div>
      {learning && (
        <div className="sec">
          <h4>Critique of your setup</h4>
          {crit.map((c, i) => <div key={i} className={`check ${c.level === 'tip' ? 'tip' : c.level}`}><span className="check-ic" /><div><b style={{ fontWeight: 400 }}>{c.text}</b></div></div>)}
          <button className="btn sm" onClick={() => { setState({ learning: false }); runGeneration(); navigate('/directions') }}><Icon name="sparkle" size={14} /> Compare with AI directions</button>
        </div>
      )}
      <div className="sec" style={{ borderBottom: 0 }}>
        <h4>Comments <span className="mono dim" style={{ fontWeight: 400 }}>{comments.filter((c) => !c.resolved).length} open</span></h4>
        {comments.slice().reverse().map((c) => (
          <div key={c.id} className="comment">
            <span className="avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{c.author[0]}</span>
            <div>
              <span className="who">{c.author}</span><span className="when">{ago(c.at)}{c.target?.name ? ` · on ${c.target.name}` : ''}</span>
              <p style={{ textDecoration: c.resolved ? 'line-through' : 'none', color: c.resolved ? 'var(--dim)' : undefined }}>{c.text}</p>
              {!c.resolved && <div className="row"><button className="btn sm" onClick={() => commentToAI(c)}><Icon name="wand" size={13} /> Let AI change it</button><button className="btn ghost sm" onClick={() => setState((s) => ({ comments: s.comments.map((x) => (x.id === c.id ? { ...x, resolved: true } : x)) }))}>Resolve</button></div>}
            </div>
          </div>
        ))}
        {!comments.length && <p className="hint">Click anywhere in the lens view to leave a note on that part of the frame.</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- overlays

function LensOverlay({ rects, scene, ui, fcUrl, histo, onFrameClick, comments }) {
  if (!rects?.frame) return null
  const img = rects.image
  const cam = scene.cameras.find((c) => c.id === scene.activeCam)
  const key = scene.lights.find((l) => l.role === 'key')
  const lead = scene.actors[1] || scene.actors[0]
  const ex = lead ? stopsAt(scene, lead) : null
  return (
    <>
      {rects.set && <div className="hsplit" style={{ top: rects.frame.y - 1 }} />}
      {!img && <div className="view-tag" style={{ left: rects.frame.x + rects.frame.w / 2 - 120, top: rects.frame.y + rects.frame.h / 2 }}>No camera yet. Add one from the top bar.</div>}
      {img && <>
        {ui.falseColor && fcUrl && <img className="fc-img" src={fcUrl} alt="False color exposure map" style={{ left: img.x, top: img.y, width: img.w, height: img.h }} />}
        {ui.frameGuides && (
          <div className="lens-frame" style={{ left: img.x, top: img.y, width: img.w, height: img.h }}>
            <div className="third-v" style={{ left: '33.333%' }} /><div className="third-v" style={{ left: '66.666%' }} />
            <div className="third-h" style={{ top: '33.333%' }} /><div className="third-h" style={{ top: '66.666%' }} />
            <div className="safe" /><div className="corner tl" /><div className="corner tr" /><div className="corner bl" /><div className="corner br" />
            <div className="rec"><span className="dot" />CAM {cam?.label} · {cam?.shot}</div>
          </div>
        )}
        {ui.histogram && histo && <div className="histo" style={{ left: img.x + img.w - 162, top: img.y + 10 }} aria-hidden="true">{histo.map((h, i) => <i key={i} style={{ height: `${Math.max(2, h * 100)}%` }} />)}</div>}
        <div className="frame-hit" style={{ left: img.x, top: img.y, width: img.w, height: img.h }} onClick={onFrameClick} title="Click to comment on this part of the frame" />
        {comments.filter((c) => c.frame === scene.activeCam && c.x !== undefined).map((c, i) => (
          <div key={c.id} className={'comment-pin' + (c.resolved ? ' resolved' : '')} style={{ left: img.x + c.x * img.w, top: img.y + c.y * img.h }} title={c.text}><span>{i + 1}</span></div>
        ))}
        <div className="datastrip" style={{ left: img.x, top: img.y + img.h + 10, width: img.w }}>
          <span><span className="dot" style={{ background: 'var(--tally)', marginRight: 6 }} />CAM <b>{cam?.label}</b></span><span><b>{cam?.focal}</b> MM</span><span><b>T{scene.tstop}</b></span><span>ISO <b>{scene.iso}</b></span><span><b>{scene.aspect}</b>:1</span>
          {key && <span>KEY <b>{key.cct}K</b> {Math.round(key.intensity * 100)}%</span>}
          {ex && <span>{lead.name.toUpperCase()} <b style={{ color: Math.abs(ex.stops) > 1.6 ? 'var(--warn)' : undefined }}>{ex.stops >= 0 ? '+' : ''}{ex.stops.toFixed(1)}</b> EV</span>}
        </div>
        {ui.falseColor && <div className="fc-legend" style={{ left: img.x, top: Math.max(4, img.y - 22) }}>{[['#5614a0', 'crush', '#fff'], ['#2448c8', '<10', '#fff'], ['#6e6e6e', '20–38', '#fff'], ['#48a858', '18% grey'], ['#ec7ca0', 'skin hi'], ['#f4c828', 'near clip'], ['#e83228', 'clip', '#fff']].map(([c, l, t]) => <span key={l} style={{ background: c, color: t || '#111' }}>{l}</span>)}</div>}
      </>}
    </>
  )
}

function CommandBar() {
  const { pending, thinking, aiLog } = useStore((s) => ({ pending: s.pending, thinking: s.thinking, aiLog: s.aiLog }))
  const [text, setText] = useState('')
  const last = aiLog[aiLog.length - 1]
  const submit = (t) => { const v = (t ?? text).trim(); if (!v) return; sendCommand(v); setText('') }
  return (
    <div className="cmd">
      {pending && (
        <div className="ai-card" role="status">
          <div className="hd"><Icon name="wand" size={14} /> Proposed change · previewing in the set and the lens</div>
          <p>{pending.summary}</p>
          {pending.ref && <span className="dim" style={{ fontSize: 12.5 }}>Why: {pending.ref}</span>}
          {pending.issues?.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--warn)' }}>After this change: {pending.issues.join('; ')}</span>}
          <div className="row wrap">
            <button className="btn primary sm" onClick={acceptPending}><Icon name="check" size={14} /> Accept</button>
            <button className="btn sm" onClick={discardPending}><Icon name="x" size={14} /> Discard</button>
            <button className="btn ghost sm" onClick={() => { discardPending(); sendCommand(pending.prompt + ' (try a different way)') }}>Try another way</button>
          </div>
        </div>
      )}
      <div className="cmd-box">
        {!pending && last?.role === 'ai' && !last.ok && <div className="row wrap" style={{ gap: 6 }}><span className="muted" style={{ fontSize: 12.5 }}>{last.text} Try:</span>{last.suggestions.map((s) => <button key={s} className="chip" onClick={() => submit(s)}>{s}</button>)}</div>}
        <form className="cmd-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell the set what to change: “her face is too dark”, “add a candle”, “move the key to camera left”" aria-label="Describe a change" disabled={thinking} />
          <button className="btn primary" type="submit" disabled={thinking || !text.trim()} style={{ height: 42 }}>{thinking ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Icon name="send" size={15} />} {thinking ? 'Thinking' : 'Propose'}</button>
        </form>
        {!pending && !(last?.role === 'ai' && !last.ok) && <div className="cmd-chips">{QUICK.map((q) => <button key={q} className="chip" onClick={() => submit(q)} disabled={thinking}>{q}</button>)}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- page

export default function Studio() {
  const { scene, pending, selection, ui, setup, frames, history, versions, comments, learning, usage, aiLog, thinking } = useStore((s) => ({ scene: s.scene, pending: s.pending, selection: s.selection, ui: s.ui, setup: s.setup, frames: s.frames, history: s.history, versions: s.versions, comments: s.comments, learning: s.learning, usage: s.usage, aiLog: s.aiLog, thinking: s.thinking }))
  const [rects, setRects] = useState(null)
  const [labels, setLabels] = useState({ list: [], hover: null })
  const [fcUrl, setFcUrl] = useState(null)
  const [histo, setHisto] = useState(null)
  const [pop, setPop] = useState(null)
  const [showWhy, setShowWhy] = useState('sel')
  const wrapRef = useRef(null)
  const shown = pending?.scene || scene
  const checks = useMemo(() => (shown ? runChecks(shown, setup.kit) : []), [shown, setup.kit])
  const select = (s) => setState((st) => ({ selection: s ? s : null, ui: s && st.ui.rightTab === 'ai' ? { ...st.ui, rightTab: 'inspect' } : st.ui }))
  const setUI = (p) => setState((st) => ({ ui: { ...st.ui, ...p } }))
  const engUI = useMemo(() => ({ cones: ui.cones, grid: true, haze: ui.haze, setLight: ui.setLight || 'work' }), [ui.cones, ui.haze, ui.setLight])

  useEffect(() => {
    if (!scene) return
    const t = setTimeout(() => {
      const e = engineRef.current
      if (!e || !e.lens) return
      const aspect = ASPECTS[shown.aspect] || 2.39
      if (ui.falseColor) setFcUrl(e.falseColor(480, Math.round(480 / aspect)))
      if (ui.histogram) setHisto(e.histogram(240, 100))
    }, 450)
    return () => clearTimeout(t)
  }, [ui.falseColor, ui.histogram, shown, scene, ui.view])

  useEffect(() => {
    const on = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (e.key === 'Enter' && getState().pending) { acceptPending(); return }
      const sel = getState().selection
      if (!sel) { if (e.key === 'Escape') discardPending(); return }
      const kind = ['objects', 'lights', 'cameras', 'actors'].find((k) => getState().scene[k].some((x) => x.id === sel.id))
      if ((e.key === 'Delete' || e.key === 'Backspace') && kind && kind !== 'actors') { e.preventDefault(); removeItem(kind, sel.id) }
      if (e.key.toLowerCase() === 'r' && (kind === 'objects' || kind === 'actors')) { const it = getState().scene[kind].find((x) => x.id === sel.id); updateItem(kind, sel.id, { rot: (it.rot || 0) + Math.PI / 12 }, 'Rotate') }
      if (e.key.toLowerCase() === 'f') engineRef.current?.frameOn(sel.id)
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  if (!scene) {
    return (
      <div className="page">
        <div className="page-head"><div><div className="kicker"><span className="stepno">3</span> Studio</div><h1>Nothing in the studio yet</h1><p>Pick a direction first, or try the sample scene.</p></div></div>
        <div className="row"><button className="btn primary" onClick={() => navigate('/directions')}>Go to directions</button><button className="btn" onClick={() => navigate('/setup')}>Set up a scene</button></div>
      </div>
    )
  }

  const onTransform = (kind, id, c) => {
    const s = getState().scene
    const it = s[kind].find((x) => x.id === id)
    if (!it) return
    if (kind === 'lights' && it.target !== undefined) { const moved = calibrate({ ...it, ...c }, s.iso, s.tstop); updateItem(kind, id, { ...c, intensity: moved.intensity }, 'Move'); return }
    updateItem(kind, id, c, 'Move')
  }
  const onDrop = (e) => {
    e.preventDefault()
    const asset = e.dataTransfer.getData('text/asset')
    if (!asset) return
    const p = engineRef.current?.floorPoint(e.clientX, e.clientY)
    addObject({ asset, x: p ? +p.x.toFixed(2) : 0, z: p ? +p.z.toFixed(2) : 0, y: getAsset(asset)?.onTable ? 0.45 : 0 })
    toast(`Added ${getAsset(asset)?.name}`)
  }
  const addAt = (asset) => { const a = scene.actors[0]; addObject({ asset, x: a ? +(a.x + 0.9).toFixed(2) : 0, z: a ? +(a.z + 0.8).toFixed(2) : 0, y: getAsset(asset)?.onTable ? 0.45 : 0 }) }
  const onFrameClick = (e) => {
    const img = rects.image
    const wrap = wrapRef.current.getBoundingClientRect()
    const x = e.clientX - wrap.left, y = e.clientY - wrap.top
    const u = (x - img.x) / img.w, v = (y - img.y) / img.h
    const hit = engineRef.current?.frameHit(u, v)
    const target = hit?.kind === 'actors' ? { kind: 'actors', id: hit.id, name: scene.actors.find((a) => a.id === hit.id)?.name } : hit?.kind === 'objects' ? { kind: 'objects', id: hit.id, name: getAsset(scene.objects.find((o) => o.id === hit.id)?.asset)?.name?.toLowerCase() } : null
    setPop({ x, y, u, v, target, text: '' })
  }
  const sendPop = (t, toAI) => {
    addComment({ text: t, target: pop.target, x: pop.u, y: pop.v, frame: scene.activeCam })
    if (toAI) sendCommand(t + (pop.target?.name ? ` (on ${pop.target.name})` : ''), { hintActor: pop.target?.kind === 'actors' ? pop.target.id : undefined, source: 'frame' })
    setPop(null)
  }
  const cams = scene.cameras
  const addCam = () => {
    const label = String.fromCharCode(65 + cams.length)
    const a = scene.actors[0], b = scene.actors[1] || a
    const aim = a ? [(a.x + b.x) / 2, 1.0, (a.z + b.z) / 2] : [0, 1, 0]
    const c = { id: newId('cam'), label, x: aim[0] + 0.3, y: 1.3, z: Math.min(scene.room.d / 2 - 0.4, aim[2] + 2.6), aim, focal: 35, shot: 'New angle', source: 'user' }
    commitScene({ ...scene, cameras: [...cams, c], activeCam: c.id }, 'Add camera')
    select({ kind: 'cameras', id: c.id })
  }

  return (
    <div className="studio" ref={wrapRef} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }} onDrop={onDrop}>
      <Viewport scene={scene} pending={pending} selection={selection} mode="studio" view={ui.view} ui={engUI}
        onSelect={(h) => select(h)} onTransform={onTransform} onFrameRect={setRects} onLabels={(list, hover) => setLabels({ list, hover })}
        onReady={(e) => { engineRef.current = e }} camPos={[5.2, 4.3, 6.0]} target={[0, 0.7, -0.3]} />
      {ui.view === 'plan2d' && (
        <div className="studio-plan">
          <PlanEditor
            room={shown.room} objects={shown.objects} actors={shown.actors} lights={shown.lights} cameras={shown.cameras} activeCam={shown.activeCam} aspect={shown.aspect}
            editKinds={['objects', 'actors', 'lights', 'cameras']} selection={selection} compact
            onSelect={(h) => select(h && h.kind !== 'room' && h.kind !== 'opening' ? h : null)}
            onMove={(kind, id, c) => (kind === 'lights' || kind === 'cameras') ? onTransform(kind, id, c) : updateItem(kind, id, c, c.rot !== undefined ? 'Rotate' : 'Move')}
            onDelete={(kind, id) => removeItem(kind, id)}
            onDropAsset={(asset, x, z) => { addObject({ asset, x, z, y: getAsset(asset)?.onTable ? 0.45 : 0 }); toast(`Added ${getAsset(asset)?.name}`) }}
          />
        </div>
      )}

      {ui.labels && rects?.set && labels.list.map((l) => {
        const it = shown[l.kind].find((x) => x.id === l.id)
        if (!it || l.x < 290 || l.y < 52 || l.y > (rects.set.h - 6) || (rects.set && l.x > rects.set.w - (window.innerWidth > 1180 ? 330 : 10))) return null
        const selected = selection?.id === l.id
        if (!selected && labels.hover !== l.id && l.kind !== 'cameras' && l.kind !== 'actors') return <span key={l.id} className="vp-label" style={{ left: l.x, top: l.y, height: 14, width: 14, padding: 0, borderRadius: 7, background: l.kind === 'lights' ? cctToHex(it.cct) : undefined }} onClick={() => select({ kind: l.kind, id: l.id })} title={it.label} />
        return (
          <span key={l.id} className={'vp-label' + (selected ? ' sel' : '')} style={{ left: l.x, top: l.y }} onClick={() => select({ kind: l.kind, id: l.id })}>
            {l.kind === 'lights' && <span className="dot" style={{ background: cctToHex(it.cct) }} />}
            {l.kind === 'cameras' && <span className="dot" style={{ background: it.id === shown.activeCam ? 'var(--tally)' : 'var(--dim)' }} />}
            {l.kind === 'actors' ? `${it.label} · ${it.name}` : l.kind === 'cameras' ? `Cam ${it.label}` : it.label}
            <span className="mono">{l.kind === 'lights' ? `${Math.round(it.intensity * 100)}% ${it.cct}K` : l.kind === 'cameras' ? `${it.focal}mm` : ''}</span>
          </span>
        )
      })}
      <LensOverlay rects={rects} scene={shown} ui={ui} fcUrl={fcUrl} histo={histo} onFrameClick={onFrameClick} comments={comments} />

      <div className="studio-bar">
        <div className="float">
          <div className="seg" role="group" aria-label="View">{[['set', '3D'], ['plan2d', 'Plan'], ['split', 'Split'], ['frame', 'Lens']].map(([v, l]) => <button key={v} className={ui.view === v ? 'on' : ''} onClick={() => setUI({ view: v })}>{l}</button>)}</div>
          <span className="sep" />
          <button className="icon-btn" title="Perspective" aria-label="Perspective view" onClick={() => engineRef.current?.preset('persp')}><Icon name="persp" size={15} /></button>
          <button className="icon-btn" title="Top view" aria-label="Top view" onClick={() => engineRef.current?.preset('top')}><Icon name="top" size={15} /></button>
          <button className="icon-btn" title="Front view" aria-label="Front view" onClick={() => engineRef.current?.preset('front')}><Icon name="box" size={15} /></button>
          {(ui.view === 'set' || ui.view === 'split') && <><span className="sep" /><div className="seg" role="group" aria-label="Set view lighting" title="Work light shows the set clearly. Scene light shows your lighting plan."><button className={(ui.setLight || 'work') === 'work' ? 'on' : ''} onClick={() => setUI({ setLight: 'work' })}>Work light</button><button className={ui.setLight === 'scene' ? 'on' : ''} onClick={() => setUI({ setLight: 'scene' })}>Scene light</button></div></>}
        </div>
        <div className="float">
          {cams.map((c) => <button key={c.id} className={'chip' + (c.id === scene.activeCam ? ' tally' : '')} onClick={() => commitScene({ ...scene, activeCam: c.id }, 'Switch camera')}>{c.id === scene.activeCam && <span className="dot" style={{ background: 'var(--tally)' }} />}Cam {c.label} · {c.focal}mm</button>)}
          <button className="icon-btn" title="Add a camera" aria-label="Add a camera" onClick={addCam}><Icon name="plus" size={15} /></button>
        </div>
        <div className="float">
          <button className={'icon-btn' + (ui.cones ? ' on' : '')} title="Light beams" aria-pressed={ui.cones} aria-label="Light beams" onClick={() => setUI({ cones: !ui.cones })}><Icon name="cone" size={15} /></button>
          <button className={'icon-btn' + (ui.labels ? ' on' : '')} title="Labels" aria-pressed={ui.labels} aria-label="Labels" onClick={() => setUI({ labels: !ui.labels })}><Icon name="comment" size={15} /></button>
          <button className={'icon-btn' + (ui.frameGuides ? ' on' : '')} title="Frame guides" aria-pressed={ui.frameGuides} aria-label="Frame guides" onClick={() => setUI({ frameGuides: !ui.frameGuides })}><Icon name="grid" size={15} /></button>
          <button className={'icon-btn' + (ui.histogram ? ' on' : '')} title="Histogram" aria-pressed={ui.histogram} aria-label="Histogram" onClick={() => setUI({ histogram: !ui.histogram })}><Icon name="chart" size={15} /></button>
          <button className={'chip' + (ui.falseColor ? ' warm' : '')} onClick={() => setUI({ falseColor: !ui.falseColor, view: ui.view === 'set' ? 'split' : ui.view })} aria-pressed={ui.falseColor}>False color</button>
          <span className="sep" />
          <select className="select mono" style={{ width: 76, height: 28, fontSize: 12 }} value={scene.tstop} onChange={(e) => commitScene({ ...scene, tstop: +e.target.value }, 'T-stop')} aria-label="T-stop">{[1.4, 2, 2.8, 4, 5.6].map((t) => <option key={t} value={t}>T{t}</option>)}</select>
          <select className="select mono" style={{ width: 92, height: 28, fontSize: 12 }} value={scene.iso} onChange={(e) => commitScene({ ...scene, iso: +e.target.value }, 'ISO')} aria-label="ISO">{[400, 800, 1600, 3200].map((t) => <option key={t} value={t}>ISO {t}</option>)}</select>
        </div>
        <div className="float">
          <button className="icon-btn" onClick={undo} title="Undo (⌘Z)" aria-label="Undo"><Icon name="undo" size={15} /></button>
          <button className="icon-btn" onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo"><Icon name="redo" size={15} /></button>
          <button className="icon-btn" onClick={() => { saveVersion(); toast('Version saved') }} title="Save a version" aria-label="Save a version"><Icon name="save" size={15} /></button>
        </div>
        <span style={{ flex: 1 }} />
        <div className="float"><button className={'btn sm ' + (learning ? 'primary' : 'ghost')} onClick={() => setState({ learning: !learning })}><Icon name="learn" size={14} /> Learning mode</button></div>
      </div>

      {learning && <div className="float learn-banner"><Icon name="learn" size={15} /> Learning mode: light it yourself. The critique on the right updates as you go.</div>}

      <aside className="panel left" aria-label="Layers, assets and history">
        <div className="panel-tabs" role="tablist">
          {[['layers', 'Layers'], ['assets', 'Assets'], ['history', 'History']].map(([k, l]) => <button key={k} role="tab" aria-selected={ui.leftTab === k} className={ui.leftTab === k ? 'on' : ''} onClick={() => setUI({ leftTab: k })}>{l}</button>)}
        </div>
        {ui.leftTab === 'layers' && <div className="row between" style={{ padding: '6px 14px 0', fontSize: 12 }}><span className="dim">Why each piece is here</span><div className="seg"><button className={showWhy === 'sel' ? 'on' : ''} onClick={() => setShowWhy('sel')}>Selected</button><button className={showWhy === 'all' ? 'on' : ''} onClick={() => setShowWhy('all')}>All</button></div></div>}
        <div className="panel-body">
          {ui.leftTab === 'assets' ? <AssetLibrary onAdd={addAt} /> : ui.leftTab === 'history' ? <History history={history} versions={versions} /> : <Layers scene={shown} selection={selection} select={select} kit={setup.kit} showWhy={showWhy} />}
        </div>
      </aside>

      <aside className="panel right" aria-label="Inspector, checks and frames">
        <div className="panel-tabs" role="tablist">
          {[['ai', '✦ AI'], ['inspect', 'Inspect'], ['frames', 'Frames'], ['notes', learning ? 'Critique' : `Notes${comments.filter((c) => !c.resolved).length ? ' · ' + comments.filter((c) => !c.resolved).length : ''}`]].map(([k, l]) => <button key={k} role="tab" aria-selected={ui.rightTab === k} className={ui.rightTab === k ? 'on' : ''} onClick={() => setUI({ rightTab: k })}>{l}</button>)}
        </div>
        <div className="panel-body">
          {ui.rightTab === 'ai' ? <Copilot scene={scene} kit={setup.kit} aiLog={aiLog} thinking={thinking} /> : ui.rightTab === 'frames' ? <Frames scene={scene} frames={frames} usage={usage} /> : ui.rightTab === 'notes' ? <Notes comments={comments} scene={shown} learning={learning} /> : <><Inspector scene={shown} selection={selection} select={select} kit={setup.kit} /><Checks checks={checks} select={select} /></>}
        </div>
      </aside>

      {pop && (
        <div className="comment-pop" style={{ left: Math.max(8, Math.min(pop.x + 12, window.innerWidth - 330)), top: Math.max(60, Math.min(pop.y - 40, window.innerHeight - 300)) }}>
          <b style={{ fontSize: 13 }}>{pop.target?.name ? `Note on ${pop.target.name}` : 'Note on this part of the frame'}</b>
          <form onSubmit={(e) => { e.preventDefault(); pop.text.trim() && sendPop(pop.text, false) }} className="stack" style={{ gap: 8 }}>
            <input className="input" autoFocus placeholder="What should change here?" value={pop.text} onChange={(e) => setPop({ ...pop, text: e.target.value })} />
            <div className="cmd-chips">{(pop.target?.kind === 'actors' ? ['Face is too dark', 'Warmer on her', 'Move closer to the door'] : ['Too dark here', 'Make it cooler', 'Clear the clutter']).map((c) => <button key={c} type="button" className="chip" onClick={() => setPop({ ...pop, text: c })}>{c}</button>)}</div>
            <div className="row"><button className="btn primary sm" type="button" disabled={!pop.text.trim()} onClick={() => sendPop(pop.text, true)}><Icon name="wand" size={13} /> Send to AI</button><button className="btn sm" type="submit" disabled={!pop.text.trim()}>Just comment</button><button className="btn ghost sm" type="button" onClick={() => setPop(null)}>Cancel</button></div>
          </form>
        </div>
      )}
      <CommandBar />
    </div>
  )
}
