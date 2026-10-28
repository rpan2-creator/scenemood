import Logo from './Logo.jsx'
import Icon from './Icons.jsx'
import { useStore, activeProject, activeSceneMeta, navigate, setSceneStatus, getState } from '../store.js'
import { runGeneration, toast } from '../actions.js'
import { runChecks } from '../engine/checks.js'

export const STEPS = [
  { path: '/setup', label: 'Set up', status: 'setup' },
  { path: '/directions', label: 'Directions', status: 'directions' },
  { path: '/studio', label: 'Studio', status: 'studio' },
  { path: '/review', label: 'Review', status: 'review' },
  { path: '/plan', label: 'Shot plan', status: 'plan' },
]
const ORDER = STEPS.map((s) => s.status)

// The one button on the right always says what comes next in the workflow.
function nextAction(route, s) {
  if (route === '/setup') return { label: 'Generate directions', run: () => { runGeneration(); navigate('/directions') } }
  if (route === '/directions') return s.scene ? { label: 'Continue in studio', run: () => navigate('/studio') } : null
  if (route === '/studio') return { label: 'Send for review', run: () => { const st = getState(); if (['setup', 'directions', 'studio'].includes(st.status)) setSceneStatus('review'); navigate('/review') } }
  if (route === '/review') return { label: 'Lock shot plan', run: () => {
    const st = getState()
    const blocking = runChecks(st.scene, st.setup.kit).filter((c) => c.level === 'error')
    if (blocking.length) { toast(`${blocking.length} blocking issue${blocking.length > 1 ? 's' : ''} left. Fix ${blocking.length > 1 ? 'them' : 'it'} in the studio first.`); return }
    setSceneStatus('plan'); navigate('/plan'); toast('Shot plan locked')
  } }
  return null
}

export default function TopBar({ route }) {
  const s = useStore((st) => ({ projects: st.projects, activeProjectId: st.activeProjectId, activeSceneId: st.activeSceneId, status: st.status, scene: st.scene, directions: st.directions, user: st.user }))
  const proj = activeProject(s), meta = activeSceneMeta(s)
  const inWorkflow = STEPS.some((x) => x.path === route)
  const reached = Math.max(ORDER.indexOf(s.status || 'setup'), STEPS.findIndex((x) => x.path === route))
  const unlocked = { '/setup': true, '/directions': s.directions.length > 0 || s.status !== 'setup', '/studio': !!s.scene, '/review': !!s.scene, '/plan': !!s.scene }
  const next = nextAction(route, s)
  return (
    <header className="topbar">
      <div className="tb-left">
        <Logo size={24} />
        <div className="crumbs">
          <a href="#/app">Projects</a>
          {proj && <><span className="dim">/</span><a href="#/app/project">{proj.name}</a></>}
          {meta && inWorkflow && <><span className="dim">/</span><b>Scene {meta.num}</b></>}
        </div>
      </div>
      {inWorkflow ? (
        <nav className="rail" aria-label="Workflow">
          {STEPS.map((st, i) => (
            <span key={st.path} style={{ display: 'contents' }}>
              {i > 0 && <span className="sep" />}
              <a href={'#' + st.path} className={[route === st.path ? 'on' : '', i < reached && route !== st.path ? 'done' : '', unlocked[st.path] ? '' : 'locked'].join(' ')} aria-current={route === st.path ? 'step' : undefined}>
                <span className="n">{i + 1}</span><span className="lbl">{st.label}</span>
              </a>
            </span>
          ))}
        </nav>
      ) : (
        <nav className="rail" aria-label="Workspace">
          <a href="#/app" className={route.startsWith('/app') ? 'on' : ''}><Icon name="folder" size={15} /><span className="lbl">Projects</span></a>
          <a href="#/library" className={route === '/library' ? 'on' : ''}><Icon name="book" size={15} /><span className="lbl">Team library</span></a>
          <a href="#/insights" className={route === '/insights' ? 'on' : ''}><Icon name="chart" size={15} /><span className="lbl">Insights</span></a>
          <a href="#/settings" className={route === '/settings' ? 'on' : ''}><Icon name="gear" size={15} /><span className="lbl">Settings</span></a>
        </nav>
      )}
      <div className="tb-right">
        <span className="chip dash" title="This build simulates the model calls. Connect an API in Settings to use live models.">AI simulated</span>
        {next && <button className="btn primary sm" onClick={next.run}>{next.label} <Icon name="arrowR" size={14} /></button>}
        <a className="avatar" href="#/settings" title="Account">{(s.user?.name || 'You').slice(0, 1).toUpperCase()}</a>
      </div>
    </header>
  )
}
