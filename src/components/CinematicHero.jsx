import { useEffect, useRef } from 'react'
import { useStore } from '../store.js'
import { mountCinematicEffect } from './cinematicEffect.js'
import Icon from './Icons.jsx'
import './cinematic.css'

export default function CinematicHero({ onDemo }) {
  const root = useRef(null)
  const user = useStore((s) => s.user)
  useEffect(() => mountCinematicEffect(root.current), [])
  return <div ref={root} className="cinema-shell">
    <section className="sm-hero" aria-labelledby="cinema-title">
      <img className="sm-backdrop" src="hero/scenemood-cinematic.webp" alt="Two actors surrounded by three film lights, with soft vermilion and blue light dispersion." fetchPriority="high" />
      <div className="cinema-copy">
        <h1 id="cinema-title">Set the mood.<br />Shape the scene.</h1>
        <p>Plan your shots, lighting, and space. Together.</p>
        <div className="cinema-actions">
          <a className="btn primary lg" href={user ? '#/app' : '#/login'}>Start a scene <span aria-hidden="true">↗</span></a>
          <button className="btn lg" onClick={onDemo}><Icon name="play" size={15} />Explore a demo</button>
        </div>
      </div>
    </section>
  </div>
}
