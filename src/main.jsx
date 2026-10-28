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
import { Library, Insights, Settings } from './pages/Workspace.jsx'
import { useStore } from './store.js'

const routeOf = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0]

const APP = {
  '/app': Projects, '/app/project': ProjectPage, '/setup': Setup, '/directions': Directions, '/studio': Studio,
  '/review': Review, '/plan': ShotPlan, '/library': Library, '/insights': Insights, '/settings': Settings,
}
const MARKETING = { '/': Landing, '/cases': Cases, '/pricing': Pricing, '/education': Education, '/login': Login }
const TITLES = { '/': 'SceneMood', '/cases': 'Cases · SceneMood', '/pricing': 'Pricing · SceneMood', '/education': 'Education · SceneMood', '/login': 'Sign in · SceneMood', '/app': 'Projects · SceneMood', '/setup': 'Set up · SceneMood', '/directions': 'Directions · SceneMood', '/studio': 'Studio · SceneMood', '/review': 'Review · SceneMood', '/plan': 'Shot plan · SceneMood' }

function App() {
  const [route, setRoute] = useState(routeOf())
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    const on = () => { setRoute(routeOf()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { document.title = TITLES[route] || 'SceneMood' }, [route])
  let body
  if (route.startsWith('/share/')) body = <Share code={route.slice(7)} />
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
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
