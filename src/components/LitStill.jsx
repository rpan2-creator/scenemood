import { useEffect, useRef } from 'react'

// John's still, lit like a set: at rest it is a dark black-and-white frame and only the
// silhouettes read. Wherever the light falls (the cursor, or a slow idle sweep when nobody
// is pointing) the frame comes up in full colour: warm-white bodies, vermilion and blue at
// their edges. The light trails the cursor slightly, like a lamp on a hand.
export default function LitStill({ fit = 'contain', className = '', children }) {
  const el = useRef(null)
  useEffect(() => {
    const root = el.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let tx = 0.62, ty = 0.55, x = tx, y = ty, over = false, raf, t0 = performance.now()
    const onMove = (e) => { const r = root.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width; ty = (e.clientY - r.top) / r.height; over = true }
    const onLeave = () => { over = false }
    root.addEventListener('pointermove', onMove); root.addEventListener('pointerleave', onLeave)
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!over) { const t = (performance.now() - t0) / 1000; tx = 0.5 + Math.sin(t * 0.32) * 0.28; ty = 0.6 + Math.sin(t * 0.21) * 0.12 }
      const k = reduce ? 1 : over ? 0.14 : 0.04
      x += (tx - x) * k; y += (ty - y) * k
      root.style.setProperty('--lx', `${(x * 100).toFixed(2)}%`); root.style.setProperty('--ly', `${(y * 100).toFixed(2)}%`)
    }
    tick()
    return () => { cancelAnimationFrame(raf); root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerleave', onLeave) }
  }, [])
  return (
    <div ref={el} className={'lit-still ' + className} data-fit={fit}>
      <img className="ls-dark" src="hero/scenemood-cinematic.webp?v=3" alt="Two stand-ins on a bench, lit by three film lights" />
      <img className="ls-lit" src="hero/scenemood-cinematic.webp?v=3" alt="" aria-hidden="true" />
      <div className="ls-grain" aria-hidden="true" />
      {children}
    </div>
  )
}
