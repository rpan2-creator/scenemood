import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import TopBar from './components/TopBar.jsx'
import Landing from './pages/Landing.jsx'
import Setup from './pages/Setup.jsx'
import Directions from './pages/Directions.jsx'
import Studio from './pages/Studio.jsx'
import ShotPlan from './pages/ShotPlan.jsx'
import { useStore } from './store.js'

const routeOf = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0]

function App() {
  const [route, setRoute] = useState(routeOf())
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    const on = () => { setRoute(routeOf()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  if (route === '/' || route === '') return <Landing />
  const Page = { '/setup': Setup, '/directions': Directions, '/studio': Studio, '/plan': ShotPlan }[route] || Landing
  return (
    <div className="app">
      <TopBar route={route} />
      <Page />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
