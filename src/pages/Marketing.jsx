import { useState } from 'react'
import Logo from '../components/Logo.jsx'
import Icon from '../components/Icons.jsx'
import { CREDITS } from '../data/assets.js'
import { HUMAN_MODELS } from '../engine/humans.js'
import { setState, navigate, useStore } from '../store.js'
import { openSample } from './Landing.jsx'

export function MarketingNav({ solid = true }) {
  const user = useStore((s) => s.user)
  return (
    <header className={'l-nav' + (solid ? ' solid' : '')}>
      <Logo size={26} />
      <nav aria-label="Main">
        <a className="hide-sm" href="#/">Product</a>
        <a className="hide-sm" href="#/cases">Cases</a>
        <a className="hide-sm" href="#/pricing">Pricing</a>
        <a className="hide-sm" href="#/education">Education</a>
        {user ? <a className="btn sm" href="#/app">Open projects</a> : <a href="#/login">Sign in</a>}
        <a className="btn primary sm" href={user ? '#/app' : '#/login'}>Start a scene</a>
      </nav>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <span>SceneMood · a pre-trained model prototype by Group 3, AI Products P3. AI responses in this build are simulated; no API key is connected.</span>
      <span className="row wrap" style={{ gap: 16 }}><a href="#/cases">Cases</a><a href="#/pricing">Pricing</a><a href="#/education">Education</a><a href="#/app">Projects</a></span>
      <div className="credits">
        3D assets: {CREDITS.join(' · ')} · {Object.values(HUMAN_MODELS).map((h) => h.credit).join(' · ')} · Textures and engine: three.js (MIT). Avatars marked non-commercial are used for this academic prototype only.
      </div>
    </footer>
  )
}

const CASES = [
  { room: 'living', key: 'trapped', time: 'night', title: 'Leaving hour', type: 'Short film', note: 'Two panels and a bounce, 40 min', line: 'An argument on the couch, motivated by one floor lamp.' },
  { room: 'battlefield', key: 'coldwar', time: 'dusk', title: 'No man’s land', type: 'Student film', note: 'One panel and a barrel fire, dusk', line: 'Two soldiers on either side of the sandbags, the light going.' },
  { room: 'street', key: 'trapped', time: 'night', title: 'Last bus', type: 'Music video', note: 'Street light as key, one panel as edge', line: 'A bench under a sodium street light, a car idling behind.' },
  { room: 'office', key: 'boiling', time: 'night', title: 'The offer', type: 'Branded content', note: 'Hard side key, matched overs', line: 'A negotiation across a desk that goes wrong.' },
  { room: 'forest', key: 'coldwar', time: 'dusk', title: 'Campfire', type: 'Short film', note: 'Fire as key, one panel at dusk', line: 'The last conversation before they break camp.' },
  { room: 'warehouse', key: 'boiling', time: 'night', title: 'Handover', type: 'Commercial', note: 'High windows, hard backlight', line: 'Two people, a crate between them, nobody trusts anybody.' },
]

