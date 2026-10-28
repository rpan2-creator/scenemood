import { useMemo, useState } from 'react'
import Icon from '../components/Icons.jsx'
import PlanSVG from '../components/PlanSVG.jsx'
import { useStore, setState, resetAll, navigate } from '../store.js'
import { ASSETS, ASSET_CATS } from '../data/assets.js'
import { FIXTURES, GEAR_KITS } from '../data/gear.js'
import { toast } from '../actions.js'

const ago = (t) => { const d = Math.round((Date.now() - t) / 86400000); return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago` }
const kitText = (kit) => Object.entries(kit).filter(([, n]) => n).map(([k, n]) => `${n} × ${FIXTURES[k].name}`).join(' · ')

// ---------------------------------------------------------------- library

export function Library() {
  const { library, team } = useStore((s) => ({ library: s.library, team: s.team }))
  const del = (kind, id) => setState((s) => ({ library: { ...s.library, [kind]: s.library[kind].filter((x) => x.id !== id) } }))
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="kicker">{team.name} · shared with {team.members.length} people</div><h1>Team library</h1><p>Rooms you’ve measured and the gear you own, saved once and reused on every scene. Add to it from Set up.</p></div>
        <button className="btn primary" onClick={() => navigate('/setup')}><Icon name="plus" size={15} /> Measure a room</button>
      </div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-h"><h3>Rooms</h3><span className="mono dim" style={{ fontSize: 12 }}>{library.rooms.length}</span></div>
          <div className="card-b stack" style={{ gap: 10 }}>
            {library.rooms.map((r) => (
              <div key={r.id} className="lib-row">
                <div className="lib-thumb"><PlanSVG scene={{ room: r.room, objects: r.objects || [], actors: [], cameras: [], lights: [] }} width={160} height={110} /></div>
                <div><b>{r.name}</b><span className="dim">{r.room.w}×{r.room.d}×{r.room.h} m · {r.room.openings?.length || 0} openings · {(r.objects || []).length} pieces · {ago(r.at)}</span></div>
                <button className="icon-btn" aria-label={`Delete ${r.name}`} onClick={() => del('rooms', r.id)}><Icon name="trash" size={14} /></button>
              </div>
            ))}
            {!library.rooms.length && <p className="hint">No rooms yet. In Set up, enter a location’s measurements and press “Save room to team library”.</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Gear kits</h3><span className="mono dim" style={{ fontSize: 12 }}>{library.kits.length + GEAR_KITS.length}</span></div>
          <div className="card-b stack" style={{ gap: 10 }}>
            {library.kits.map((k) => (
              <div key={k.id} className="lib-row nothumb">
                <div><b>{k.name}</b><span className="dim">{kitText(k.kit)} · {ago(k.at)}</span></div>
                <button className="icon-btn" aria-label={`Delete ${k.name}`} onClick={() => del('kits', k.id)}><Icon name="trash" size={14} /></button>
              </div>
            ))}
            {GEAR_KITS.map((k) => <div key={k.id} className="lib-row nothumb"><div><b>{k.name} <span className="tag">preset</span></b><span className="dim">{kitText(k.items)}</span></div><span /></div>)}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h"><h3>Asset library</h3><span className="mono dim" style={{ fontSize: 12 }}>{ASSETS.length} pieces · {ASSETS.filter((a) => a.glb).length} scanned</span></div>
        <div className="card-b row wrap" style={{ gap: 6 }}>
          {ASSET_CATS.map((c) => <span key={c} className="chip">{c} · {ASSETS.filter((a) => a.cat === c).length}</span>)}
          <span className="hint" style={{ width: '100%', marginTop: 6 }}>Browse and place them from the Assets tab in the studio. Team plans can upload their own props (coming with the API).</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- insights

const OUTCOMES = [['accepted', 'Kept as proposed', 'var(--tungsten)'], ['edited', 'Kept, then edited', '#9a7448'], ['rejected', 'Removed', '#55605b']]
const SAMPLE = (() => {
  const rows = []
  const add = (layer, a, e, r) => { for (let i = 0; i < a; i++) rows.push({ layer, outcome: 'accepted' }); for (let i = 0; i < e; i++) rows.push({ layer, outcome: 'edited' }); for (let i = 0; i < r; i++) rows.push({ layer, outcome: 'rejected' }) }
  add('Lighting', 41, 22, 9); add('Dressing', 33, 12, 19); add('Blocking', 24, 15, 6)
  return rows
})()

export function Insights() {
  const { log, directions, firstDirectionAt, settings } = useStore((s) => ({ log: s.log || [], directions: s.directions, firstDirectionAt: s.firstDirectionAt, settings: s.settings }))
  const [src, setSrc] = useState(log.length >= 6 ? 'mine' : 'sample')
  const [table, setTable] = useState(false)
  const rows = src === 'mine' ? log : SAMPLE
  const by = useMemo(() => ['Lighting', 'Dressing', 'Blocking'].map((layer) => {
    const r = rows.filter((x) => x.layer === layer)
    const n = Object.fromEntries(OUTCOMES.map(([k]) => [k, r.filter((x) => x.outcome === k).length]))
    return { layer, total: r.length, ...n }
  }), [rows])
  const total = rows.length
  const kept = rows.filter((r) => r.outcome !== 'rejected').length
  const refs = useMemo(() => {
    const m = {}
    rows.filter((r) => r.ref).forEach((r) => { m[r.ref] = m[r.ref] || { ref: r.ref, kept: 0, n: 0 }; m[r.ref].n++; if (r.outcome !== 'rejected') m[r.ref].kept++ })
    return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 6)
  }, [rows])
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="kicker">How the crew treats the AI’s proposals</div><h1>Insights</h1><p>Every AI piece you keep, edit or remove is logged. It’s how we know which suggestions are professional and which get thrown out.</p></div>
        <div className="seg" role="group" aria-label="Data source"><button className={src === 'mine' ? 'on' : ''} onClick={() => setSrc('mine')}>Your scenes ({log.length})</button><button className={src === 'sample' ? 'on' : ''} onClick={() => setSrc('sample')}>Sample data</button></div>
      </div>
      {src === 'sample' && <p className="chip warm" style={{ marginBottom: 16 }}>Showing sample data, not your usage</p>}
      {!settings.improve && <p className="hint" style={{ marginBottom: 16 }}>Logging is off in Settings, so new decisions aren’t recorded.</p>}
      <div className="grid3" style={{ marginBottom: 16 }}>
        <div className="card card-b stat"><span className="muted" style={{ fontSize: 12.5 }}>AI proposals reviewed</span><span className="big">{total}</span></div>
        <div className="card card-b stat"><span className="muted" style={{ fontSize: 12.5 }}>Kept (as is or edited)</span><span className="big">{total ? Math.round((kept / total) * 100) : 0}%</span><span className="dim" style={{ fontSize: 12 }}>Goal: 60% or more</span></div>
        <div className="card card-b stat"><span className="muted" style={{ fontSize: 12.5 }}>Time to first direction</span><span className="big">{firstDirectionAt ? `${Math.round(firstDirectionAt.ms / 1000)}s` : src === 'sample' ? '3:40' : '—'}</span><span className="dim" style={{ fontSize: 12 }}>Goal: under 5 minutes · {directions.length} directions this scene</span></div>
      </div>
      <div className="card">
        <div className="card-h"><h3>What happens to each layer’s proposals</h3><button className="btn ghost sm" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show table'}</button></div>
        <div className="card-b">
          {table ? (
            <table className="tbl"><thead><tr><th>Layer</th>{OUTCOMES.map(([k, l]) => <th key={k}>{l}</th>)}<th>Total</th></tr></thead>
              <tbody>{by.map((b) => <tr key={b.layer}><td>{b.layer}</td>{OUTCOMES.map(([k]) => <td key={k} className="num">{b[k]}</td>)}<td className="num">{b.total}</td></tr>)}</tbody></table>
          ) : (
            <>
              <div className="legend-row">{OUTCOMES.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}</span>)}</div>
              <div className="bars">
                {by.map((b) => (
                  <div key={b.layer} className="bar-row">
                    <span>{b.layer}</span>
                    <div className="bar-track">{OUTCOMES.map(([k, l, c]) => b[k] ? <i key={k} title={`${b.layer} · ${l}: ${b[k]} of ${b.total} (${Math.round((b[k] / b.total) * 100)}%)`} style={{ width: `${(b[k] / Math.max(1, b.total)) * 100}%`, background: c }} /> : null)}</div>
                    <span className="mono dim" style={{ fontSize: 12, textAlign: 'right' }}>{b.total ? Math.round(((b.accepted + b.edited) / b.total) * 100) : 0}% kept</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {refs.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h"><h3>Most frequent reasons</h3></div>
          <table className="tbl"><thead><tr><th>Reason the AI gave</th><th>Times</th><th>Kept</th></tr></thead>
            <tbody>{refs.map((r) => <tr key={r.ref}><td>{r.ref}</td><td className="num">{r.n}</td><td className="num">{Math.round((r.kept / r.n) * 100)}%</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- settings

function Toggle({ on, onChange, title, desc }) {
  return <label className="switch"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><span><b>{title}</b><span>{desc}</span></span></label>
}

export function Settings() {
  const { user, team, settings, usage } = useStore((s) => ({ user: s.user, team: s.team, settings: s.settings, usage: s.usage }))
  const [invite, setInvite] = useState({ name: '', email: '', role: 'DP' })
  const set = (p) => setState((s) => ({ settings: { ...s.settings, ...p } }))
  const setUser = (p) => setState((s) => ({ user: { ...(s.user || { name: 'You', role: 'Director', email: '' }), ...p } }))
  return (
    <div className="page">
      <div className="page-head"><div><div className="kicker">Account and team</div><h1>Settings</h1></div></div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 16 }}>
          <div className="card"><div className="card-h"><h3>Profile</h3></div>
            <div className="card-b stack">
              <label className="field"><span>Name</span><input className="input" value={user?.name || ''} onChange={(e) => setUser({ name: e.target.value })} /></label>
              <label className="field"><span>Email</span><input className="input" type="email" value={user?.email || ''} onChange={(e) => setUser({ email: e.target.value })} /></label>
              <label className="field"><span>Role on set</span><select className="select" value={user?.role || 'Director'} onChange={(e) => setUser({ role: e.target.value })}>{['Director', 'Producer', 'DP', 'Production designer', 'Gaffer', 'Student'].map((r) => <option key={r}>{r}</option>)}</select></label>
            </div>
          </div>
          <div className="card"><div className="card-h"><h3>Team · {team.name}</h3><span className="mono dim" style={{ fontSize: 12 }}>{team.members.length}/{team.seats} seats</span></div>
            <div className="card-b stack" style={{ gap: 10 }}>
              {team.members.map((m, i) => <div key={i} className="row"><span className="avatar">{m.name[0]}</span><span style={{ flex: 1 }}>{m.name}<span className="dim" style={{ display: 'block', fontSize: 12 }}>{m.role}{m.email ? ` · ${m.email}` : ''}{m.invited ? ' · invite sent' : ''}</span></span>{i > 0 && <button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => setState((s) => ({ team: { ...s.team, members: s.team.members.filter((_, j) => j !== i) } }))}><Icon name="x" size={14} /></button>}</div>)}
              <form className="grid3" onSubmit={(e) => { e.preventDefault(); if (!invite.name.trim()) return; setState((s) => ({ team: { ...s.team, members: [...s.team.members, { ...invite, invited: true }] } })); setInvite({ name: '', email: '', role: 'DP' }); toast('Invite recorded (simulated, no email sent)') }}>
                <input className="input" placeholder="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} aria-label="Invite name" />
                <input className="input" placeholder="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} aria-label="Invite email" />
                <div className="row"><select className="select" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} aria-label="Role">{['DP', 'Gaffer', 'Production designer', 'Producer', 'Client'].map((r) => <option key={r}>{r}</option>)}</select><button className="btn sm" type="submit" disabled={team.members.length >= team.seats}>Invite</button></div>
              </form>
            </div>
          </div>
          <div className="card"><div className="card-h"><h3>Plan and usage</h3><a className="dim" style={{ fontSize: 12 }} href="#/pricing">Compare plans</a></div>
            <div className="card-b stack">
              <div className="row between"><span><b style={{ fontWeight: 500 }}>{team.plan}</b> <span className="dim">· renews monthly</span></span><div className="seg">{['Pro', 'Team'].map((p) => <button key={p} className={team.plan === p ? 'on' : ''} onClick={() => setState((s) => ({ team: { ...s.team, plan: p, seats: p === 'Team' ? 5 : Math.max(1, s.team.members.length) }, usage: { ...s.usage, hdQuota: p === 'Team' ? 400 : 100 } }))}>{p}</button>)}</div></div>
              <div><div className="row between" style={{ fontSize: 12.5 }}><span className="muted">HD reference frames</span><span className="mono">{usage.hdFrames}/{usage.hdQuota}</span></div><div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${(usage.hdFrames / usage.hdQuota) * 100}%` }} /></div></div>
              <p className="hint">Billing isn’t connected in this prototype. No payment details are collected here.</p>
            </div>
          </div>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="card"><div className="card-h"><h3>Privacy</h3></div>
            <div className="card-b stack">
              <Toggle on={settings.improve} onChange={(v) => set({ improve: v })} title="Log how I treat AI proposals" desc="Keep / edit / remove decisions, for Insights and to improve directions. No script text." />
              <label className="field"><span>Keep briefs and reference frames for</span><select className="select" value={settings.retention} onChange={(e) => set({ retention: e.target.value })}><option value="0">Don’t keep (delete after the session)</option><option value="30">30 days</option><option value="365">1 year</option></select></label>
              <Toggle on={settings.learningDefault} onChange={(v) => set({ learningDefault: v })} title="Start new scenes in learning mode" desc="For classes: students light it first, then compare with the AI." />
            </div>
          </div>
          <div className="card"><div className="card-h"><h3>AI model</h3><span className="chip warm">Simulated</span></div>
            <div className="card-b stack">
              <div className="cards">
                {[['simulated', 'Simulated', 'Built-in rules and recipes, runs in the browser'], ['api', 'Connected model', 'Language + image model through your server']].map(([k, t, d]) => <button key={k} type="button" className={'pick' + (settings.model === k ? ' on' : '')} onClick={() => set({ model: k })}><b>{t}</b><span>{d}</span></button>)}
              </div>
              <label className="field"><span>Server endpoint</span><input className="input mono" placeholder="https://your-app.vercel.app/api/scene" value={settings.endpoint} onChange={(e) => set({ endpoint: e.target.value })} disabled={settings.model !== 'api'} /></label>
              <p className="hint">API keys never go in the browser. Put them in a server function (for example a Vercel environment variable) and point this endpoint at it. Until then every AI step stays simulated, and the feasibility checks always run locally.</p>
            </div>
          </div>
          <div className="card"><div className="card-h"><h3>Data in this browser</h3></div>
            <div className="card-b stack">
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Projects, scenes and the library are saved in this browser only.</p>
              <button className="btn" onClick={() => { if (window.confirm('Delete all projects and start over?')) { resetAll(); navigate('/app'); toast('Reset to the demo project') } }}><Icon name="trash" size={14} /> Reset everything</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
