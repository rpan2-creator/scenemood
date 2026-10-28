import { useMemo, useState } from 'react'
import Viewport from '../components/Viewport.jsx'
import PlanEditor from '../components/PlanEditor.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, setState, roomFromTemplate, starterObjects, navigate, newId } from '../store.js'
import { ROOM_TEMPLATES, wallFrame } from '../data/rooms.js'
import { GEAR_KITS, FIXTURES, getKit } from '../data/gear.js'
import { ASSETS, ASSET_CATS, getAsset } from '../data/assets.js'
import { runGeneration, startLearning, toast } from '../actions.js'
import { parseLocation, parseScript, reviewSetup, gearAdvice } from '../ai/copilot.js'

const WALLS = [['N', 'Back wall'], ['E', 'Right wall'], ['S', 'Front wall'], ['W', 'Left wall']]
const TONES = [['light', 'Light'], ['medium', 'Medium'], ['deep', 'Deep']]
const MOODS = ['tension', 'intimate', 'lonely', 'confrontation', 'quiet', 'nostalgic', 'motivated light', 'hard shadows', 'soft and warm', 'cold and blue']
const LOCATION_EXAMPLES = [
  ['Living room', 'Old apartment living room, about 5 x 4 m. Two windows on the left wall, door on the right. Sofa against the back wall, a coffee table, a floor lamp and a plant.'],
  ['卧室', '卧室，4×3.5米，层高2.5米。后墙一扇窗，门在前面。双人床、床头柜和台灯，右边有个衣柜。'],
  ['Trench at dusk', 'A trench at dusk, about 16 by 12 m: sandbags, barbed wire, a shell crater, a ruined brick wall and a barrel fire.'],
  ['夜晚街道', '夜晚的街道，路灯下停着一辆车，旁边有长椅和一棵树。'],
]
const SCRIPT_EXAMPLE = `INT. APARTMENT - NIGHT

Rain against the window. ANA sits on the arm of the couch, coat already on. THEO doesn't look at her.

THEO
You said you'd stay till Sunday.

ANA
I said I'd think about it.`
const r2 = (v) => Math.round(v * 100) / 100

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

function Section({ n, title, summary, open, onToggle, done, children }) {
  return (
    <section className={'acc' + (open ? ' open' : '')}>
      <button type="button" className="acc-h" onClick={onToggle} aria-expanded={open}>
        <span className={'acc-n' + (done ? ' done' : '')}>{done && !open ? <Icon name="check" size={13} /> : n}</span>
        <span className="acc-t"><b>{title}</b>{!open && <small>{summary}</small>}</span>
        <Icon name="chevron" size={14} className="acc-chev" />
      </button>
      {open && <div className="acc-b">{children}</div>}
    </section>
  )
}

function AINote({ children, title = 'AI', busy }) {
  return (
    <div className="ai-note">
      <div className="ai-note-h"><span className="ai-mark">✦</span>{title}{busy && <span className="spinner sm" />}</div>
      {children}
    </div>
  )
}

