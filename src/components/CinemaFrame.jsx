import { useEffect, useRef } from 'react'
import { mountCinematicEffect } from './cinematicEffect.js'

// John's cinematic still: stand-ins under three film lights. A small WebGL pass splits the
// colour of the light as the cursor moves, like a lens catching tungsten on one side and
// daylight on the other. Falls back to the plain image without WebGL.
export default function CinemaFrame({ className = '', fit = 'contain', children }) {
  const root = useRef(null)
  useEffect(() => mountCinematicEffect(root.current), [])
  return (
    <div ref={root} className={'cine ' + className} data-fit={fit}>
      <section className="sm-hero">
        <img className="sm-backdrop" src="hero/scenemood-cinematic.webp?v=3" alt="Two stand-ins on a bench, lit by three film lights" loading="lazy" />
        {children}
      </section>
    </div>
  )
}
