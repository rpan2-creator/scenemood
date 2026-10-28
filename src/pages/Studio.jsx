import { useEffect, useMemo, useRef, useState } from 'react'
import Viewport from '../components/Viewport.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, setState, getState, commitScene, updateItem, removeItem, addObject, undo, redo, navigate, newId } from '../store.js'
import { ASSETS, ASSET_CATS, getAsset } from '../data/assets.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { runChecks, stopsAt, exposureTarget, actorFace, ASPECTS } from '../engine/checks.js'
import { assetThumb } from '../engine/SceneEngine.js'
import { engineRef, sendCommand, acceptPending, discardPending, fixIssue, makeReference, toast } from '../actions.js'

const deg = (r) => Math.round(((r || 0) * 180) / Math.PI)
const FOCALS = [18, 24, 32, 35, 50, 65, 85, 100]
const QUICK = ['Her face is too dark', 'Make it moodier', 'Move her closer to the door', 'Add a practical lamp', 'Tighter on this camera', 'Clear the clutter']

// ---------------------------------------------------------------- left pane

function Layers({ scene, selection, select, kit }) {
  const sel = selection?.id
  const lightsLeft = Object.entries(kit).filter(([k, n]) => n > scene.lights.filter((l) => l.fixture === k).length)
  const addLight = (fx) => {
    const a = scene.actors[0]
    const l = { id: newId('light'), fixture: fx, role: 'fill', label: 'New ' + FIXTURES[fx].name.toLowerCase(), x: a ? a.x + 1.2 : 1, y: fx === 'reflector' ? 1.0 : 1.9, z: a ? a.z + 1.2 : 1, aim: a ? actorFace(a) : [0, 1, 0], intensity: 0.5, cct: 4300, on: true }
    commitScene({ ...scene, lights: [...scene.lights, l] }, 'Add light')
    select({ kind: 'lights', id: l.id })
  }
  const Row = ({ kind, item, dot, name, meta }) => (
    <div className={'item' + (sel === item.id ? ' sel' : '')} onClick={() => select({ kind, id: item.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select({ kind, id: item.id })}>
      {dot}
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {item.source === 'ai' && <span className="ai-tag">AI</span>}
      </span>
      <span className="meta">{meta}</span>
    </div>
  )
  return (
    <div>
      <div className="group">
        <div className="group-h"><span>Set dressing</span><span className="mono">{scene.objects.length}</span></div>
        {scene.objects.map((o) => {
          const a = getAsset(o.asset)
          return <Row key={o.id} kind="objects" item={o} name={a?.name || o.asset} meta={a?.practical ? (o.on === false ? 'off' : 'on') : ''} dot={<Icon name="cube" size={14} style={{ color: 'var(--dim)' }} />} />
        })}
      </div>
      <div className="group">
        <div className="group-h"><span>Blocking</span><span className="mono">{scene.actors.length}</span></div>
        {scene.actors.map((a) => <Row key={a.id} kind="actors" item={a} name={`${a.name}`} meta={a.pose} dot={<Icon name="person" size={14} style={{ color: 'var(--dim)' }} />} />)}
      </div>
      <div className="group">
        <div className="group-h"><span>Cameras</span><span className="mono">{scene.cameras.length}</span></div>
        {scene.cameras.map((c) => <Row key={c.id} kind="cameras" item={c} name={`Cam ${c.label} · ${c.shot || ''}`} meta={`${c.focal}mm`} dot={<Icon name="camera" size={14} style={{ color: c.id === scene.activeCam ? 'var(--tungsten)' : 'var(--dim)' }} />} />)}
      </div>
      <div className="group">
        <div className="group-h"><span>Lighting</span><span className="mono">{scene.lights.length}</span></div>
        {scene.lights.map((l) => <Row key={l.id} kind="lights" item={l} name={l.label || l.role} meta={`${Math.round(l.intensity * 100)}%`} dot={<span className="dot" style={{ background: l.on === false ? 'var(--line-2)' : cctToHex(l.cct), marginLeft: 3 }} />} />)}
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
  const [thumbs, setThumbs] = useState({})
  useEffect(() => {
    let i = 0, alive = true
    const step = () => {
      if (!alive || i >= ASSETS.length) return
      const a = ASSETS[i++]
      const url = assetThumb(a.id)
      setThumbs((t) => ({ ...t, [a.id]: url }))
      requestAnimationFrame(step)
    }
    step()
    return () => { alive = false }
  }, [])
  const list = ASSETS.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div className="asset-search"><input className="input" placeholder="Search assets" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assets" /></div>
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
                    {thumbs[a.id] ? <img src={thumbs[a.id]} alt="" /> : <div style={{ aspectRatio: '4/3' }} />}
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

// ---------------------------------------------------------------- right pane

function Slider({ label, value, min, max, step = 0.01, onChange, fmt = (v) => v }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className="prop">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(+e.target.value)} onPointerUp={() => onChange(v)} onKeyUp={() => onChange(v)} onBlur={() => v !== value && onChange(v)} />
      <output>{fmt(v)}</output>
    </label>
  )
}

function Inspector({ scene, selection, setup, select }) {
  const found = selection && ['objects', 'actors', 'lights', 'cameras'].map((k) => [k, scene[k].find((x) => x.id === selection.id)]).find(([, x]) => x)
  const directions = useStore((s) => s.directions)
  const activeDirection = useStore((s) => s.activeDirection)
  if (!found) {
    const dir = directions.find((d) => d.id === activeDirection)
    return (
      <div className="insp">
        <h4>{dir ? dir.name : activeDirection === 'mix' ? 'Mixed direction' : 'Scene'}</h4>
        {dir && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{dir.mood}</p>}
        <dl className="kv">
          <dt>Room</dt><dd>{scene.room.w}×{scene.room.d} m</dd>
          <dt>Exposure target</dt><dd>{Math.round(exposureTarget(scene.iso, scene.tstop))} lux</dd>
          <dt>Lights</dt><dd>{scene.lights.length}</dd>
          <dt>Cameras</dt><dd>{scene.cameras.length}</dd>
          <dt>Aspect</dt><dd>{scene.aspect}:1</dd>
        </dl>
        <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Click anything in the set to edit it. Drag assets in from the library.</p>
      </div>
    )
  }
  const [kind, it] = found
  const upd = (c, label) => updateItem(kind, it.id, c, label)
  const del = () => { removeItem(kind, it.id); select(null) }
  if (kind === 'objects') {
    const a = getAsset(it.asset)
    return (
      <div className="insp">
        <h4>{a?.name}{it.source === 'ai' && <span className="ai-tag">AI added</span>}</h4>
        <Slider label="Left / right" value={it.x} min={-scene.room.w / 2} max={scene.room.w / 2} onChange={(x) => upd({ x })} fmt={(v) => v.toFixed(2) + ' m'} />
        <Slider label="Front / back" value={it.z} min={-scene.room.d / 2} max={scene.room.d / 2} onChange={(z) => upd({ z })} fmt={(v) => v.toFixed(2) + ' m'} />
        {!a?.wall && <Slider label="Rotation" value={deg(it.rot)} min={-180} max={180} step={5} onChange={(d) => upd({ rot: (d * Math.PI) / 180 })} fmt={(v) => v + '°'} />}
        {a?.practical && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Practical · {a.practical.cct} K</span>
            <div className="seg"><button className={it.on !== false ? 'on' : ''} onClick={() => upd({ on: true })}>On</button><button className={it.on === false ? 'on' : ''} onClick={() => upd({ on: false })}>Off</button></div>
          </div>
        )}
        <button className="btn sm" onClick={del}><Icon name="trash" size={14} /> Remove from set</button>
      </div>
    )
  }
  if (kind === 'actors') {
    const ex = stopsAt(scene, it)
    return (
      <div className="insp">
        <h4>{it.name} <span className="mono dim" style={{ fontSize: 12, fontWeight: 400 }}>Actor {it.label}</span></h4>
        <div className="seg"><button className={it.pose === 'sit' ? 'on' : ''} onClick={() => upd({ pose: 'sit' })}>Seated</button><button className={it.pose === 'stand' ? 'on' : ''} onClick={() => upd({ pose: 'stand' })}>Standing</button></div>
        <Slider label="Facing" value={deg(it.rot)} min={-180} max={180} step={5} onChange={(d) => upd({ rot: (d * Math.PI) / 180 })} fmt={(v) => v + '°'} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Skin tone</span>
          <div className="seg">{['light', 'medium', 'deep'].map((t) => <button key={t} className={it.tone === t ? 'on' : ''} onClick={() => upd({ tone: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
        </div>
        <dl className="kv">
          <dt>Light on face</dt><dd>{Math.round(ex.lux)} lux</dd>
          <dt>Exposure</dt><dd style={{ color: Math.abs(ex.stops) > 1.6 ? 'var(--warn)' : 'var(--text)' }}>{ex.stops >= 0 ? '+' : ''}{ex.stops.toFixed(1)} stops</dd>
        </dl>
      </div>
    )
  }
  if (kind === 'lights') {
    const fx = FIXTURES[it.fixture]
    const aimAt = (id) => { const a = scene.actors.find((x) => x.id === id); if (a) upd({ aim: actorFace(a) }, 'Aim light') }
    return (
      <div className="insp">
        <h4><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: cctToHex(it.cct) }} />{it.label || it.role}</span>{it.source === 'ai' && <span className="ai-tag">AI</span>}</h4>
        <p className="mono dim" style={{ margin: '-6px 0 0', fontSize: 11.5 }}>{fx.name} · {fx.spec}</p>
        <Slider label="Output" value={it.intensity} min={0.05} max={1} onChange={(intensity) => upd({ intensity })} fmt={(v) => Math.round(v * 100) + '%'} />
        <Slider label="Color temp" value={it.cct} min={fx.cctMin} max={fx.cctMax} step={100} onChange={(cct) => upd({ cct })} fmt={(v) => v + ' K'} />
        <Slider label="Height" value={it.y} min={0.4} max={Math.min(2.6, scene.room.h - 0.1)} onChange={(y) => upd({ y })} fmt={(v) => v.toFixed(2) + ' m'} />
        <Slider label="Diffusion" value={it.diffusion ?? fx.softness} min={0} max={1} onChange={(diffusion) => upd({ diffusion })} fmt={(v) => (v < 0.3 ? 'Hard' : v < 0.7 ? 'Medium' : 'Soft')} />
        <label className="prop"><span>Role</span>
          <select className="select" style={{ gridColumn: 'span 2', height: 30 }} value={it.role} onChange={(e) => upd({ role: e.target.value })}>
            {['key', 'fill', 'rim', 'back', 'ambient'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
        </label>
        <label className="prop"><span>Aim at</span>
          <select className="select" style={{ gridColumn: 'span 2', height: 30 }} value="" onChange={(e) => aimAt(e.target.value)}>
            <option value="">Choose an actor…</option>
            {scene.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <div className="row">
          <div className="seg"><button className={it.on !== false ? 'on' : ''} onClick={() => upd({ on: true })}>On</button><button className={it.on === false ? 'on' : ''} onClick={() => upd({ on: false })}>Off</button></div>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={del}><Icon name="trash" size={14} /> Remove</button>
        </div>
      </div>
    )
  }
  // camera
  const aimAt = (id) => { const a = scene.actors.find((x) => x.id === id); if (a) upd({ aim: actorFace(a) }, 'Aim camera') }
  return (
    <div className="insp">
      <h4>Cam {it.label} <span className="mono dim" style={{ fontSize: 12, fontWeight: 400 }}>{it.shot}</span></h4>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {FOCALS.map((f) => <button key={f} className={'chip' + (it.focal === f ? ' warm' : '')} onClick={() => upd({ focal: f })}>{f} mm</button>)}
      </div>
      <Slider label="Height" value={it.y} min={0.4} max={2.4} onChange={(y) => upd({ y })} fmt={(v) => v.toFixed(2) + ' m'} />
      <label className="prop"><span>Frame on</span>
        <select className="select" style={{ gridColumn: 'span 2', height: 30 }} value="" onChange={(e) => aimAt(e.target.value)}>
          <option value="">Choose an actor…</option>
          {scene.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <div className="row">
        <button className="btn sm" disabled={scene.activeCam === it.id} onClick={() => commitScene({ ...scene, activeCam: it.id }, 'Switch camera')}><Icon name="frame" size={14} /> Look through</button>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={del}><Icon name="trash" size={14} /> Remove</button>
      </div>
    </div>
  )
}

function Checks({ checks, select }) {
  const n = { ok: 0, warn: 0, error: 0 }
  checks.forEach((c) => n[c.level]++)
  const sorted = [...checks].sort((a, b) => ({ error: 0, warn: 1, ok: 2 }[a.level] - { error: 0, warn: 1, ok: 2 }[b.level]))
  return (
    <div className="checks">
      <h4>Feasibility
        <span className="summary-dots">
          <span><span className="dot" style={{ background: 'var(--bad)' }} /> {n.error}</span>
          <span><span className="dot" style={{ background: 'var(--warn)' }} /> {n.warn}</span>
          <span><span className="dot" style={{ background: 'var(--ok)' }} /> {n.ok}</span>
        </span>
      </h4>
      {sorted.map((c) => (
        <div key={c.id} className={`check ${c.level}${c.target ? ' clickable' : ''}`} onClick={() => c.target && select(c.target)}>
          <span className="check-ic" />
          <div>
            <b>{c.title}</b>
            <span>{c.detail}</span>
            {c.fix && <div className="fix"><button className="btn sm" onClick={(e) => { e.stopPropagation(); fixIssue(c.fix) }}>{c.fix.label}</button></div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function References({ scene, frames }) {
  const list = [...frames].reverse()
  return (
    <div className="refs">
      <h4>Reference frames
        <button className="btn sm" onClick={makeReference} disabled={!scene.activeCam}><Icon name="image" size={14} /> Generate</button>
      </h4>
      <p className="dim" style={{ margin: 0, fontSize: 12 }}>Simulated: the lens view, graded like a still. With the image model connected this becomes a photoreal frame, checked against the plan.</p>
      {list.map((f) => f.status === 'running'
        ? <div key={f.id} className="ref-progress"><div className="spinner" />Rendering Cam {f.cam} · checking against the plan</div>
        : (
          <figure key={f.id} className="ref-card" style={{ margin: 0 }}>
            <img src={f.url} alt={`Reference frame for Cam ${f.cam}`} />
            <figcaption className="cap"><span>AI REF · simulated</span><span>Cam {f.cam} · {f.focal}mm · {f.dir}</span></figcaption>
          </figure>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------- center

function FrameOverlays({ rects, scene, ui, fcUrl, onFrameClick, pin }) {
  if (!rects?.frame) return null
  const img = rects.image
  const cam = scene.cameras.find((c) => c.id === scene.activeCam)
  const key = scene.lights.find((l) => l.role === 'key')
  const lead = scene.actors[1] || scene.actors[0]
  const ex = lead ? stopsAt(scene, lead) : null
  return (
    <>
      {rects.set && <div className="divider" style={{ top: rects.frame.y - 1, left: 0, right: 0, bottom: 'auto', width: 'auto', height: 1 }} />}
      <div className="view-label" style={{ left: rects.frame.x + 12, top: rects.frame.y + 10 }}><Icon name="frame" size={14} /> Through the lens</div>
      {!img && <div className="empty-frame" style={{ left: rects.frame.x, top: rects.frame.y, width: rects.frame.w, height: rects.frame.h }}>No camera yet. Add one from a direction, or open a direction from the list.</div>}
      {img && (
        <>
          {ui.falseColor && fcUrl && <img className="fc-img" src={fcUrl} alt="False color exposure map" style={{ left: img.x, top: img.y, width: img.w, height: img.h }} />}
          {ui.frameGuides && (
            <div className="frame-guides" style={{ left: img.x, top: img.y, width: img.w, height: img.h }}>
              <div className="third-v" style={{ left: '33.333%' }} /><div className="third-v" style={{ left: '66.666%' }} />
              <div className="third-h" style={{ top: '33.333%' }} /><div className="third-h" style={{ top: '66.666%' }} />
              <div className="safe" />
              <div className="corner tl" /><div className="corner tr" /><div className="corner bl" /><div className="corner br" />
              <div className="rec"><span className="dot" style={{ background: '#ef6b5b' }} />CAM {cam?.label} · {cam?.shot}</div>
            </div>
          )}
          <div className="frame-hit" style={{ left: img.x, top: img.y, width: img.w, height: img.h }} onClick={onFrameClick} title="Click to comment on this part of the frame" />
          {pin && <div className="comment-pin" style={{ left: pin.x, top: pin.y }} />}
          <div className="datastrip" style={{ left: img.x, top: img.y + img.h + 10, width: img.w }}>
            <span>CAM <b>{cam?.label}</b></span>
            <span><b>{cam?.focal}</b> MM</span>
            <span><b>T{scene.tstop}</b></span>
            <span>ISO <b>{scene.iso}</b></span>
            <span><b>{scene.aspect}</b>:1</span>
            {key && <span>KEY <b>{key.cct}K</b> {Math.round(key.intensity * 100)}%</span>}
            {ex && <span>{lead.name.toUpperCase()} <b style={{ color: Math.abs(ex.stops) > 1.6 ? 'var(--warn)' : undefined }}>{ex.stops >= 0 ? '+' : ''}{ex.stops.toFixed(1)}</b> EV</span>}
          </div>
          {ui.falseColor && (
            <div className="fc-legend" style={{ left: img.x, top: Math.max(4, img.y - 22) }}>
              {[['#5614a0', 'crush', '#fff'], ['#2448c8', '<10', '#fff'], ['#6e6e6e', '20–38', '#fff'], ['#48a858', '18% grey'], ['#ec7ca0', 'skin hi'], ['#f4c828', 'near clip'], ['#e83228', 'clip', '#fff']].map(([c, l, t]) => <span key={l} style={{ background: c, color: t || '#111' }}>{l}</span>)}
            </div>
          )}
        </>
      )}
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
        <div className="ai-card">
          <div className="hd"><Icon name="wand" size={14} /> Proposed change · preview pulsing in the set</div>
          <p>{pending.summary}</p>
          {pending.ref && <span className="dim" style={{ fontSize: 12.5 }}>Why: {pending.ref}</span>}
          {pending.issues?.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--warn)' }}>After this change: {pending.issues.join('; ')}</span>}
          <div className="acts">
            <button className="btn primary sm" onClick={acceptPending}><Icon name="check" size={14} /> Accept</button>
            <button className="btn sm" onClick={discardPending}><Icon name="x" size={14} /> Discard</button>
            <button className="btn ghost sm" onClick={() => { discardPending(); sendCommand(pending.prompt + ' (try a different way)') }}>Try another way</button>
          </div>
        </div>
      )}
      {!pending && last?.role === 'ai' && !last.ok && (
        <div className="ai-card err">
          <p className="muted">{last.text} Try one of these:</p>
          <div className="cmd-chips">{last.suggestions.map((s) => <button key={s} className="chip" onClick={() => submit(s)}>{s}</button>)}</div>
        </div>
      )}
      <form className="cmd-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell the set what to change: “her face is too dark”, “add a practical lamp”, “tighter on this camera”" aria-label="Describe a change" disabled={thinking} />
        <button className="btn primary" type="submit" disabled={thinking || !text.trim()} style={{ height: 40 }}>{thinking ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Icon name="send" size={15} />} {thinking ? 'Thinking' : 'Propose'}</button>
      </form>
      {!pending && !(last?.role === 'ai' && !last.ok) && (
        <div className="cmd-chips">{QUICK.map((q) => <button key={q} className="chip" onClick={() => submit(q)} disabled={thinking}>{q}</button>)}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- page

export default function Studio() {
  const { scene, pending, selection, ui, setup, frames } = useStore((s) => ({ scene: s.scene, pending: s.pending, selection: s.selection, ui: s.ui, setup: s.setup, frames: s.frames }))
  const [rects, setRects] = useState(null)
  const [fcUrl, setFcUrl] = useState(null)
  const [pop, setPop] = useState(null)
  const wrapRef = useRef(null)
  const shown = pending?.scene || scene
  const checks = useMemo(() => runChecks(shown, setup.kit), [shown, setup.kit])
  const select = (s) => setState({ selection: s ? (typeof s === 'string' ? { id: s } : s) : null })
  const setUI = (p) => setState((s) => ({ ui: { ...s.ui, ...p } }))

  // false color map from the actual render
  useEffect(() => {
    if (!ui.falseColor || !scene) return
    const t = setTimeout(() => {
      const e = engineRef.current
      if (!e) return
      const aspect = ASPECTS[shown.aspect] || 2.39
      setFcUrl(e.falseColor(480, Math.round(480 / aspect)))
    }, 250)
    return () => clearTimeout(t)
  }, [ui.falseColor, shown, scene])

  // keyboard
  useEffect(() => {
    const on = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      const sel = getState().selection
      if (!sel) { if (e.key === 'Escape') discardPending(); return }
      const kind = ['objects', 'lights', 'cameras', 'actors'].find((k) => getState().scene[k].some((x) => x.id === sel.id))
      if ((e.key === 'Delete' || e.key === 'Backspace') && kind && kind !== 'actors') { e.preventDefault(); removeItem(kind, sel.id) }
      if (e.key.toLowerCase() === 'r' && (kind === 'objects' || kind === 'actors')) {
        const it = getState().scene[kind].find((x) => x.id === sel.id)
        updateItem(kind, sel.id, { rot: (it.rot || 0) + Math.PI / 12 }, 'Rotate')
      }
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  if (!scene) {
    return (
      <div className="dirs">
        <div className="dirs-head"><div><h1>Nothing in the studio yet</h1><p>Open a direction, or start from the sample scene on the home page.</p></div></div>
        <div className="row"><button className="btn primary" onClick={() => navigate('/setup')}>Set up a scene</button><a className="btn" href="#/">Home</a></div>
      </div>
    )
  }

  const onTransform = (kind, id, c) => {
    const s = getState().scene
    const it = s[kind].find((x) => x.id === id)
    if (!it) return
    updateItem(kind, id, c, 'Move')
  }
  const onDrop = (e) => {
    e.preventDefault()
    const asset = e.dataTransfer.getData('text/asset')
    if (!asset) return
    const p = engineRef.current?.floorPoint(e.clientX, e.clientY)
    const x = p ? +p.x.toFixed(2) : 0, z = p ? +p.z.toFixed(2) : 0
    addObject({ asset, x, z, y: getAsset(asset)?.onTable ? 0.45 : 0 })
    toast(`Added ${getAsset(asset)?.name}`)
  }
  const addAt = (asset) => {
    const a = scene.actors[0]
    addObject({ asset, x: a ? +(a.x + 0.9).toFixed(2) : 0, z: a ? +(a.z + 0.8).toFixed(2) : 0, y: getAsset(asset)?.onTable ? 0.45 : 0 })
  }
  const onFrameClick = (e) => {
    const img = rects.image
    const wrap = wrapRef.current.getBoundingClientRect()
    const x = e.clientX - wrap.left, y = e.clientY - wrap.top
    const u = (x - img.x) / img.w, v = (y - img.y) / img.h
    const hit = engineRef.current?.frameHit(img, u, v)
    const actor = hit?.kind === 'actors' ? scene.actors.find((a) => a.id === hit.id) : null
    const objName = hit?.kind === 'objects' ? getAsset(scene.objects.find((o) => o.id === hit.id)?.asset)?.name : null
    setPop({ x, y, actor, objName, text: '' })
  }
  const sendPop = (t) => {
    const ctx = pop.actor ? ` (on ${pop.actor.name})` : pop.objName ? ` (on the ${pop.objName.toLowerCase()})` : ''
    sendCommand(t + ctx, { hintActor: pop.actor?.id, source: 'frame' })
    setPop((p) => ({ ...p, sent: true }))
    setTimeout(() => setPop(null), 600)
  }
  const cams = scene.cameras

  return (
    <div className="studio">
      <aside className="pane left" aria-label="Layers and assets">
        <div className="pane-tabs" role="tablist">
          <button role="tab" aria-selected={ui.leftTab === 'layers'} className={ui.leftTab === 'layers' ? 'on' : ''} onClick={() => setUI({ leftTab: 'layers' })}>Layers</button>
          <button role="tab" aria-selected={ui.leftTab === 'assets'} className={ui.leftTab === 'assets' ? 'on' : ''} onClick={() => setUI({ leftTab: 'assets' })}>Assets</button>
        </div>
        {ui.leftTab === 'assets' ? <AssetLibrary onAdd={addAt} /> : <Layers scene={shown} selection={selection} select={select} kit={setup.kit} />}
      </aside>

      <main className="center">
        <div className="toolbar" role="toolbar" aria-label="View">
          <div className="seg" role="group" aria-label="View mode">
            {[['set', 'Set'], ['split', 'Split'], ['frame', 'Lens']].map(([v, l]) => <button key={v} className={ui.view === v ? 'on' : ''} onClick={() => setUI({ view: v })}>{l}</button>)}
          </div>
          <span className="sep" />
          {cams.map((c) => (
            <button key={c.id} className={'chip' + (c.id === scene.activeCam ? ' warm' : '')} onClick={() => commitScene({ ...scene, activeCam: c.id }, 'Switch camera')}>Cam {c.label} · {c.focal}mm</button>
          ))}
          <button className="icon-btn" title="Add a camera" aria-label="Add a camera" onClick={() => {
            const label = String.fromCharCode(65 + cams.length)
            const a = scene.actors[0], b = scene.actors[1] || a
            const aim = a ? [(a.x + b.x) / 2, 1.0, (a.z + b.z) / 2] : [0, 1, 0]
            const c = { id: newId('cam'), label, x: aim[0] + 0.3, y: 1.3, z: Math.min(scene.room.d / 2 - 0.4, aim[2] + 2.6), aim, focal: 35, shot: 'New angle' }
            commitScene({ ...scene, cameras: [...cams, c], activeCam: c.id }, 'Add camera')
            select({ kind: 'cameras', id: c.id })
          }}><Icon name="plus" size={15} /></button>
          <span className="sep" />
          <button className={'icon-btn' + (ui.cones ? ' on' : '')} title="Light beams" aria-label="Show light beams" aria-pressed={ui.cones} onClick={() => setUI({ cones: !ui.cones })}><Icon name="cone" size={15} /></button>
          <button className={'icon-btn' + (ui.frameGuides ? ' on' : '')} title="Frame guides" aria-label="Show frame guides" aria-pressed={ui.frameGuides} onClick={() => setUI({ frameGuides: !ui.frameGuides })}><Icon name="grid" size={15} /></button>
          <button className={'chip' + (ui.falseColor ? ' warm' : '')} onClick={() => setUI({ falseColor: !ui.falseColor, view: ui.view === 'set' ? 'split' : ui.view })} aria-pressed={ui.falseColor}>False color</button>
          <span className="sep" />
          <select className="select mono" style={{ width: 82, height: 28, fontSize: 12 }} value={scene.tstop} onChange={(e) => commitScene({ ...scene, tstop: +e.target.value }, 'T-stop')} aria-label="T-stop">
            {[1.4, 2, 2.8, 4, 5.6].map((t) => <option key={t} value={t}>T{t}</option>)}
          </select>
          <select className="select mono" style={{ width: 96, height: 28, fontSize: 12 }} value={scene.iso} onChange={(e) => commitScene({ ...scene, iso: +e.target.value }, 'ISO')} aria-label="ISO">
            {[400, 800, 1600, 3200].map((t) => <option key={t} value={t}>ISO {t}</option>)}
          </select>
          <span className="sep" />
          <button className="icon-btn" onClick={undo} title="Undo (⌘Z)" aria-label="Undo"><Icon name="undo" size={15} /></button>
          <button className="icon-btn" onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo"><Icon name="redo" size={15} /></button>
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => navigate('/plan')}><Icon name="print" size={14} /> Shot plan</button>
        </div>

        <div className="vp-wrap" ref={wrapRef} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }} onDrop={onDrop}>
          <Viewport
            scene={scene} pending={pending} selection={selection} mode="studio" view={ui.view} ui={{ cones: ui.cones }}
            onSelect={(h) => select(h)}
            onTransform={onTransform}
            onFrameRect={setRects}
            onReady={(e) => { engineRef.current = e }}
            camPos={[4.9, 3.9, 5.6]} target={[0, 0.7, -0.3]}
          />
          {rects?.set && <div className="view-label"><Icon name="cube" size={14} /> Set · drag to orbit, click to select{selection ? ', R to rotate' : ''}</div>}
          <FrameOverlays rects={rects} scene={shown} ui={ui} fcUrl={fcUrl} onFrameClick={onFrameClick} pin={pop} />
          {pop && (
            <div className="comment-pop" style={{ left: Math.max(8, Math.min(pop.x + 12, (rects?.frame?.x || 0) + (rects?.frame?.w || 600) - 312)), top: Math.min(pop.y + 12, (rects?.frame?.y || 0) + (rects?.frame?.h || 400) - 200) }}>
              <b style={{ fontSize: 13 }}>{pop.actor ? `On ${pop.actor.name}` : pop.objName ? `On the ${pop.objName.toLowerCase()}` : 'On this part of the frame'}</b>
              <form onSubmit={(e) => { e.preventDefault(); pop.text.trim() && sendPop(pop.text) }} style={{ display: 'grid', gap: 8 }}>
                <input className="input" autoFocus placeholder="What should change here?" value={pop.text} onChange={(e) => setPop({ ...pop, text: e.target.value })} />
                <div className="cmd-chips">
                  {(pop.actor ? ['Face is too dark', 'Warmer on her', 'Move closer to the door'] : ['Too dark here', 'Make it cooler', 'Clear the clutter']).map((c) => <button key={c} type="button" className="chip" onClick={() => sendPop(c)}>{c}</button>)}
                </div>
                <div className="row"><button className="btn primary sm" type="submit" disabled={!pop.text.trim()}>Send to AI</button><button className="btn ghost sm" type="button" onClick={() => setPop(null)}>Cancel</button></div>
              </form>
            </div>
          )}
        </div>
        <CommandBar />
      </main>

      <aside className="pane right" aria-label="Inspector and checks">
        <Inspector scene={shown} selection={selection} setup={setup} select={select} />
        <Checks checks={checks} select={select} />
        <References scene={scene} frames={frames} />
      </aside>
    </div>
  )
}