export function Cases() {
  return (
    <div className="landing">
      <MarketingNav />
      <div className="l-section m-page">
        <div className="slate-rule" />
        <h2>Cases</h2>
        <p className="sub">Example scenes planned in SceneMood. Open any of them in the studio to see how the set, the blocking and the light were built, and change them.</p>
        <div className="case-grid">
          {CASES.map((c) => (
            <article className="case" key={c.title}>
              <img src={`stills/${c.room}-${c.key}.jpg`} alt={`${c.title}: ${c.line}`} loading="lazy" />
              <div className="b">
                <span className="dim" style={{ fontSize: 12 }}>{c.type}</span>
                <h3>{c.title}</h3>
                <p className="muted" style={{ margin: 0 }}>{c.line}</p>
                <span className="mono dim" style={{ fontSize: 11.5 }}>{c.note}</span>
                <div><button className="btn sm" onClick={() => openSample(c.key, c.room, c.time)}>Open in studio <Icon name="arrowR" size={14} /></button></div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  )
}

const PLANS = [
  { name: 'Free', price: '$0', per: '', for: 'Try it on a real scene', items: ['2 scenes a month', '3 directions per scene', 'Draft reference frames with watermark', 'Shot plan view'] },
  { name: 'Project Pass', price: '$19', per: '/ 30 days', for: 'Crews who shoot now and then', items: ['Everything in Pro for one project', 'Does not renew on its own', 'Keeps the project read-only after'] },
  { name: 'Pro', price: '$29', per: '/ month', for: 'Directors, DPs, freelancers', feature: true, items: ['Unlimited scenes', '100 HD reference frames a month', 'PDF, CSV and call sheet export', 'Review links for clients'] },
  { name: 'Team', price: '$99', per: '/ month, 5 seats', for: 'Small production companies', items: ['Everything in Pro', 'Shared rooms, gear kits and assets', 'Client review with votes', '400 HD frames a month'] },
  { name: 'Education', price: '$15', per: '/ seat / term', for: 'Film schools', items: ['Team features', 'Learning mode', 'Teacher review on every plan', 'Equipment-room gear lists'] },
]

export function Pricing() {
  return (
    <div className="landing">
      <MarketingNav />
      <div className="l-section m-page">
        <div className="slate-rule" />
        <h2>Pricing</h2>
        <p className="sub">Crews work project by project, so you can pay for one project or subscribe. Drafts are always free; HD reference frames count toward a monthly allowance.</p>
        <div className="plans">
          {PLANS.map((p) => (
            <div key={p.name} className={'plan' + (p.feature ? ' feature' : '')}>
              <h3>{p.name}</h3>
              <div className="price">{p.price} <small>{p.per}</small></div>
              <span className="muted" style={{ fontSize: 13 }}>{p.for}</span>
              <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
              <a className={'btn sm' + (p.feature ? ' primary' : '')} href="#/login">{p.name === 'Free' ? 'Start free' : 'Choose ' + p.name}</a>
            </div>
          ))}
        </div>
        <h3 style={{ marginTop: 56, fontSize: 18 }}>What a scene costs us to run</h3>
        <div className="grid2" style={{ marginTop: 12 }}>
          <table className="tbl card">
            <thead><tr><th>Step</th><th>Calls</th><th>Cost</th></tr></thead>
            <tbody>
              <tr><td>Directions (plan, design ×4, review ×4)</td><td className="num">2 rounds</td><td className="num">≈ $0.08</td></tr>
              <tr><td>Natural-language edits</td><td className="num">20</td><td className="num">≈ $0.05</td></tr>
              <tr><td>Reference frames (1K)</td><td className="num">10</td><td className="num">≈ $0.68</td></tr>
              <tr><td>Frame checks against the plan</td><td className="num">10</td><td className="num">≈ $0.01</td></tr>
              <tr><td><b>Per scene</b></td><td /><td className="num"><b>≈ $0.82</b></td></tr>
            </tbody>
          </table>
          <div className="faq">
            <details open><summary>Why count HD frames?</summary><p>Reference images are over 80% of the model cost. Drafts stay unlimited; HD frames are what the allowance protects.</p></details>
            <details><summary>Can I cancel a Project Pass?</summary><p>It doesn&apos;t renew. After 30 days the project stays readable and exportable.</p></details>
            <details><summary>Is my script used for training?</summary><p>No. Only the lines you paste into the brief are sent, and teams can turn off data retention in Settings.</p></details>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export function Education() {
  return (
    <div className="landing">
      <MarketingNav />
      <div className="l-section m-page">
        <div className="slate-rule" />
        <h2>For film schools</h2>
        <p className="sub">Students plan with the gear your equipment room actually lends out. In learning mode they light the scene themselves first, and SceneMood critiques it before showing its own directions.</p>
        <div className="trust">
          <div><Icon name="learn" size={22} /><h3>Learning mode</h3><p>Students place lights first. The critique names the key-to-fill ratio, whether the key is motivated, and anything that breaks on set.</p></div>
          <div><Icon name="comment" size={22} /><h3>Teacher review</h3><p>Every plan has a review link. Teachers comment on the frame and the plan before a single light is checked out.</p></div>
          <div><Icon name="truck" size={22} /><h3>Equipment room lists</h3><p>Gear kits match the room&apos;s inventory, and each shot plan exports a checkout list.</p></div>
        </div>
        <div className="cta-band" style={{ marginTop: 40 }}>
          <div><h2 style={{ fontSize: 48 }}>$15 per seat per term</h2><p className="muted" style={{ margin: '8px 0 0' }}>Team features, learning mode and teacher review included.</p></div>
          <a className="btn primary lg" href="#/login">Start a class pilot</a>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export function Login() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Director')
  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setState((s) => ({ user: { name: name.trim(), email: email.trim(), role }, team: { ...s.team, members: s.team.members.map((m, i) => (i === 0 ? { ...m, name: name.trim(), role, email: email.trim() } : m)) } }))
    navigate('/app')
  }
  return (
    <div className="login">
      <div className="login-art"><img src="story/overview-work.jpg" alt="" /></div>
      <div className="login-form">
        <form onSubmit={submit}>
          <a href="#/" className="logo" style={{ marginBottom: 12 }}><Logo size={26} /></a>
          <h1 className="login-h">Start a scene</h1>
          <p className="muted" style={{ margin: 0 }}>This prototype keeps your work in this browser. No password needed.</p>
          <label className="field"><span>Your name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya Chen" autoFocus required /></label>
          <label className="field"><span>Email (optional)</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maya@studio.com" /></label>
          <label className="field"><span>Your role on set</span>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>{['Director', 'Producer', 'DP', 'Production designer', 'Gaffer', 'Student'].map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <button className="btn primary lg block" type="submit">Continue</button>
          <a className="btn ghost" href="#/">Back to the site</a>
        </form>
      </div>
    </div>
  )
}
