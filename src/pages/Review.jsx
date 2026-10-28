import { useState, useEffect } from 'react'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { useStore, setState, getState, navigate, setSceneStatus, activeProject, activeSceneMeta } from '../store.js'
import { runChecks } from '../engine/checks.js'
import { useCamStills } from '../components/useCamStills.js'
import { shareLink, addComment, commentToAI, vote, stillFor, onStill, toast } from '../actions.js'

const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago` }

export default function Review() {
  const st = useStore((s) => ({ scene: s.scene, setup: s.setup, comments: s.comments, directions: s.directions, activeDirection: s.activeDirection, votes: s.votes || {}, team: s.team, user: s.user, projects: s.projects, activeProjectId: s.activeProjectId, activeSceneId: s.activeSceneId, pending: s.pending }))
  const { scene, comments, directions, votes, team } = st
  const stills = useCamStills(scene, 1100)
  const [, force] = useState(0)
  useEffect(() => onStill(() => force((x) => x + 1)), [])
  useEffect(() => { const g = getState(); if (g.scene && g.status === 'studio') setSceneStatus('review') }, [])
  const [link, setLink] = useState('')
  const [making, setMaking] = useState(false)
  const [text, setText] = useState('')
  const [as, setAs] = useState(team.members[1]?.name || 'You')
  const [cam, setCam] = useState(null)

  if (!scene) {
    return (
      <div className="page">
        <div className="page-head"><div><div className="kicker"><span className="stepno">4</span> Review</div><h1>Nothing to review yet</h1><p>Open a direction in the studio first.</p></div></div>
        <button className="btn primary" onClick={() => navigate('/directions')}>Go to directions</button>
      </div>
    )
  }
  const proj = activeProject(st), meta = activeSceneMeta(st)
  const dir = directions.find((d) => d.id === st.activeDirection)
  const checks = runChecks(scene, st.setup.kit)
  const errors = checks.filter((c) => c.level === 'error')
  const open = comments.filter((c) => !c.resolved)
  const activeCam = cam || scene.activeCam || scene.cameras[0]?.id
  const camObj = scene.cameras.find((c) => c.id === activeCam)
  const makeLink = async () => { setMaking(true); const l = await shareLink(); setLink(l); setMaking(false); try { await navigator.clipboard.writeText(l); toast('Review link copied') } catch { toast('Review link ready') } }
  const submit = (e) => { e.preventDefault(); if (!text.trim()) return; addComment({ text: text.trim(), author: as, frame: activeCam }); setText('') }
  const tally = directions.map((d) => ({ d, n: (votes[d.id] || []).length, who: votes[d.id] || [] }))
  const lock = () => { setSceneStatus('plan'); navigate('/plan'); toast('Shot plan locked') }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker"><span className="stepno">4</span> Review · send the plan to the DP, the gaffer or the client. They don’t need an account.</div>
          <h1>{proj?.name} · Scene {meta?.num}</h1>
          <p>{dir ? <><b style={{ color: 'var(--paper)', fontWeight: 500 }}>{dir.name}</b> · {dir.mood}</> : activeDirection(st)}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigate('/studio')}>Back to studio</button>
          <button className="btn primary" onClick={lock} disabled={errors.length > 0} title={errors.length ? 'Fix the blocking issues in the studio first' : ''}><Icon name="check" size={15} /> Lock shot plan</button>
        </div>
      </div>

      <div className="review-grid">
        <div className="stack" style={{ gap: 16 }}>
          <div className="share-hero">
            {stills[activeCam] ? <img src={stills[activeCam]} alt={`Cam ${camObj?.label} frame`} /> : <div style={{ aspectRatio: '2.39', display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>}
            <div className="over row between">
              <span className="mono" style={{ fontSize: 12 }}><span className="dot" style={{ background: 'var(--tally)', marginRight: 6 }} />CAM {camObj?.label} · {camObj?.shot} · {camObj?.focal}mm · T{scene.tstop} · ISO {scene.iso}</span>
              <span className="chip">Simulated reference</span>
            </div>
          </div>
          <div className="option-row">
            {scene.cameras.map((c) => (
              <button key={c.id} className={'option' + (c.id === activeCam ? ' on' : '')} onClick={() => setCam(c.id)}>
                {stills[c.id] ? <img src={stills[c.id]} alt="" /> : <div style={{ aspectRatio: '2.39', display: 'grid', placeItems: 'center', background: '#000' }}><div className="spinner" /></div>}
                <div><span>Cam {c.label} · {c.shot}</span><span className="mono dim">{c.focal}mm</span></div>
              </button>
            ))}
          </div>

          <div className="card">
            <div className="card-h"><h3>Comments</h3><span className="mono dim" style={{ fontSize: 12 }}>{open.length} open · {comments.length - open.length} resolved</span></div>
            <div className="card-b">
              <form onSubmit={submit} className="stack" style={{ gap: 8, marginBottom: 6 }}>
                <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Note on Cam ${camObj?.label}: “Can we see the door behind her?”`} aria-label="Comment" />
                <div className="row wrap">
                  <label className="row" style={{ gap: 6, fontSize: 12.5 }}><span className="muted">Comment as</span>
                    <select className="select" style={{ height: 30, width: 'auto' }} value={as} onChange={(e) => setAs(e.target.value)}>{team.members.map((m) => <option key={m.name} value={m.name}>{m.name} · {m.role}</option>)}<option value="Client">Client (via link)</option></select>
                  </label>
                  <button className="btn sm primary" type="submit" style={{ marginLeft: 'auto' }} disabled={!text.trim()}>Post</button>
                </div>
              </form>
              {comments.slice().reverse().map((c) => (
                <div key={c.id} className="comment">
                  <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{c.author[0]}</span>
                  <div>
                    <span className="who">{c.author}</span><span className="when">{ago(c.at)}{c.frame ? ` · Cam ${scene.cameras.find((x) => x.id === c.frame)?.label || ''}` : ''}{c.target?.name ? ` · on ${c.target.name}` : ''}</span>
                    <p style={{ textDecoration: c.resolved ? 'line-through' : 'none', color: c.resolved ? 'var(--dim)' : undefined }}>{c.text}</p>
                    {!c.resolved && <div className="row">
                      <button className="btn sm" onClick={async () => { await commentToAI(c); navigate('/studio') }}><Icon name="wand" size={13} /> Ask AI to fix in studio</button>
                      <button className="btn ghost sm" onClick={() => setState((s) => ({ comments: s.comments.map((x) => (x.id === c.id ? { ...x, resolved: true } : x)) }))}>Resolve</button>
                    </div>}
                  </div>
                </div>
              ))}
              {!comments.length && <p className="hint">No comments yet. Notes left on the lens view in the studio show up here too.</p>}
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-h"><h3>Review link</h3><Icon name="link" size={15} /></div>
            <div className="card-b stack" style={{ gap: 10 }}>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Opens without signing in. Reviewers see the frames, the plan, the reasons, and can vote between options.</p>
              <button className="btn primary block" onClick={makeLink} disabled={making}>{making ? 'Packing the plan…' : link ? 'Copy again' : 'Create review link'}</button>
              {link && <><input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} style={{ fontSize: 11 }} aria-label="Review link" /><a className="btn sm" href={link} target="_blank" rel="noreferrer">Open as a reviewer <Icon name="arrowR" size={13} /></a></>}
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Plan at a glance</h3></div>
            <div className="plan-diagram"><PlanSVG scene={scene} labels width={480} height={300} /></div>
            <div className="card-b">
              <dl className="kv">
                <dt>Cameras</dt><dd>{scene.cameras.length}</dd><dt>Lights</dt><dd>{scene.lights.length}</dd>
                <dt>Props added</dt><dd>{scene.objects.filter((o) => o.source === 'ai').length}</dd>
                <dt>Checks</dt><dd style={{ color: errors.length ? 'var(--bad)' : 'var(--ok)' }}>{errors.length ? `${errors.length} blocking` : 'All clear'}</dd>
              </dl>
              {dir?.why && <ul className="why" style={{ marginTop: 12 }}>{dir.why.map((w) => <li key={w.layer}><span className="layer">{w.layer}</span><span><span className="ref">{w.ref}</span><span className="txt">{w.text}</span></span></li>)}</ul>}
            </div>
          </div>

          {directions.length > 1 && (
            <div className="card">
              <div className="card-h"><h3>Vote on directions</h3><span className="dim" style={{ fontSize: 12 }}>voting as {as}</span></div>
              <div className="card-b stack" style={{ gap: 8 }}>
                {tally.map(({ d, n, who }) => {
                  const url = stillFor(d, 480)
                  return (
                    <div key={d.id} className={'vote-row' + (d.id === st.activeDirection ? ' current' : '')}>
                      {url ? <img src={url} alt="" /> : <span className="vote-ph" />}
                      <div style={{ minWidth: 0 }}><b>{d.name}</b><span className="dim">{who.length ? who.join(', ') : 'No votes'}</span></div>
                      <button className={'btn sm' + (who.includes(as) ? ' primary' : '')} onClick={() => vote(d.id, as)} aria-pressed={who.includes(as)}><Icon name="vote" size={13} /> {n}</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-h"><h3>Crew on this scene</h3><a className="dim" style={{ fontSize: 12 }} href="#/settings">Manage</a></div>
            <div className="card-b stack" style={{ gap: 8 }}>
              {team.members.map((m) => <div key={m.name} className="row"><span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{m.name[0]}</span><span>{m.name}<span className="dim" style={{ display: 'block', fontSize: 12 }}>{m.role}</span></span></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function activeDirection(st) { return st.activeDirection === 'mix' ? 'Mixed direction' : st.activeDirection === 'learning' ? 'Your own setup' : '' }
