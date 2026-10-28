import { useMemo, useState } from 'react'
import Viewport from '../components/Viewport.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, setState, roomFromTemplate, starterObjects, navigate, newId } from '../store.js'
import { ROOM_TEMPLATES, wallFrame } from '../data/rooms.js'
import { GEAR_KITS, FIXTURES, getKit } from '../data/gear.js'
import { ASSETS, getAsset } from '../data/assets.js'
import { runGeneration, startLearning, toast } from '../actions.js'

const WALLS = [['N', 'Back'], ['E', 'Right'], ['S', 'Front'], ['W', 'Left']]
const TONES = [['light', 'Light'], ['medium', 'Medium'], ['deep', 'Deep']]
const MOODS = ['tension', 'intimate', 'lonely', 'confrontation', 'quiet', 'nostalgic', 'motivated light', 'hard shadows', 'soft and warm', 'cold and blue']
const PRESET_BRIEFS = [
  'Night. Ana and Theo argue on the couch. She wants to leave but doesn’t. Tense, quiet, close.',
  'Morning after a party. They sit across the table, nobody talks. Lonely, cold.',
  'He finally confronts her about the money. Angry, standing, nobody backs down.',
]

function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  )
}

function Stepper({ value, onChange, min = 0, max = 6, label }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label}`}>−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label}`}>+</button>
    </div>
  )
}

