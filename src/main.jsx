import DemoBar from './components/DemoBar.jsx'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import TopBar from './components/TopBar.jsx'
import Landing from './pages/Landing.jsx'
import { Cases, Pricing, Education, Login } from './pages/Marketing.jsx'
import Projects, { ProjectPage } from './pages/Projects.jsx'
import Setup from './pages/Setup.jsx'
import Directions from './pages/Directions.jsx'
import Studio from './pages/Studio.jsx'
import Review from './pages/Review.jsx'
import ShotPlan from './pages/ShotPlan.jsx'
import Share from './pages/Share.jsx'
import Reply from './pages/Reply.jsx'
import { Library, Insights, Settings } from './pages/Workspace.jsx'
import { useStore, getState, setState } from './store.js'

const routeOf = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0]

const APP = {
  '/app': Projects, '/app/project': ProjectPage, '/setup': Setup, '/directions': Directions, '/studio': Studio,
  '/review': Review, '/plan': ShotPlan, '/library': Library, '/insights': Insights, '/settings': Settings,
}
const MARKETING = { '/': Landing, '/cases': Cases, '/pricing': Pricing, '/education': Education, '/login': Login }
const TITLES = { '/': 'SceneMood', '/cases': 'Cases · SceneMood', '/pricing': 'Pricing · SceneMood', '/education': 'Education · SceneMood', '/login': 'Sign in · SceneMood', '/app': 'Projects · SceneMood', '/setup': 'Set up · SceneMood', '/directions': 'Directions · SceneMood', '/studio': 'Studio · SceneMood', '/review': 'Review · SceneMood', '/plan': 'Storyboard · SceneMood' }

// The cursor is a work light: whatever surface is under it gets a soft pool of light.
const LIT = '.card, .sheet, .acc, .brief-card, .cast-row, .insp-card, .dir, .proj, .case, .plan, .faq details, .b-loc, .btn, .dock-light'
// Big headings are lit too: the type brightens where the cursor's light falls on it.
const LIT_TYPE = '.page-head h1, .b-sec h2, .stage-t, .b-close h2, .ss h2, .setup-title, .dir-head h3'
if (typeof document !== 'undefined' && !window.matchMedia?.('(hover: none)').matches) {
  let lastEl = null
  document.addEventListener('pointermove', (e) => {
    for (const t of document.querySelectorAll(LIT_TYPE)) {
      const r = t.getBoundingClientRect()
      if (r.bottom < -200 || r.top > innerHeight + 200) continue
      t.style.setProperty('--tx', `${e.clientX - r.left}px`); t.style.setProperty('--ty', `${e.clientY - r.top}px`)
    }
    const el = e.target.closest?.(LIT)
    if (lastEl && lastEl !== el) { lastEl.style.removeProperty('--mx'); lastEl.style.removeProperty('--my') }
    lastEl = el
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, { passive: true })
}

function App() {
  const [route, setRoute] = useState(routeOf())
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    const on = () => { if (getState().pending && routeOf() !== '/studio') { window.location.hash = '#/studio'; setState({ toast: 'Accept or discard the AI preview before leaving the studio.' }); return }; setRoute(routeOf()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { document.title = TITLES[route] || 'SceneMood' }, [route])
  let body
  if (route.startsWith('/share/')) body = <Share code={route.slice(7)} />
  else if (route.startsWith('/reply/')) body = <Reply code={route.slice(7)} />
  else if (MARKETING[route]) { const P = MARKETING[route]; body = <P /> }
  else {
    const P = APP[route] || Projects
    body = (
      <div className="app">
        <TopBar route={APP[route] ? route : '/app'} />
        <P />
      </div>
    )
  }
  return (
    <>
      {body}
      <DemoBar />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
