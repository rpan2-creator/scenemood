import { useStore } from '../store.js'
import { stopDemo, startDemo, DEMO_STEPS } from '../demo/autopilot.js'

// Caption strip for the autoplay demo: which step, what the AI is doing, and a way out.
export default function DemoBar() {
  const demo = useStore((s) => s.demo)
  if (!demo) return null
  return (
    <div className="demo-bar" role="status" aria-live="polite">
      <div className="demo-prog" aria-hidden="true">{DEMO_STEPS.map((_, i) => <i key={i} className={i < demo.i ? 'done' : i === demo.i ? 'on' : ''} />)}</div>
      <div className="demo-row">
        <span className="demo-step mono"><i className={demo.running ? 'live' : ''} />{demo.step}</span>
        <p key={demo.i}>{demo.text}</p>
        {demo.done
          ? <><button className="btn sm" onClick={startDemo}>Play again</button><button className="btn sm primary" onClick={stopDemo}>Explore it yourself</button></>
          : <button className="btn sm" onClick={stopDemo}>Stop the demo</button>}
      </div>
    </div>
  )
}
