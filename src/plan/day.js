// Orders the scenes of one shoot day the way an AD would: finish a location before moving the
// company, day before night inside a location, and says what changes between one scene and the next.
const TIME_ORDER = { day: 0, dusk: 1, night: 2 }
const TIME = { day: 'day', dusk: 'dusk', night: 'night' }

export function sceneFacts(item) {
  const setup = item.setup || {}
  const scene = item.scene
  const room = scene?.room || setup.room || {}
  const brief = setup.brief || {}
  const cast = (scene?.actors || []).map((a) => a.name)
  const castFallback = ['actor_a', 'actor_b', 'actor_c', 'actor_d', 'actor_e', 'actor_f'].slice(0, brief.actors || 2).map((id) => brief.names?.[id]).filter(Boolean)
  const lights = {}
  for (const l of scene?.lights || []) lights[l.fixture] = (lights[l.fixture] || 0) + 1
  return {
    id: item.id, num: item.num, name: item.name,
    location: `${room.kind === 'exterior' ? 'EXT' : 'INT'}. ${(room.name || 'Location').toUpperCase()}`,
    locKey: setup.templateId || room.template || room.name,
    time: scene?.time || brief.time || 'day',
    cast: cast.length ? cast : castFallback,
    lights, setups: scene?.cameras?.length || 0, planned: !!scene,
  }
}

export function shootingDay(items) {
  const facts = items.map(sceneFacts)
  const firstSeen = new Map()
  facts.forEach((f, i) => { if (!firstSeen.has(f.locKey)) firstSeen.set(f.locKey, i) })
  const order = [...facts].sort((a, b) => firstSeen.get(a.locKey) - firstSeen.get(b.locKey) || TIME_ORDER[a.time] - TIME_ORDER[b.time] || a.num - b.num)
  return order.map((f, i) => {
    const p = order[i - 1]
    const changes = []
    if (!p) changes.push('First up: load in, dress the location and light it.')
    else {
      if (p.locKey !== f.locKey) changes.push(`Company move: ${p.location} to ${f.location}. Strike the set, pack lights, load in again.`)
      else changes.push('Same location: keep the dressing, re-light only.')
      if (p.time !== f.time) changes.push(`Time of day goes from ${TIME[p.time]} to ${TIME[f.time]}: change window and practical lighting.`)
      const arriving = f.cast.filter((n) => !p.cast.includes(n)), leaving = p.cast.filter((n) => !f.cast.includes(n))
      if (arriving.length) changes.push(`Cast in: ${arriving.join(', ')}.`)
      if (leaving.length) changes.push(`Cast wrapped: ${leaving.join(', ')}.`)
      const add = Object.entries(f.lights).filter(([k, n]) => n > (p.lights[k] || 0)).map(([k, n]) => `${n - (p.lights[k] || 0)} × ${k.replace(/_/g, ' ')}`)
      if (add.length) changes.push(`More lights: ${add.join(', ')}.`)
    }
    if (!f.planned) changes.push('Not planned yet: open it to break it down.')
    return { ...f, slot: i + 1, changes }
  })
}
