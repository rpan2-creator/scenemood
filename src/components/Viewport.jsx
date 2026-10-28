import { useEffect, useRef } from 'react'
import { SceneEngine } from '../engine/SceneEngine.js'

// Mounts one SceneEngine and keeps it in sync with props.
export default function Viewport({ scene, pending, selection, mode = 'studio', view = 'set', ui, onSelect, onTransform, onFrameRect, onReady, camPos, target, className = 'vp' }) {
  const ref = useRef(null)
  const eng = useRef(null)
  const cbs = useRef({})
  cbs.current = { onSelect, onTransform, onFrameRect }

  useEffect(() => {
    const e = new SceneEngine(ref.current, {
      mode,
      onSelect: (h) => cbs.current.onSelect?.(h),
      onTransform: (k, id, c) => cbs.current.onTransform?.(k, id, c),
      onFrameRect: (r) => cbs.current.onFrameRect?.(r),
    })
    if (camPos) e.setCam.position.set(...camPos)
    if (target) e.focusOn(target)
    eng.current = e
    onReady?.(e)
    return () => { e.dispose(); eng.current = null; onReady?.(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => { eng.current?.setView(view) }, [view])
  useEffect(() => {
    if (!eng.current) return
    const prev = eng.current.ui.cones
    eng.current.setUI(ui || {})
    if (ui && prev !== ui.cones) eng.current.dynKey = null
    eng.current.setScene(scene, { pending, selection })
  }, [scene, pending, selection, ui])

  return <div ref={ref} className={className} />
}
