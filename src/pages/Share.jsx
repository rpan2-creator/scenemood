import { useEffect, useState } from 'react'
import Logo from '../components/Logo.jsx'
import PlanSVG from '../components/PlanSVG.jsx'
import Icon from '../components/Icons.jsx'
import { useCamStills } from '../components/useCamStills.js'
import { inflate } from '../actions.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { getAsset } from '../data/assets.js'

const LS = (code) => 'scenemood.share.' + code.slice(0, 24)
function loadLocal(code) { try { return JSON.parse(localStorage.getItem(LS(code))) || { comments: [], vote: null } } catch { return { comments: [], vote: null } } }

function Option({ o, on, onVote }) {
  const urls = useCamStills(o.scene, 560)
  const url = urls[o.scene.activeCam]
  return (
    <div className={'option' + (on ? ' on' : '')}>
      {url ? <img src={url} alt={o.name} /> : <div style={{ aspectRatio: '2.39', display: 'grid', placeItems: 'center', background: '#000' }}><div className="spinner" /></div>}
      <div style={{ display: 'grid', gap: 6, justifyContent: 'stretch' }}>
        <b style={{ fontWeight: 500 }}>{o.name}</b>
        <span className="muted" style={{ fontSize: 12.5 }}>{o.mood}</span>
        <button className={'btn sm' + (on ? ' primary' : '')} onClick={onVote} aria-pressed={on}><Icon name="vote" size={13} /> {on ? 'Your pick' : 'Pick this one'}</button>
      </div>
    </div>
  )
}

export default function Share({ code }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [local, setLocal] = useState(() => loadLocal(code))
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [cam, setCam] = useState(null)
  useEffect(() => { inflate(code).then((t) => setData(JSON.parse(t))).catch(() => setErr(true)) }, [code])
  const scene = data?.plan
  const stills = useCamStills(scene, 1200)
  const save = (n) => { setLocal(n); try { localStorage.setItem(LS(code), JSON.stringify(n)) } catch { /* private mode */ } }

  if (err) return <div className="page"><Logo size={26} /><h1 className="display" style={{ fontSize: 44 }}>This link doesn’t open</h1><p className="muted">It may have been cut off when it was copied. Ask for the link again.</p><a className="btn" href="#/">Go to SceneMood</a></div>
  if (!data) return <div className="page row" style={{ minHeight: '60vh', justifyContent: 'center' }}><div className="spinner" /> <span className="muted">Opening the plan…</span></div>

  const active = cam || scene.activeCam || scene.cameras[0]?.id
  const c = scene.cameras.find((x) => x.id === active)
  const added = scene.objects.filter((o) => o.source === 'ai').map((o) => getAsset(o.asset)?.name).filter(Boolean)
  return (
    <div className="share-page">
      <header className="l-nav solid"><Logo size={24} /><nav><span className="chip">Review link · no account needed</span><a className="btn primary sm" href="#/login">Plan your own scene</a></nav></header>
      <div className="page">
        <div className="page-head">
          <div>
            <div className="kicker">{data.from} shared this for review</div>
            <h1>{data.project} · {data.scene}</h1>
            {data.direction && <p><b style={{ color: 'var(--paper)', fontWeight: 500 }}>{data.direction.name}</b> · {data.direction.mood}</p>}
          </div>
        </div>
        <div className="review-grid">
          <div className="stack" style={{ gap: 14 }}>
            <div className="share-hero">
              {stills[active] ? <img src={stills[active]} alt={`Cam ${c?.label}`} /> : <div style={{ aspectRatio: '2.39', display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>}
              <div className="over mono" style={{ fontSize: 12 }}><span className="dot" style={{ background: 'var(--tally)', marginRight: 6 }} />CAM {c?.label} · {c?.shot} · {c?.focal}mm · T{scene.tstop} · ISO {scene.iso}</div>
            </div>
            <div className="option-row">
              {scene.cameras.map((x) => (
                <button key={x.id} className={'option' + (x.id === active ? ' on' : '')} onClick={() => setCam(x.id)}>
                  {stills[x.id] ? <img src={stills[x.id]} alt="" /> : <div style={{ aspectRatio: '2.39', background: '#000' }} />}
                  <div><span>Cam {x.label} · {x.shot}</span><span className="mono dim">{x.focal}mm</span></div>
                </button>
              ))}
            </div>
            {data.options?.length > 1 && (
              <div className="card">
                <div className="card-h"><h3>Which direction should we shoot?</h3><span className="dim" style={{ fontSize: 12 }}>{data.options.length} options</span></div>
                <div className="card-b option-row">{data.options.map((o) => <Option key={o.id} o={o} on={local.vote === o.id} onVote={() => save({ ...local, vote: o.id })} />)}</div>
              </div>
            )}
            <div className="card">
              <div className="card-h"><h3>Notes for the director</h3></div>
              <div className="card-b stack" style={{ gap: 10 }}>
                <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; save({ ...local, comments: [...local.comments, { name: name.trim() || 'Reviewer', text: text.trim(), cam: c?.label, at: Date.now() }] }); setText('') }}>
                  <div className="grid2"><input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" /><span /></div>
                  <textarea className="input" rows={2} placeholder={`About Cam ${c?.label}…`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Note" />
                  <button className="btn primary sm" type="submit" disabled={!text.trim()} style={{ justifySelf: 'start' }}>Leave note</button>
                </form>
                {local.comments.slice().reverse().map((m, i) => <div key={i} className="comment"><span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{m.name[0]}</span><div><span className="who">{m.name}</span><span className="when">Cam {m.cam}</span><p>{m.text}</p></div></div>)}
                <p className="hint">Prototype: notes and votes are kept in this browser. With accounts connected they go straight to the director’s review page.</p>
              </div>
            </div>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            <div className="card">
              <div className="card-h"><h3>Top view</h3></div>
              <div className="plan-diagram"><PlanSVG scene={scene} labels width={480} height={300} highlight={active} /></div>
            </div>
            {data.direction?.why && (
              <div className="card"><div className="card-h"><h3>Why it’s built this way</h3></div>
                <div className="card-b"><ul className="why">{data.direction.why.map((w) => <li key={w.layer}><span className="layer">{w.layer}</span><span><span className="ref">{w.ref}</span><span className="txt">{w.text}</span></span></li>)}</ul></div></div>
            )}
            <div className="card">
              <div className="card-h"><h3>Lighting</h3></div>
              <div className="card-b stack" style={{ gap: 8 }}>
                {scene.lights.map((l) => <div key={l.id} className="row between" style={{ fontSize: 13 }}><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: cctToHex(l.cct) }} />{l.label || l.role}</span><span className="mono dim" style={{ fontSize: 12 }}>{FIXTURES[l.fixture]?.name} · {Math.round(l.intensity * 100)}% · {l.cct}K</span></div>)}
              </div>
            </div>
            {added.length > 0 && <div className="card"><div className="card-h"><h3>Set dressing to bring</h3></div><div className="card-b row wrap" style={{ gap: 6 }}>{added.map((a, i) => <span key={i} className="chip">{a}</span>)}</div></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
