import { useEffect, useState } from 'react'
import Logo from '../components/Logo.jsx'
import { getState, setState, openScene, navigate } from '../store.js'
import { inflate, vote, toast } from '../actions.js'
import { readFeedback, mergeFeedback } from '../feedback.js'

// Opening a reviewer's reply link adds their notes to the right scene and lands on Review.
export default function Reply({ code }) {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const payload = JSON.parse(await inflate(code))
        const s0 = getState()
        const proj = s0.projects.find((p) => p.id === payload.projectId)
        if (!proj || !proj.scenes.some((x) => x.id === payload.sceneId)) throw new Error('These notes are for a scene that is not in this browser. Open the link on the computer you planned the scene on.')
        openScene(payload.projectId, payload.sceneId)
        const s = getState()
        const imported = readFeedback(payload, payload.projectId, payload.sceneId, s.scene?.cameras || [])
        const before = s.comments.length
        setState((st) => ({ comments: mergeFeedback(st.comments, imported) }))
        const added = getState().comments.length - before
        if (payload.vote && s.directions.some((d) => d.id === payload.vote)) vote(payload.vote, payload.reviewer || 'Reviewer')
        if (!on) return
        navigate('/review')
        toast(added ? `${added} note${added === 1 ? '' : 's'} from ${payload.reviewer} added to the review` : `Notes from ${payload.reviewer} were already in the review`)
      } catch (e) { if (on) setMsg(e.message || 'This reply link does not open.') }
    })()
    return () => { on = false }
  }, [code])
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <Logo size={26} />
      {msg ? <><h1 className="display" style={{ fontSize: 40 }}>These notes didn’t open</h1><p className="muted">{msg}</p><a className="btn" href="#/app">Go to my projects</a></>
        : <p className="row muted"><span className="spinner" /> Adding the notes to your review…</p>}
    </div>
  )
}
