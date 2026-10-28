import { useState } from 'react'
import Icon from '../components/Icons.jsx'
import { useStore, createProject, createScene, openScene, navigate, activeProject } from '../store.js'
import { ROOM_TEMPLATES } from '../data/rooms.js'

const STATUS = ['setup', 'directions', 'studio', 'review', 'plan']
const STATUS_LABEL = { setup: 'Setting up', directions: 'Choosing a direction', studio: 'In the studio', review: 'In review', plan: 'Plan locked' }
const COVER = { living: 'stills/living-trapped.jpg', bedroom: 'stills/bedroom-trapped.jpg', office: 'stills/office-boiling.jpg', diner: 'stills/diner-trapped.jpg' }

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="card-h"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="card-b">{children}</div>
      </div>
    </div>
  )
}

export default function Projects() {
  const { projects, user, team, usage } = useStore((s) => ({ projects: s.projects, user: s.user, team: s.team, usage: s.usage }))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'Short film', aspect: '2.39', shootDate: '' })
  const submit = (e) => { e.preventDefault(); if (!form.name.trim()) return; createProject(form); setOpen(false); navigate('/app/project') }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">{team.name} · {team.plan} plan</div>
          <h1>{user ? `Hi ${user.name.split(' ')[0]}, what are we shooting?` : 'Projects'}</h1>
          <p>Each project holds its scenes. A scene goes from set up to a locked shot plan in five steps.</p>
        </div>
        <div className="card" style={{ padding: 14, minWidth: 260 }}>
          <div className="row between" style={{ fontSize: 12.5 }}><span className="muted">HD reference frames this month</span><span className="mono">{usage.hdFrames} / {usage.hdQuota}</span></div>
          <div className="meter" style={{ marginTop: 8 }}><i style={{ width: `${(usage.hdFrames / usage.hdQuota) * 100}%` }} /></div>
        </div>
      </div>
      <div className="proj-grid">
        {projects.map((p) => (
          <button key={p.id} className="proj" onClick={() => { openScene(p.id, p.scenes[0]?.id); navigate('/app/project') }}>
            <div className="cover" style={{ backgroundImage: `url(${COVER[p.scenes[0]?.template || 'living']})` }}><span className="chip">{p.type}</span></div>
            <div className="b">
              <h3>{p.name}</h3>
              <span className="muted" style={{ fontSize: 13 }}>{p.scenes.length} scene{p.scenes.length === 1 ? '' : 's'} · {p.aspect}:1{p.shootDate ? ` · shoots ${p.shootDate}` : ''}</span>
            </div>
          </button>
        ))}
        <button className="proj new" onClick={() => setOpen(true)}><span className="row"><Icon name="plus" /> New project</span></button>
      </div>
      {open && (
        <Modal title="New project" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="stack">
            <label className="field"><span>Project name</span><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Leaving Hour" required /></label>
            <div className="grid2">
              <label className="field"><span>Type</span><select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['Short film', 'Music video', 'Commercial', 'Branded content', 'Web series', 'Student film'].map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="field"><span>Aspect ratio</span><select className="select" value={form.aspect} onChange={(e) => setForm({ ...form, aspect: e.target.value })}><option value="2.39">2.39:1</option><option value="1.85">1.85:1</option><option value="16:9">16:9</option></select></label>
            </div>
            <label className="field"><span>First shoot day (optional)</span><input className="input" type="date" value={form.shootDate} onChange={(e) => setForm({ ...form, shootDate: e.target.value })} /></label>
            <button className="btn primary" type="submit">Create project</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

export function ProjectPage() {
  const s = useStore((st) => ({ projects: st.projects, activeProjectId: st.activeProjectId, activeSceneId: st.activeSceneId, status: st.status }))
  const p = activeProject(s)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', template: 'living' })
  if (!p) return null
  const go = (sc) => {
    openScene(p.id, sc.id)
    const step = sc.status === 'setup' ? '/setup' : sc.status === 'directions' ? '/directions' : sc.status === 'review' ? '/review' : sc.status === 'plan' ? '/plan' : '/studio'
    navigate(step)
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker"><a href="#/app" style={{ textDecoration: 'none' }}>Projects</a> / {p.type}</div>
          <h1>{p.name}</h1>
          <p>{p.scenes.length} scene{p.scenes.length === 1 ? '' : 's'} · {p.aspect}:1{p.shootDate ? ` · first shoot day ${p.shootDate}` : ''}</p>
        </div>
        <button className="btn primary" onClick={() => setOpen(true)}><Icon name="plus" size={15} /> Add a scene</button>
      </div>
      <div className="scene-list">
        {p.scenes.map((sc) => {
          const st = sc.id === s.activeSceneId ? s.status : sc.status
          const idx = STATUS.indexOf(st || 'setup')
          return (
            <button key={sc.id} className="scene-row" onClick={() => go({ ...sc, status: st })}>
              <span className="num">{sc.num}</span>
              <span><b style={{ fontWeight: 500 }}>{sc.name}</b><span className="dim" style={{ display: 'block', fontSize: 12.5 }}>{ROOM_TEMPLATES.find((t) => t.id === (sc.template || 'living'))?.name}</span></span>
              <span className="status-steps" aria-label={STATUS_LABEL[st]}>{STATUS.map((x, i) => <i key={x} className={i <= idx ? 'on' : ''} />)}</span>
              <span className="muted" style={{ fontSize: 12.5, minWidth: 150, textAlign: 'right' }}>{STATUS_LABEL[st]} <Icon name="arrowR" size={13} /></span>
            </button>
          )
        })}
      </div>
      {open && (
        <Modal title="Add a scene" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return; createScene(form); setOpen(false); navigate('/setup') }}>
            <label className="field"><span>Scene name</span><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hallway, the next morning" required /></label>
            <div className="field"><span>Location type</span>
              <div className="cards">{ROOM_TEMPLATES.map((t) => <button type="button" key={t.id} className={'pick' + (form.template === t.id ? ' on' : '')} onClick={() => setForm({ ...form, template: t.id })}><b>{t.name}</b><span>{t.note}</span></button>)}</div>
            </div>
            <button className="btn primary" type="submit">Add and set up</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

export { Modal }