export default function Setup() {
  const { setup, library } = useStore((s) => ({ setup: s.setup, library: s.library }))
  const [tab, setTab] = useState(0)
  const [sel, setSel] = useState(null)
  const { room, brief, kit } = setup
  const update = (patch) => setState((s) => ({ setup: { ...s.setup, ...patch } }))
  const updRoom = (patch) => update({ room: { ...room, ...patch } })
  const updBrief = (patch) => update({ brief: { ...brief, ...patch } })

  const previewScene = useMemo(() => ({ room, objects: setup.objects || [], actors: [], lights: [], cameras: [], time: brief.time, aspect: brief.aspect, iso: 800, tstop: 2.8 }), [room, setup.objects, brief.time, brief.aspect])
  const pickTemplate = (id) => update({ templateId: id, room: roomFromTemplate(id), objects: starterObjects(id) })
  const setOp = (i, patch) => updRoom({ openings: room.openings.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const addOp = (type) => updRoom({ openings: [...room.openings, type === 'window' ? { id: newId('win'), type, wall: 'N', at: 0, width: 1.1, height: 1.4, sill: 0.85 } : { id: newId('door'), type, wall: 'S', at: 0, width: 0.9, height: 2.05, sill: 0 }] })
  const addFurniture = (asset) => {
    if (!asset) return
    const o = { id: newId('obj'), asset, x: 0, z: 0.3, y: 0, rot: 0, layer: 'dressing', source: 'location' }
    update({ objects: [...(setup.objects || []), o] })
    setSel({ kind: 'objects', id: o.id })
  }
  const moveFurniture = (kind, id, c) => { if (kind === 'objects') update({ objects: setup.objects.map((o) => (o.id === id ? { ...o, x: c.x, z: c.z } : o)) }) }
  const selObj = sel && (setup.objects || []).find((o) => o.id === sel.id)
  const totalLights = Object.entries(kit).filter(([k]) => !FIXTURES[k]?.passive).reduce((a, [, v]) => a + v, 0)
  const saveRoom = () => { setState((s) => ({ library: { ...s.library, rooms: [...s.library.rooms, { id: newId('room'), name: `${room.name} ${room.w}×${room.d}`, room, objects: setup.objects, at: Date.now() }] } })); toast('Room saved to the team library') }
  const saveKit = () => { setState((s) => ({ library: { ...s.library, kits: [...s.library.kits, { id: newId('kit'), name: `Kit · ${Object.entries(kit).filter(([, n]) => n).map(([k, n]) => `${n} ${FIXTURES[k].name.split(' ').slice(-1)[0].toLowerCase()}`).join(', ')}`, kit, at: Date.now() }] } })); toast('Gear kit saved to the team library') }
  const done = [room.openings.length > 0, totalLights > 0, brief.text.trim().length > 10]

  const go = () => { runGeneration(); navigate('/directions') }

  return (
    <div className="setup">
      <div className="setup-form">
        <div className="setup-tabs" role="tablist">
          {['The room', 'Your gear', 'The scene'].map((t, i) => (
            <button key={t} role="tab" aria-selected={tab === i} className={(tab === i ? 'on ' : '') + (done[i] && tab !== i ? 'done' : '')} onClick={() => setTab(i)}>
              <span className="n">{i + 1}</span><b>{t}</b>
            </button>
          ))}
        </div>

        <div className="setup-body">
          {tab === 0 && <>
            <div className="setup-block">
              <h3>Start from a room like yours</h3>
              <div className="cards">
                {ROOM_TEMPLATES.map((t) => <button key={t.id} type="button" className={'pick' + (setup.templateId === t.id ? ' on' : '')} onClick={() => pickTemplate(t.id)} aria-pressed={setup.templateId === t.id}><b>{t.name}</b><span>{t.note}</span></button>)}
              </div>
              {library.rooms.length > 0 && (
                <label className="field"><span>Or load a room your team saved</span>
                  <select className="select" value="" onChange={(e) => { const r = library.rooms.find((x) => x.id === e.target.value); if (r) update({ room: structuredClone(r.room), objects: structuredClone(r.objects) }) }}>
                    <option value="">Choose a saved room…</option>
                    {library.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="setup-block">
              <h3>Measure it</h3>
              <div className="grid3">
                {[['w', 'Width'], ['d', 'Depth'], ['h', 'Ceiling']].map(([k, l]) => (
                  <label key={k} className="field"><span>{l} (m)</span><input className="input mono" type="number" step="0.1" min={k === 'h' ? 2.2 : 2} max={12} value={room[k]} onChange={(e) => updRoom({ [k]: Math.max(1.8, +e.target.value || room[k]) })} /></label>
                ))}
              </div>
            </div>
            <div className="setup-block">
              <h3>Doors, windows and power</h3>
              <div className="stack" style={{ gap: 6 }}>
                {room.openings.map((op, i) => {
                  const len = wallFrame(room, op.wall).len
                  const lim = Math.max(0, len / 2 - op.width / 2 - 0.1)
                  return (
                    <div className="op-row" key={op.id}>
                      <select className="select" value={op.type} onChange={(e) => setOp(i, e.target.value === 'door' ? { type: 'door', sill: 0, height: 2.05, width: 0.9 } : { type: 'window', sill: 0.85, height: 1.4, width: 1.1 })} aria-label="Opening type"><option value="window">Window</option><option value="door">Door</option></select>
                      <select className="select" value={op.wall} onChange={(e) => setOp(i, { wall: e.target.value, at: 0 })} aria-label="Wall">{WALLS.map(([v, l]) => <option key={v} value={v}>{l} wall</option>)}</select>
                      <input type="range" min={-lim} max={lim} step="0.05" value={Math.max(-lim, Math.min(lim, op.at))} onChange={(e) => setOp(i, { at: +e.target.value })} aria-label="Position along the wall" />
                      <button type="button" className="icon-btn" onClick={() => updRoom({ openings: room.openings.filter((_, j) => j !== i) })} aria-label="Remove opening"><Icon name="x" size={14} /></button>
                    </div>
                  )
                })}
              </div>
              <div className="row wrap">
                <button type="button" className="btn sm" onClick={() => addOp('window')}><Icon name="plus" size={14} /> Window</button>
                <button type="button" className="btn sm" onClick={() => addOp('door')}><Icon name="plus" size={14} /> Door</button>
                <button type="button" className="btn sm" onClick={() => updRoom({ outlets: [...room.outlets, { wall: ['N', 'E', 'S', 'W'][room.outlets.length % 4], at: 0 }] })}><Icon name="plus" size={14} /> Outlet</button>
                <span className="dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{room.outlets.length} outlets</span>
              </div>
            </div>
            <div className="setup-block">
              <h3>What is already in the room</h3>
              <p className="hint">Drag pieces in the 3D view to match the location. The AI keeps fixed pieces and dresses around them.</p>
              <div className="row wrap" style={{ gap: 6 }}>
                {(setup.objects || []).map((o) => (
                  <span key={o.id} className={'chip' + (sel?.id === o.id ? ' warm' : '')} onClick={() => setSel({ kind: 'objects', id: o.id })} style={{ cursor: 'pointer' }}>
                    {getAsset(o.asset)?.name}
                    <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} onClick={(e) => { e.stopPropagation(); update({ objects: setup.objects.filter((x) => x.id !== o.id) }) }} aria-label={`Remove ${getAsset(o.asset)?.name}`}><Icon name="x" size={11} /></button>
                  </span>
                ))}
              </div>
              <select className="select" value="" onChange={(e) => addFurniture(e.target.value)} aria-label="Add furniture that is already there">
                <option value="">Add a piece that is already there…</option>
                {ASSETS.filter((a) => !a.onTable).map((a) => <option key={a.id} value={a.id}>{a.cat} · {a.name}</option>)}
              </select>
              <button type="button" className="btn sm" onClick={saveRoom} style={{ justifySelf: 'start' }}><Icon name="save" size={14} /> Save room to team library</button>
            </div>
          </>}

          {tab === 1 && <>
            <div className="setup-block">
              <h3>Which kit are you bringing?</h3>
              <div className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {GEAR_KITS.map((k) => <button key={k.id} type="button" className={'pick' + (setup.kitId === k.id ? ' on' : '')} onClick={() => update({ kitId: k.id, kit: { ...getKit(k.id).items } })} aria-pressed={setup.kitId === k.id}><b>{k.name}</b><span>{k.note}</span></button>)}
              </div>
              {library.kits.length > 0 && (
                <select className="select" value="" onChange={(e) => { const k = library.kits.find((x) => x.id === e.target.value); if (k) update({ kitId: 'custom', kit: { ...k.kit } }) }}>
                  <option value="">Load a team kit…</option>
                  {library.kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              )}
            </div>
            <div className="setup-block">
              <h3>Adjust to what you actually have</h3>
              <div className="stack" style={{ gap: 6 }}>
                {Object.values(FIXTURES).map((f) => (
                  <div className="gear-row" key={f.id}>
                    <div>{f.name}<small>{f.spec} · {f.passive ? 'passive' : `${f.cd.toLocaleString()} cd peak`}</small></div>
                    <Stepper value={kit[f.id] || 0} label={f.name} onChange={(v) => update({ kitId: 'custom', kit: { ...kit, [f.id]: v } })} />
                  </div>
                ))}
              </div>
              <p className="hint">{totalLights} powered unit{totalLights === 1 ? '' : 's'}. Every direction is checked against this list; nothing needs gear you don&apos;t have.</p>
              <button type="button" className="btn sm" onClick={saveKit} style={{ justifySelf: 'start' }}><Icon name="save" size={14} /> Save kit to team library</button>
            </div>
          </>}

          {tab === 2 && <>
            <div className="setup-block">
              <h3>What happens, and how should it feel?</h3>
              <textarea className="textarea" value={brief.text} onChange={(e) => updBrief({ text: e.target.value })} placeholder="Night. Two people argue on the couch. She wants to leave but doesn't." />
              <div className="ref-chips">{PRESET_BRIEFS.map((b) => <button key={b} type="button" className="chip" onClick={() => updBrief({ text: b })} title={b}>{b.split('.')[0]}…</button>)}</div>
            </div>
            <div className="setup-block">
              <h3>Mood words</h3>
              <div className="ref-chips">{MOODS.map((m) => { const on = (brief.refs || []).includes(m); return <button key={m} type="button" className={'chip' + (on ? ' warm' : '')} aria-pressed={on} onClick={() => updBrief({ refs: on ? brief.refs.filter((x) => x !== m) : [...(brief.refs || []), m] })}>{m}</button> })}</div>
            </div>
            <div className="setup-block">
              <h3>Shoot details</h3>
              <div className="row wrap" style={{ gap: 12 }}>
                <Seg label="Time of day" value={brief.time} onChange={(v) => updBrief({ time: v })} options={[['night', 'Night'], ['day', 'Day']]} />
                <Seg label="Aspect ratio" value={brief.aspect} onChange={(v) => updBrief({ aspect: v })} options={[['2.39', '2.39:1'], ['1.85', '1.85:1'], ['16:9', '16:9']]} />
                <Seg label="Actors" value={brief.actors} onChange={(v) => updBrief({ actors: v })} options={[[2, '2 actors'], [3, '3 actors']]} />
              </div>
            </div>
            <div className="setup-block">
              <h3>Cast</h3>
              <p className="hint">Exposure is checked per face, so set each actor&apos;s skin tone. Darker skin isn&apos;t left underlit.</p>
              {['actor_a', 'actor_b', 'actor_c'].slice(0, brief.actors).map((id) => (
                <div key={id} className="row" style={{ gap: 8 }}>
                  <input className="input" style={{ width: 120 }} value={brief.names?.[id] || ''} onChange={(e) => updBrief({ names: { ...brief.names, [id]: e.target.value } })} aria-label="Character name" />
                  <Seg label={`Skin tone for ${brief.names?.[id]}`} value={brief.tones?.[id] || 'medium'} onChange={(v) => updBrief({ tones: { ...brief.tones, [id]: v } })} options={TONES} />
                </div>
              ))}
            </div>
            <div className="setup-block">
              <label className="field"><span>Longest acceptable lighting setup: <b className="mono" style={{ color: 'var(--paper)' }}>{brief.maxSetup} min</b></span>
                <input type="range" min="15" max="90" step="5" value={brief.maxSetup} onChange={(e) => updBrief({ maxSetup: +e.target.value })} /></label>
            </div>
          </>}
        </div>

        <div className="setup-foot">
          {tab < 2 ? <button className="btn primary" onClick={() => setTab(tab + 1)}>Next: {tab === 0 ? 'your gear' : 'the scene'} <Icon name="arrowR" size={15} /></button>
            : <button className="btn primary lg" onClick={go}><Icon name="sparkle" size={16} /> Generate 4 directions</button>}
          {tab === 2 && <button className="btn ghost" onClick={startLearning} title="Light it yourself first, then compare with the AI"><Icon name="learn" size={15} /> Learning mode</button>}
          <span className="dim" style={{ fontSize: 12, marginLeft: 'auto' }}>≈ 60 s, simulated</span>
        </div>
      </div>

      <div className="setup-view">
        <Viewport scene={previewScene} mode="preview" view="set" ui={{ cones: false, grid: true }} selection={sel} onSelect={(h) => setSel(h?.kind === 'objects' ? h : null)} onTransform={moveFurniture} camPos={[6.2, 6.4, 7.6]} target={[0, 0.3, -0.2]} />
        <div className="float float-tl" style={{ padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
          <b>{room.name}</b><span className="mono muted">{room.w.toFixed(1)} × {room.d.toFixed(1)} × {room.h.toFixed(1)} m</span>
          <span className="chip cool"><span className="dot" style={{ background: 'var(--daylight)' }} />{room.openings.filter((o) => o.type === 'window').length} windows</span>
          <span className="chip">{room.openings.filter((o) => o.type === 'door').length} door</span>
        </div>
        <div className="float float-bl" style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--muted)' }}>
          {selObj ? <>Dragging <b style={{ color: 'var(--paper)' }}>{getAsset(selObj.asset)?.name}</b> · use the arrows to move it</> : 'Drag to orbit · click furniture to move it'}
        </div>
      </div>
    </div>
  )
}
