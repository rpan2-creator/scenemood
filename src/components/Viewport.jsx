import { useEffect, useRef } from 'react'
import { SceneEngine } from '../engine/SceneEngine.js'

// Mounts one SceneEngine and keeps it in sync with props.
export default function Viewport({ scene, pending, selection, mode = 'studio', view = 'set', ui, onSelect, onTransform, onFrameRect, onLabels, onReady, camPos, target, showcase, className = 'vp' }) {
  const ref = useRef(null)
  const eng = useRef(null)
  const cbs = useRef({})
  cbs.current = { onSelect, onTransform, onFrameRect, onLabels }

  useEffect(() => {
    const e = new SceneEngine(ref.current, {
      mode,
      onSelect: (h) => cbs.current.onSelect?.(h),
      onTransform: (k, id, c) => cbs.current.onTransform?.(k, id, c),
      onFrameRect: (r) => cbs.current.onFrameRect?.(r),
      onLabels: (l, h) => cbs.current.onLabels?.(l, h),
    })
    if (camPos) e.setCam.position.set(...camPos)
    if (target) { e.controls.target.set(...target); e.controls.update() }
    eng.current = e
    onReady?.(e)
    return () => { e.dispose(); eng.current = null; onReady?.(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => { eng.current?.setView(view) }, [view])
  useEffect(() => { if (ui) eng.current?.setUI(ui) }, [ui?.cones, ui?.grid, ui?.haze])
  useEffect(() => { eng.current?.setScene(scene, { pending, selection }) }, [scene, pending, selection])
  useEffect(() => { if (showcase !== undefined) eng.current?.setShowcase(showcase) }, [showcase])

  return <div ref={ref} className={className} />
}
