import Logo from './Logo.jsx'
import { useStore } from '../store.js'

const STEPS = [
  { path: '/setup', label: 'Set up' },
  { path: '/directions', label: 'Directions' },
  { path: '/studio', label: 'Studio' },
  { path: '/plan', label: 'Shot plan' },
]

export default function TopBar({ route }) {
  const { project, directions, scene } = useStore((s) => ({ project: s.project, directions: s.directions, scene: s.scene }))
  const enabled = { '/setup': true, '/directions': true, '/studio': !!scene, '/plan': !!scene }
  return (
    <header className="topbar">
      <Logo size={22} />
      <div className="crumbs">
        <span>{project.name}</span>
        <span className="dim">/</span>
        <b>Scene {project.scene}</b>
      </div>
      <nav className="steps" aria-label="Workflow">
        {STEPS.map((s, i) => (
          <a key={s.path} href={'#' + s.path} className={(route === s.path ? 'on ' : '') + (enabled[s.path] ? '' : 'disabled')} aria-current={route === s.path ? 'page' : undefined}>
            <span className="n">{i + 1}</span>
            {s.label}
            {s.path === '/directions' && directions.length > 0 && <span className="dim mono" style={{ fontSize: 11 }}>{directions.length}</span>}
          </a>
        ))}
      </nav>
      <div className="topbar-right">
        <span className="chip sim" title="This build simulates the model calls. Connect an API key to use live models.">AI simulated</span>
      </div>
    </header>
  )
}
