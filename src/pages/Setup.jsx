import { useMemo } from 'react'
import Viewport from '../components/Viewport.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, setState, roomFromTemplate, starterObjects, navigate } from '../store.js'
import { ROOM_TEMPLATES, wallFrame } from '../data/rooms.js'
import { GEAR_KITS, FIXTURES, getKit } from '../data/gear.js'
import { getAsset } from '../data/assets.js'
import { runGeneration } from '../actions.js'

const WALLS = [['N', 'Back'], ['E', 'Right'], ['S', 'Front'], ['W', 'Left']]
const TONES = [['light', 'Light'], ['medium', 'Medium'], ['deep', 'Deep']]
const ACTOR_NAMES = { actor_a: 'Theo (A)', actor_b: 'Ana (B)', actor_c: 'June (C)' }

function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
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
  const setup = useStore((s) => s.setup)
  const { room, brief, kit } = setup
  const update = (patch) => setState((s) => ({ setup: { ...s.setup, ...patch } }))
  const updRoom = (patch) => update({ room: { ...room, ...patch } })
  const updBrief = (patch) => update({ brief: { ...brief, ...patch } })

  const previewScene = useMemo(() => ({
    room, objects: setup.objects || [], actors: [], lights: [], cameras: [], time: brief.time, aspect: brief.aspect, iso: 800, tstop: 2.8,
  }), [room, setup.objects, brief.time, brief.aspect])

  const pickTemplate = (id) => update({ templateId: id, room: roomFromTemplate(id), objects: starterObjects(id) })
  const setOp = (i, patch) => updRoom({ openings: room.openings.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const addOp = (type) => updRoom({
    openings: [...room.openings, type === 'window'
      ? { id: 'win' + Date.now(), type, wall: 'N', at: 0, width: 1.1, height: 1.4, sill: 0.85 }
      : { id: 'door' + Date.now(), type, wall: 'S', at: 0, width: 0.9, height: 2.05, sill: 0 }],
  })
  const totalLights = Object.entries(kit).filter(([k]) => !FIXTURES[k].passive).reduce((a, [, v]) => a + v, 0)

  const go = () => {
    runGeneration()
    navigate('/directions')
  }

  return (
    <div className="setup">
      <form className="setup-form" onSubmit={(e) => { e.preventDefault(); go() }}>
        <div>
          <h2>Set up the scene</h2>
          <p className="muted" style={{ margin: 0 }}>Enter what you know about the location and your kit. The AI only proposes what fits inside these facts.</p>
        </div>

        <section className="setup-block" aria-labelledby="s-room">
          <h3 id="s-room"><span className="n">1</span> Room</h3>
          <div className="cards">
            {ROOM_TEMPLATES.map((t) => (
              <button key={t.id} type="button" className={'pick' + (setup.templateId === t.id ? ' on' : '')} onClick={() => pickTemplate(t.id)} aria-pressed={setup.templateId === t.id}>
                <b>{t.name}</b>
                <span>{t.note}</span>
              </button>
            ))}
          </div>
          <div className="grid3">
            {[['w', 'Width'], ['d', 'Depth'], ['h', 'Ceiling']].map(([k, l]) => (
              <label key={k} className="field">
                <span>{l} (m)</span>
                <input className="input mono" type="number" step="0.1" min={k === 'h' ? 2.2 : 2} max={12} value={room[k]} onChange={(e) => updRoom({ [k]: Math.max(1.8, +e.target.value || room[k]) })} />
              </label>
            ))}
          </div>
          <div className="field">
            <span>Doors and windows</span>
            <div style={{ display: 'grid', gap: 6 }}>
              {room.openings.map((op, i) => {
                const len = wallFrame(room, op.wall).len
                const lim = Math.max(0, len / 2 - op.width / 2 - 0.1)
                return (
                  <div className="op-row" key={op.id}>
                    <select className="select" value={op.type} onChange={(e) => setOp(i, e.target.value === 'door' ? { type: 'door', sill: 0, height: 2.05, width: 0.9 } : { type: 'window', sill: 0.85, height: 1.4, width: 1.1 })} aria-label="Opening type">
                      <option value="window">Window</option>
                      <option value="door">Door</option>
                    </select>
                    <select className="select" value={op.wall} onChange={(e) => setOp(i, { wall: e.target.value, at: 0 })} aria-label="Wall">
                      {WALLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="range" min={-lim} max={lim} step="0.05" value={Math.max(-lim, Math.min(lim, op.at))} onChange={(e) => setOp(i, { at: +e.target.value })} aria-label="Position along the wall" />
                    <button type="button" className="icon-btn" onClick={() => updRoom({ openings: room.openings.filter((_, j) => j !== i) })} aria-label="Remove opening"><Icon name="x" size={14} /></button>
                  </div>
                )
              })}
            </div>
            <div className="row">
              <button type="button" className="btn sm" onClick={() => addOp('window')}><Icon name="plus" size={14} /> Window</button>
              <button type="button" className="btn sm" onClick={() => addOp('door')}><Icon name="plus" size={14} /> Door</button>
              <span className="dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{room.outlets.length} outlets marked</span>
            </div>
          </div>
          <div className="field">
            <span>Furniture already in the room</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {(setup.objects || []).map((o) => (
                <span key={o.id} className="chip">
                  {getAsset(o.asset)?.name}
                  <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => update({ objects: setup.objects.filter((x) => x.id !== o.id) })} aria-label={`Remove ${getAsset(o.asset)?.name}`}><Icon name="x" size={11} /></button>
                </span>
              ))}
              {!(setup.objects || []).length && <span className="dim" style={{ fontSize: 12.5 }}>Empty room. The AI will dress it from scratch.</span>}
            </div>
          </div>
        </section>

        <section className="setup-block" aria-labelledby="s-gear">
          <h3 id="s-gear"><span className="n">2</span> Gear you have</h3>
          <div className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {GEAR_KITS.map((k) => (
              <button key={k.id} type="button" className={'pick' + (setup.kitId === k.id ? ' on' : '')} onClick={() => update({ kitId: k.id, kit: { ...getKit(k.id).items } })} aria-pressed={setup.kitId === k.id}>
                <b>{k.name}</b>
                <span>{k.note}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {Object.values(FIXTURES).map((f) => (
              <div className="gear-row" key={f.id}>
                <div>
                  {f.name}
                  <small>{f.spec}</small>
                </div>
                <Stepper value={kit[f.id] || 0} label={f.name} onChange={(v) => update({ kitId: 'custom', kit: { ...kit, [f.id]: v } })} />
              </div>
            ))}
          </div>
          <p className="hint" style={{ margin: 0 }}>{totalLights} powered unit{totalLights === 1 ? '' : 's'}. Every direction is checked against this list.</p>
        </section>

        <section className="setup-block" aria-labelledby="s-brief">
          <h3 id="s-brief"><span className="n">3</span> The scene</h3>
          <label className="field">
            <span>What happens, and how should it feel?</span>
            <textarea className="textarea" value={brief.text} onChange={(e) => updBrief({ text: e.target.value })} placeholder="Night. Two people argue on the couch. She wants to leave but doesn't." />
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <Seg label="Time of day" value={brief.time} onChange={(v) => updBrief({ time: v })} options={[['night', 'Night'], ['day', 'Day']]} />
            <Seg label="Aspect ratio" value={brief.aspect} onChange={(v) => updBrief({ aspect: v })} options={[['2.39', '2.39:1'], ['1.85', '1.85:1'], ['16:9', '16:9']]} />
            <Seg label="Actors" value={brief.actors} onChange={(v) => updBrief({ actors: v })} options={[[2, '2 actors'], [3, '3 actors']]} />
          </div>
          <div className="field">
            <span>Skin tone per actor</span>
            <p className="hint" style={{ margin: '0 0 2px' }}>Exposure checks target each face separately so darker skin isn't left underlit.</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {['actor_a', 'actor_b', 'actor_c'].slice(0, brief.actors).map((id) => (
                <div key={id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13 }}>{ACTOR_NAMES[id]}</span>
                  <Seg label={`Skin tone for ${ACTOR_NAMES[id]}`} value={brief.tones?.[id] || 'medium'} onChange={(v) => updBrief({ tones: { ...brief.tones, [id]: v } })} options={TONES} />
                </div>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Longest acceptable lighting setup: <b className="mono" style={{ color: 'var(--text)' }}>{brief.maxSetup} min</b></span>
            <input type="range" min="15" max="90" step="5" value={brief.maxSetup} onChange={(e) => updBrief({ maxSetup: +e.target.value })} />
          </label>
        </section>

        <div className="setup-foot">
          <button type="submit" className="btn primary lg">Generate 3 directions</button>
          <span className="dim" style={{ fontSize: 12.5 }}>Simulated, about 8 seconds</span>
        </div>
      </form>

      <div className="setup-preview">
        <Viewport scene={previewScene} mode="preview" view="set" ui={{ cones: true }} camPos={[5.2, 5.4, 6.6]} target={[0, 0.4, 0]} />
        <div className="cap">
          <span className="chip">{room.name} · {room.w.toFixed(1)} × {room.d.toFixed(1)} × {room.h.toFixed(1)} m</span>
          <span className="chip cool"><span className="dot" style={{ background: 'var(--daylight)' }} />{room.openings.filter((o) => o.type === 'window').length} windows</span>
          <span className="chip">{room.openings.filter((o) => o.type === 'door').length} doors</span>
          <span className="chip">Drag to orbit</span>
        </div>
      </div>
    </div>
  )
}