function Palette({ onPick }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('Seating')
  const list = ASSETS.filter((a) => !a.onTable && (q ? (a.name + a.cat).toLowerCase().includes(q.toLowerCase()) : a.cat === cat))
  return (
    <div className="palette-box">
      <div className="row" style={{ gap: 6 }}>
        <input className="input" placeholder="Search furniture" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search furniture" />
      </div>
      {!q && <div className="pal-cats">{ASSET_CATS.filter((c) => ASSETS.some((a) => a.cat === c && !a.onTable)).map((c) => <button key={c} type="button" className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>}
      <div className="pal-grid">
        {list.map((a) => (
          <button key={a.id} type="button" className="pal-item" draggable onDragStart={(e) => { e.dataTransfer.setData('text/asset', a.id); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => onPick(a.id)} title={`${a.name}: drag onto the plan, or click to add`}>
            <img src={`thumbs/${a.id}.png`} alt="" loading="lazy" />
            <span>{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Setup() {
  const { setup, library } = useStore((s) => ({ setup: s.setup, library: s.library }))
  const [open, setOpen] = useState(0)
  const [sel, setSel] = useState(null)
  const [view, setView] = useState('plan')
  const [locText, setLocText] = useState('')
  const [locBusy, setLocBusy] = useState(false)
  const [locResult, setLocResult] = useState(null)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [scriptText, setScriptText] = useState('')
  const [scriptBusy, setScriptBusy] = useState(false)
  const [scriptResult, setScriptResult] = useState(null)
  const { room, brief, kit } = setup
  const objects = setup.objects || []
  const update = (patch) => setState((s) => ({ setup: { ...s.setup, ...patch } }))
  const updRoom = (patch) => update({ room: { ...room, ...patch } })
  const updBrief = (patch) => update({ brief: { ...brief, ...patch } })

  const previewScene = useMemo(() => ({ room, objects, actors: [], lights: [], cameras: [], time: brief.time, aspect: brief.aspect, iso: 800, tstop: 2.8 }), [room, objects, brief.time, brief.aspect])
  const pickTemplate = (id) => { update({ templateId: id, room: roomFromTemplate(id), objects: starterObjects(id) }); setSel(null); setLocResult(null) }
  const addOp = (type) => {
    const wall = type === 'window' ? (room.openings.some((o) => o.wall === 'N') ? 'W' : 'N') : 'S'
    const op = type === 'window' ? { id: newId('win'), type, wall, at: 0, width: 1.1, height: 1.4, sill: 0.85 } : { id: newId('door'), type, wall, at: r2(wallFrame(room, wall).len / 2 - 0.8), width: 0.9, height: 2.05, sill: 0 }
    updRoom({ openings: [...room.openings, op] })
    setSel({ kind: 'opening', id: op.id })
  }
  const setOp = (id, patch) => updRoom({ openings: room.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
  const addFurniture = (asset, x, z) => {
    const a = getAsset(asset)
    const o = { id: newId('obj'), asset, x: x ?? 0, z: z ?? 0.3, y: a?.onTable ? 0.45 : 0, rot: 0, layer: 'dressing', source: 'location' }
    update({ objects: [...objects, o] })
    setSel({ kind: 'objects', id: o.id })
    toast(`Added ${a?.name}. Drag it into place.`)
  }
  const moveObject = (kind, id, c) => { if (kind === 'objects') update({ objects: objects.map((o) => (o.id === id ? { ...o, ...c } : o)) }) }
  const deleteObject = (kind, id) => { if (kind === 'objects') { update({ objects: objects.filter((o) => o.id !== id) }); setSel(null) } }
  const selObj = sel?.kind === 'objects' && objects.find((o) => o.id === sel.id)
  const selOp = sel?.kind === 'opening' && room.openings.find((o) => o.id === sel.id)
  const totalLights = Object.entries(kit).filter(([k]) => !FIXTURES[k]?.passive).reduce((a, [, v]) => a + v, 0)
  const saveRoom = () => { setState((s) => ({ library: { ...s.library, rooms: [...s.library.rooms, { id: newId('room'), name: `${room.name} ${room.w}×${room.d}`, room, objects, at: Date.now() }] } })); toast('Room saved to the team library') }
  const saveKit = () => { setState((s) => ({ library: { ...s.library, kits: [...s.library.kits, { id: newId('kit'), name: `Kit · ${Object.entries(kit).filter(([, n]) => n).map(([k, n]) => `${n} ${FIXTURES[k].name.split(' ').slice(-1)[0].toLowerCase()}`).join(', ')}`, kit, at: Date.now() }] } })); toast('Gear kit saved to the team library') }
  const review = useMemo(() => reviewSetup(setup), [setup])
  const advice = useMemo(() => gearAdvice(kit, brief), [kit, brief])
  const done = [room.openings.length > 0 && objects.length > 0, totalLights > 0, brief.text.trim().length > 10]

  const buildRoom = async () => {
    if (!locText.trim()) return
    const before = { room, objects, templateId: setup.templateId }
    setLocBusy(true)
    const res = await parseLocation(locText)
    setLocBusy(false)
    update({ room: res.room, objects: res.objects, templateId: res.room.template, ...(res.time ? { brief: { ...brief, time: res.time } } : {}) })
    setLocResult({ ...res, before })
    setSel(null)
    setView('plan')
  }
  const undoRoom = () => { if (locResult?.before) update(locResult.before); setLocResult(null) }
  const readScript = async () => {
    if (!scriptText.trim()) return
    setScriptBusy(true)
    const res = await parseScript(scriptText)
    setScriptBusy(false)
    const ids = ['actor_a', 'actor_b', 'actor_c']
    const names = { ...brief.names }
    res.names.forEach((n, i) => { names[ids[i]] = n })
    updBrief({ text: res.brief || brief.text, time: res.time || brief.time, names, refs: res.refs.length ? res.refs : brief.refs, actors: Math.max(2, Math.min(3, res.names.length || brief.actors)) })
    setScriptResult(res)
  }
  const reviewAction = (a) => {
    if (a.type === 'add') {
      const anchor = objects.find((o) => ['sofa', 'bed', 'desk', 'dining_table'].includes(o.asset))
      addFurniture(a.asset, anchor ? r2(Math.min(room.w / 2 - 0.4, anchor.x + 1.4)) : 0, anchor ? anchor.z : 0)
    }
  }
  const go = () => { runGeneration(); navigate('/directions') }
  const roomSummary = `${room.name} · ${room.w} × ${room.d} m · ${room.openings.filter((o) => o.type === 'window').length} windows · ${objects.length} pieces`
  const gearSummary = Object.entries(kit).filter(([, n]) => n).map(([k, n]) => `${n} ${FIXTURES[k].name.toLowerCase()}`).join(', ') || 'No gear yet'
  const sceneSummary = `${{ night: 'Night', dusk: 'Dusk', day: 'Day' }[brief.time] || 'Day'}, ${brief.actors} actors, ${brief.aspect}:1`

  return (
    <div className="setup2">
      <aside className="setup-side" aria-label="Scene set up">
        <div className="side-scroll">
          <div className="side-intro">
            <div className="kicker"><span className="stepno">1</span> Set up · tell SceneMood about the location, your gear and the scene</div>
          </div>

          <AINote title="Describe the location" busy={locBusy}>
            <textarea className="textarea" rows={3} value={locText} onChange={(e) => setLocText(e.target.value)} placeholder="“Old apartment living room, 5 x 4 m, two windows on the left, sofa against the back wall, a floor lamp…”" aria-label="Describe the location" />
            <div className="row wrap" style={{ gap: 6 }}>
              <button type="button" className="btn ai sm" onClick={buildRoom} disabled={locBusy || !locText.trim()}><span className="ai-mark">✦</span> {locBusy ? 'Drawing the plan…' : 'Draw the room for me'}</button>
              {!locText && LOCATION_EXAMPLES.map(([label, ex]) => <button key={label} type="button" className="chip" onClick={() => setLocText(ex)}>{label}</button>)}
            </div>
            {locResult && (
              <div className="ai-result">
                <b>Here’s what I understood</b>
                <ul>{locResult.understood.map((u) => <li key={u}><Icon name="check" size={12} /> {u}</li>)}</ul>
                {locResult.assumed.length > 0 && <><b>And what I assumed</b><ul className="assumed">{locResult.assumed.map((u) => <li key={u}>? {u}</li>)}</ul></>}
                <div className="row"><span className="dim" style={{ fontSize: 12 }}>Fix anything by dragging on the plan.</span><button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={undoRoom}>Undo</button></div>
              </div>
            )}
          </AINote>

          <Section n={1} title="The room" summary={roomSummary} open={open === 0} onToggle={() => setOpen(open === 0 ? -1 : 0)} done={done[0]}>
            <div className="tpl-row">
              {ROOM_TEMPLATES.map((t) => <button key={t.id} type="button" className={'tpl' + (setup.templateId === t.id ? ' on' : '')} onClick={() => pickTemplate(t.id)} aria-pressed={setup.templateId === t.id} title={t.note}>{t.name}</button>)}
            </div>
            {library.rooms.length > 0 && (
              <select className="select" value="" onChange={(e) => { const r = library.rooms.find((x) => x.id === e.target.value); if (r) update({ room: structuredClone(r.room), objects: structuredClone(r.objects) }) }} aria-label="Load a saved room">
                <option value="">Load a room your team measured…</option>
                {library.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <div className="dims">
              {[['w', 'Width'], ['d', 'Depth'], ['h', 'Ceiling']].map(([k, l]) => (
                <label key={k} className="field"><span>{l}</span><div className="unit-input"><input className="input mono" type="number" step="0.1" min={k === 'h' ? 2.2 : 2} max={12} value={room[k]} onChange={(e) => updRoom({ [k]: Math.max(k === 'h' ? 2.2 : 2, Math.min(12, +e.target.value || room[k])) })} /><i>m</i></div></label>
              ))}
            </div>
            <p className="hint">Or drag the round handles on the plan’s walls.</p>
            <div className="row wrap" style={{ gap: 6 }}>
              <button type="button" className="btn sm" onClick={() => addOp('window')}><Icon name="plus" size={13} /> Window</button>
              <button type="button" className="btn sm" onClick={() => addOp('door')}><Icon name="plus" size={13} /> Door</button>
              <button type="button" className="btn sm" onClick={() => updRoom({ outlets: [...room.outlets, { wall: ['N', 'E', 'S', 'W'][room.outlets.length % 4], at: 0 }] })}><Icon name="plus" size={13} /> Outlet</button>
            </div>

            {selOp && (
              <div className="insp-card">
                <div className="row between"><b>{selOp.type === 'window' ? 'Window' : 'Door'}</b><button type="button" className="icon-btn" aria-label="Remove" onClick={() => { updRoom({ openings: room.openings.filter((o) => o.id !== selOp.id) }); setSel(null) }}><Icon name="trash" size={14} /></button></div>
                <Seg label="Type" value={selOp.type} onChange={(v) => setOp(selOp.id, v === 'door' ? { type: 'door', sill: 0, height: 2.05, width: 0.9 } : { type: 'window', sill: 0.85, height: 1.4, width: 1.1 })} options={[['window', 'Window'], ['door', 'Door']]} />
                <div className="grid2">
                  <label className="field"><span>Wall</span><select className="select" value={selOp.wall} onChange={(e) => setOp(selOp.id, { wall: e.target.value, at: 0 })}>{WALLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="field"><span>Width</span><div className="unit-input"><input className="input mono" type="number" step="0.1" min="0.5" max="3" value={selOp.width} onChange={(e) => setOp(selOp.id, { width: Math.max(0.5, Math.min(3, +e.target.value || selOp.width)) })} /><i>m</i></div></label>
                </div>
                <p className="hint">Drag it along any wall on the plan.</p>
              </div>
            )}
            {selObj && (
              <div className="insp-card">
                <div className="row between"><b>{getAsset(selObj.asset)?.name}</b><button type="button" className="icon-btn" aria-label="Remove" onClick={() => deleteObject('objects', selObj.id)}><Icon name="trash" size={14} /></button></div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn sm" onClick={() => moveObject('objects', selObj.id, { rot: r2((selObj.rot || 0) + Math.PI / 12) })}><Icon name="rotate" size={13} /> Rotate 15°</button>
                  <button type="button" className="btn sm" onClick={() => moveObject('objects', selObj.id, { rot: r2((selObj.rot || 0) + Math.PI / 2) })}>90°</button>
                  <span className="mono dim" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{selObj.x.toFixed(2)}, {selObj.z.toFixed(2)} m</span>
                </div>
                <p className="hint">Drag to move, drag the dot to rotate. Keys: arrows nudge, R rotates, Delete removes.</p>
              </div>
            )}

            <div className="sub-h">What’s already there</div>
            <p className="hint" style={{ marginTop: -4 }}>Drag pieces onto the plan. The AI keeps them and dresses around them.</p>
            <Palette onPick={(id) => addFurniture(id)} />
            <button type="button" className="btn ghost sm" onClick={saveRoom} style={{ justifySelf: 'start' }}><Icon name="save" size={13} /> Save room to team library</button>
            <button type="button" className="btn sm" onClick={() => setOpen(1)} style={{ justifySelf: 'end' }}>Next: your gear <Icon name="arrowR" size={13} /></button>
          </Section>

          <Section n={2} title="Your gear" summary={gearSummary} open={open === 1} onToggle={() => setOpen(open === 1 ? -1 : 1)} done={done[1]}>
            <div className="tpl-row">
              {GEAR_KITS.map((k) => <button key={k.id} type="button" className={'tpl' + (setup.kitId === k.id ? ' on' : '')} onClick={() => update({ kitId: k.id, kit: { ...getKit(k.id).items } })} title={k.note}>{k.name}</button>)}
            </div>
            {library.kits.length > 0 && (
              <select className="select" value="" onChange={(e) => { const k = library.kits.find((x) => x.id === e.target.value); if (k) update({ kitId: 'custom', kit: { ...k.kit } }) }} aria-label="Load a team kit">
                <option value="">Load a team kit…</option>
                {library.kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            )}
            <div className="stack" style={{ gap: 4 }}>
              {Object.values(FIXTURES).map((f) => (
                <div className="gear-row" key={f.id}>
                  <div>{f.name}<small>{f.spec}</small></div>
                  <Stepper value={kit[f.id] || 0} label={f.name} onChange={(v) => update({ kitId: 'custom', kit: { ...kit, [f.id]: v } })} />
                </div>
              ))}
            </div>
            <AINote title="Gear check">
              <ul className="ai-list">{advice.map((a) => <li key={a}>{a}</li>)}</ul>
            </AINote>
            <div className="row between">
              <button type="button" className="btn ghost sm" onClick={saveKit}><Icon name="save" size={13} /> Save kit</button>
              <button type="button" className="btn sm" onClick={() => setOpen(2)}>Next: the scene <Icon name="arrowR" size={13} /></button>
            </div>
          </Section>

          <Section n={3} title="The scene" summary={sceneSummary} open={open === 2} onToggle={() => setOpen(open === 2 ? -1 : 2)} done={done[2]}>
            <label className="field"><span>What happens, and how should it feel?</span>
              <textarea className="textarea" value={brief.text} onChange={(e) => updBrief({ text: e.target.value })} placeholder="Night. Two people argue on the couch. She wants to leave but doesn't." />
            </label>
            {!scriptOpen
              ? <button type="button" className="btn ai sm" style={{ justifySelf: 'start' }} onClick={() => { setScriptOpen(true); if (!scriptText) setScriptText('') }}><span className="ai-mark">✦</span> Paste a script page instead</button>
              : (
                <AINote title="Read my script" busy={scriptBusy}>
                  <textarea className="textarea mono" rows={6} value={scriptText} onChange={(e) => setScriptText(e.target.value)} placeholder={SCRIPT_EXAMPLE} aria-label="Script page" style={{ fontSize: 12 }} />
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn ai sm" onClick={readScript} disabled={scriptBusy || !scriptText.trim()}><span className="ai-mark">✦</span> {scriptBusy ? 'Reading…' : 'Fill in the brief'}</button>
                    {!scriptText && <button type="button" className="chip" onClick={() => setScriptText(SCRIPT_EXAMPLE)}>Use an example</button>}
                    <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setScriptOpen(false)}>Close</button>
                  </div>
                  {scriptResult && <div className="ai-result"><b>From the page</b><ul>{scriptResult.understood.map((u) => <li key={u}><Icon name="check" size={12} /> {u}</li>)}</ul></div>}
                </AINote>
              )}
            <div className="sub-h">Mood words</div>
            <div className="ref-chips">{MOODS.map((m) => { const on = (brief.refs || []).includes(m); return <button key={m} type="button" className={'chip' + (on ? ' warm' : '')} aria-pressed={on} onClick={() => updBrief({ refs: on ? brief.refs.filter((x) => x !== m) : [...(brief.refs || []), m] })}>{m}</button> })}</div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Seg label="Time of day" value={brief.time} onChange={(v) => updBrief({ time: v })} options={[['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']]} />
              <Seg label="Aspect ratio" value={brief.aspect} onChange={(v) => updBrief({ aspect: v })} options={[['2.39', '2.39'], ['1.85', '1.85'], ['16:9', '16:9']]} />
              <Seg label="Actors" value={brief.actors} onChange={(v) => updBrief({ actors: v })} options={[[2, '2 actors'], [3, '3 actors']]} />
            </div>
            <div className="sub-h">Cast</div>
            {['actor_a', 'actor_b', 'actor_c'].slice(0, brief.actors).map((id, i) => (
              <div key={id} className="row" style={{ gap: 8 }}>
                <span className="cast-dot">{'ABC'[i]}</span>
                <input className="input" style={{ width: 110 }} value={brief.names?.[id] || ''} onChange={(e) => updBrief({ names: { ...brief.names, [id]: e.target.value } })} aria-label="Character name" />
                <Seg label={`Skin tone for ${brief.names?.[id]}`} value={brief.tones?.[id] || 'medium'} onChange={(v) => updBrief({ tones: { ...brief.tones, [id]: v } })} options={TONES} />
              </div>
            ))}
            <p className="hint">Skin tone matters: exposure is checked per face so darker skin isn’t left underlit.</p>
            <label className="field"><span>Longest lighting setup you can afford: <b className="mono" style={{ color: 'var(--paper)' }}>{brief.maxSetup} min</b></span>
              <input type="range" min="15" max="90" step="5" value={brief.maxSetup} onChange={(e) => updBrief({ maxSetup: +e.target.value })} /></label>
          </Section>

          <AINote title="Before you generate">
            <ul className="ai-list checks">
              {review.map((n) => (
                <li key={n.text} className={n.level}>
                  <span>{n.text}</span>
                  {n.action && <button type="button" className="btn sm" onClick={() => reviewAction(n.action)}>{n.action.label}</button>}
                </li>
              ))}
            </ul>
          </AINote>
        </div>

        <div className="side-foot">
          <button className="btn primary lg grow" onClick={go}><span className="ai-mark dark">✦</span> Generate 4 directions</button>
          <button className="btn ghost" onClick={startLearning} title="Light it yourself first, then compare with the AI"><Icon name="learn" size={15} /> Learn</button>
        </div>
      </aside>

      <main className="setup-canvas">
        <div className="canvas-bar">
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')}>Plan</button>
            <button type="button" className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>3D</button>
          </div>
          <span className="canvas-hint">{view === 'plan' ? 'Drag walls, doors, windows, outlets and furniture. Drop pieces from the list on the left.' : 'Drag to orbit. Click a piece, then drag the arrows to move it.'}</span>
          <span className="mono dim" style={{ fontSize: 12, marginLeft: 'auto' }}>{room.w} × {room.d} × {room.h} m</span>
        </div>
        <div className={'canvas-main' + (view === 'plan' ? ' show-plan' : ' show-3d')}>
          <div className="plan-wrap">
            <PlanEditor
              room={room} objects={objects} editRoom editKinds={['objects']} selection={sel}
              onSelect={(s) => { setSel(s); if (s && open !== 0 && (s.kind === 'objects' || s.kind === 'opening' || s.kind === 'room')) setOpen(0) }}
              onRoom={(rr, objs) => update({ room: rr, objects: objs })}
              onMove={moveObject}
              onDelete={deleteObject}
              onDropAsset={(asset, x, z) => addFurniture(asset, x, z)}
            />
          </div>
          <div className="view3d-wrap" onClick={() => view === 'plan' && setView('3d')} title={view === 'plan' ? 'Open the 3D view' : undefined}>
            <Viewport scene={previewScene} mode="preview" view="set" ui={{ cones: false, grid: true, setLight: brief.time === 'day' ? 'work' : 'work' }} selection={sel?.kind === 'objects' ? sel : null} onSelect={(h) => setSel(h?.kind === 'objects' ? h : null)} onTransform={moveObject} camPos={[6.2, 6.4, 7.6]} target={[0, 0.3, -0.2]} />
            {view === 'plan' && <span className="inset-tag"><Icon name="cube" size={12} /> 3D preview · click to expand</span>}
          </div>
        </div>
      </main>
    </div>
  )
}

