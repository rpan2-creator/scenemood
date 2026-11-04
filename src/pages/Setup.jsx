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
  const sceneSummary = `${brief.aspect}:1 · ${(brief.refs || []).slice(0, 2).join(', ') || 'no mood words'} · up to ${brief.maxSetup} min to light`

  const ext = room.kind === 'exterior'
  const temps = ROOM_TEMPLATES.filter((t) => (t.kind === 'exterior') === ext)
  const setKind = (k) => { if ((k === 'ext') !== ext) pickTemplate(ROOM_TEMPLATES.find((t) => (t.kind === 'exterior') === (k === 'ext')).id) }
  const prefs = brief.blocking || {}
  const castIds = ['actor_a', 'actor_b', 'actor_c'].slice(0, brief.actors)
  const castSummary = castIds.map((id) => `${brief.names?.[id] || id} (${{ stand: 'standing', sit: 'sitting' }[prefs[id]] || 'AI blocks'})`).join(', ')
  const propSummary = objects.length ? `${objects.length} pieces: ${[...new Set(objects.map((o) => getAsset(o.asset)?.name).filter(Boolean))].slice(0, 3).join(', ')}${objects.length > 3 ? '…' : ''}` : 'Nothing placed yet'
  const locSummary = `${ext ? 'EXT' : 'INT'}. ${room.name.toUpperCase()} · ${{ night: 'NIGHT', dusk: 'DUSK', day: 'DAY' }[brief.time] || 'DAY'} · ${room.w} × ${room.d} m`

  return (
    <div className="setup2">
      <aside className="setup-side" aria-label="Scene set up">
        <div className="side-scroll">
          <div className="side-intro">
            <div className="kicker"><span className="stepno">1</span> Breakdown · tell SceneMood what is in the scene, once</div>
            <h1 className="setup-title">Scene breakdown</h1>
            <p className="slug mono">{locSummary}</p>
          </div>

          <div className="brief-card">
            <label className="field"><span>What happens in the scene?</span><textarea className="textarea" rows={3} value={brief.text} onChange={(e) => updBrief({ text: e.target.value })} placeholder="Two people argue in a small apartment at night. Tense, quiet, close." /></label>
            {!scriptOpen
              ? <button type="button" className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setScriptOpen(true)}><span className="ai-mark">✦</span> Paste a script page and let AI fill in the breakdown</button>
              : (
                <AINote title="Read my script" busy={scriptBusy}>
                  <textarea className="textarea mono" rows={6} value={scriptText} onChange={(e) => setScriptText(e.target.value)} placeholder={SCRIPT_EXAMPLE} aria-label="Script page" style={{ fontSize: 12.5 }} />
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn ai sm" onClick={readScript} disabled={scriptBusy || !scriptText.trim()}><span className="ai-mark">✦</span> {scriptBusy ? 'Reading…' : 'Fill in the breakdown'}</button>
                    {!scriptText && <button type="button" className="chip" onClick={() => setScriptText(SCRIPT_EXAMPLE)}>Use an example</button>}
                    <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setScriptOpen(false)}>Close</button>
                  </div>
                  {scriptResult && <div className="ai-result"><b>From the page</b><ul>{scriptResult.understood.map((u) => <li key={u}><Icon name="check" size={12} /> {u}</li>)}</ul></div>}
                </AINote>
              )}
          </div>

          <Section n={1} title="Location" summary={locSummary} open={open === 0} onToggle={() => setOpen(open === 0 ? -1 : 0)} done={done[0]}>
            <div className="row wrap" style={{ gap: 8 }}>
              <Seg label="Interior or exterior" value={ext ? 'ext' : 'int'} onChange={setKind} options={[['int', 'Interior'], ['ext', 'Exterior']]} />
              <Seg label="Time of day" value={brief.time} onChange={(v) => updBrief({ time: v })} options={[['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']]} />
            </div>
            <div className="tpl-row">
              {temps.map((t) => <button key={t.id} type="button" className={'tpl' + (setup.templateId === t.id ? ' on' : '')} onClick={() => pickTemplate(t.id)} aria-pressed={setup.templateId === t.id} title={t.note}>{t.name}</button>)}
            </div>
            <div className="sub-h">{ext ? 'Size of the playing area' : 'Room size'}</div>
            <div className="dims">
              {(ext ? [['w', 'Width'], ['d', 'Depth']] : [['w', 'Width'], ['d', 'Depth'], ['h', 'Ceiling']]).map(([k, l]) => (
                <label key={k} className="field"><span>{l}</span><div className="unit-input"><input className="input mono" type="number" step="0.1" min={k === 'h' ? 2.2 : 2} max={ext ? 40 : 12} value={room[k]} onChange={(e) => updRoom({ [k]: Math.max(k === 'h' ? 2.2 : 2, Math.min(ext ? 40 : 12, +e.target.value || room[k])) })} /><i>m</i></div></label>
              ))}
            </div>
            {!ext && (
              <div className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="btn sm" onClick={() => addOp('window')}><Icon name="plus" size={13} /> Window</button>
                <button type="button" className="btn sm" onClick={() => addOp('door')}><Icon name="plus" size={13} /> Door</button>
                <button type="button" className="btn sm" onClick={() => updRoom({ outlets: [...room.outlets, { wall: ['N', 'E', 'S', 'W'][room.outlets.length % 4], at: 0 }] })}><Icon name="plus" size={13} /> Power outlet</button>
              </div>
            )}
            <p className="hint">Drag walls, doors and windows on the plan to match the real place.</p>
            {selOp && (
              <div className="insp-card">
                <div className="row between"><b>{selOp.type === 'window' ? 'Window' : 'Door'}</b><button type="button" className="icon-btn" aria-label="Remove" onClick={() => { updRoom({ openings: room.openings.filter((o) => o.id !== selOp.id) }); setSel(null) }}><Icon name="trash" size={14} /></button></div>
                <div className="grid2">
                  <label className="field"><span>Wall</span><select className="select" value={selOp.wall} onChange={(e) => setOp(selOp.id, { wall: e.target.value, at: 0 })}>{WALLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="field"><span>Width</span><div className="unit-input"><input className="input mono" type="number" step="0.1" min="0.5" max="3" value={selOp.width} onChange={(e) => setOp(selOp.id, { width: Math.max(0.5, Math.min(3, +e.target.value || selOp.width)) })} /><i>m</i></div></label>
                </div>
              </div>
            )}
            <AINote title="Or describe the place" busy={locBusy}>
              <textarea className="textarea" rows={2} value={locText} onChange={(e) => setLocText(e.target.value)} placeholder="“Old apartment living room, 5 x 4 m, two windows on the left, sofa against the back wall…”" aria-label="Describe the location" />
              <div className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="btn ai sm" onClick={buildRoom} disabled={locBusy || !locText.trim()}><span className="ai-mark">✦</span> {locBusy ? 'Drawing the plan…' : 'Draw it for me'}</button>
                {!locText && LOCATION_EXAMPLES.map(([label, ex]) => <button key={label} type="button" className="chip" onClick={() => setLocText(ex)}>{label}</button>)}
              </div>
              {locResult && (
                <div className="ai-result">
                  <b>Here’s what I understood</b>
                  <ul>{locResult.understood.map((u) => <li key={u}><Icon name="check" size={12} /> {u}</li>)}</ul>
                  {locResult.assumed.length > 0 && <><b>And what I assumed</b><ul className="assumed">{locResult.assumed.map((u) => <li key={u}>? {u}</li>)}</ul></>}
                  <div className="row"><span className="dim" style={{ fontSize: 12 }}>Fix anything on the plan.</span><button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={undoRoom}>Undo</button></div>
                </div>
              )}
            </AINote>
            {library.rooms.length > 0 && (
              <select className="select" value="" onChange={(e) => { const r = library.rooms.find((x) => x.id === e.target.value); if (r) update({ room: structuredClone(r.room), objects: structuredClone(r.objects) }) }} aria-label="Load a saved room">
                <option value="">Load a location your team measured…</option>
                {library.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <button type="button" className="btn sm" onClick={() => setOpen(1)} style={{ justifySelf: 'end' }}>Next: cast <Icon name="arrowR" size={13} /></button>
          </Section>

          <Section n={2} title="Cast and blocking" summary={castSummary} open={open === 1} onToggle={() => setOpen(open === 1 ? -1 : 1)} done>
            <Seg label="Actors" value={brief.actors} onChange={(v) => updBrief({ actors: v })} options={[[2, '2 actors'], [3, '3 actors']]} />
            <div className="cast-list">
              {castIds.map((id, i) => (
                <div key={id} className="cast-row">
                  <span className="cast-dot">{'ABC'[i]}</span>
                  <input className="input" value={brief.names?.[id] || ''} onChange={(e) => updBrief({ names: { ...brief.names, [id]: e.target.value } })} aria-label={`Name of actor ${'ABC'[i]}`} />
                  <Seg label={`Blocking for ${brief.names?.[id]}`} value={prefs[id] || 'auto'} onChange={(v) => updBrief({ blocking: { ...prefs, [id]: v } })} options={[['auto', 'AI decides'], ['stand', 'Standing'], ['sit', 'Sitting']]} />
                  <label className="tone"><span>Skin tone</span><select className="select" value={brief.tones?.[id] || 'medium'} onChange={(e) => updBrief({ tones: { ...brief.tones, [id]: e.target.value } })}>{TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="wardrobe"><span>Wardrobe</span><input className="input" value={brief.wardrobe?.[id] || ''} placeholder="e.g. grey knit, dark jeans" onChange={(e) => updBrief({ wardrobe: { ...brief.wardrobe, [id]: e.target.value } })} /></label>
                </div>
              ))}
            </div>
            <p className="hint">The 3D actors are fictional stand-ins, not your cast: no photo of anyone is uploaded. Skin tone sets how the stand-in reflects light, so darker skin is never left underlit. Wardrobe goes onto the scene sheet for the costume department.</p>
            <button type="button" className="btn sm" onClick={() => setOpen(2)} style={{ justifySelf: 'end' }}>Next: props <Icon name="arrowR" size={13} /></button>
          </Section>

          <Section n={3} title="Props and set dressing" summary={propSummary} open={open === 2} onToggle={() => setOpen(open === 2 ? -1 : 2)} done={objects.length > 0}>
            <p className="hint" style={{ marginTop: 0 }}>What is already at the location, and where it stands. Drag pieces onto the plan, then drag them into place. The AI keeps them and dresses around them.</p>
            {objects.length > 0 && (
              <ul className="prop-list">
                {objects.map((o) => (
                  <li key={o.id} className={sel?.id === o.id ? 'on' : ''}>
                    <button type="button" onClick={() => setSel({ kind: 'objects', id: o.id })}>{getAsset(o.asset)?.name}</button>
                    <button type="button" className="icon-btn" aria-label={`Remove ${getAsset(o.asset)?.name}`} onClick={() => deleteObject('objects', o.id)}><Icon name="x" size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
            {selObj && (
              <div className="insp-card">
                <div className="row between"><b>{getAsset(selObj.asset)?.name}</b><span className="mono dim" style={{ fontSize: 12 }}>{selObj.x.toFixed(2)}, {selObj.z.toFixed(2)} m</span></div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn sm" onClick={() => moveObject('objects', selObj.id, { rot: r2((selObj.rot || 0) + Math.PI / 12) })}><Icon name="rotate" size={13} /> Rotate 15°</button>
                  <button type="button" className="btn sm" onClick={() => moveObject('objects', selObj.id, { rot: r2((selObj.rot || 0) + Math.PI / 2) })}>90°</button>
                  <button type="button" className="btn sm" onClick={() => deleteObject('objects', selObj.id)}><Icon name="trash" size={13} /> Remove</button>
                </div>
              </div>
            )}
            <Palette onPick={(id) => addFurniture(id)} />
            <div className="row between">
              <button type="button" className="btn ghost sm" onClick={saveRoom}><Icon name="save" size={13} /> Save location to team library</button>
              <button type="button" className="btn sm" onClick={() => setOpen(3)}>Next: lights <Icon name="arrowR" size={13} /></button>
            </div>
          </Section>

          <Section n={4} title="Lights you own" summary={gearSummary} open={open === 3} onToggle={() => setOpen(open === 3 ? -1 : 3)} done={done[1]}>
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
              <button type="button" className="btn sm" onClick={() => setOpen(4)}>Next: format <Icon name="arrowR" size={13} /></button>
            </div>
          </Section>

          <Section n={5} title="Look and schedule" summary={sceneSummary} open={open === 4} onToggle={() => setOpen(open === 4 ? -1 : 4)} done>
            <div className="sub-h">Frame</div>
            <Seg label="Aspect ratio" value={brief.aspect} onChange={(v) => updBrief({ aspect: v })} options={[['2.39', '2.39:1'], ['1.85', '1.85:1'], ['16:9', '16:9']]} />
            <div className="sub-h">Mood words</div>
            <div className="ref-chips">{MOODS.map((m) => { const on = (brief.refs || []).includes(m); return <button key={m} type="button" className={'chip' + (on ? ' warm' : '')} aria-pressed={on} onClick={() => updBrief({ refs: on ? brief.refs.filter((x) => x !== m) : [...(brief.refs || []), m] })}>{m}</button> })}</div>
            <label className="field"><span>Longest lighting setup you can afford: <b className="mono" style={{ color: 'var(--paper)' }}>{brief.maxSetup} min</b></span>
              <input type="range" min="15" max="90" step="5" value={brief.maxSetup} onChange={(e) => updBrief({ maxSetup: +e.target.value })} /></label>
          </Section>

          {review.length > 0 && (
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
          )}
        </div>

        <div className="side-foot">
          <button className="btn primary lg grow" onClick={go}><span className="ai-mark dark">✦</span> Generate 4 looks</button>
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
              onSelect={(s) => { setSel(s); if (s?.kind === 'objects') setOpen(2); else if (s && (s.kind === 'opening' || s.kind === 'room')) setOpen(0) }}
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

