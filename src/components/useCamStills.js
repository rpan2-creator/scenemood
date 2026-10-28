import { useEffect, useState } from 'react'
import { renderStill } from '../engine/SceneEngine.js'

const cache = new Map()
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

// Renders one graded still per camera of a scene (cached by content), returns { camId: dataURL }
export function useCamStills(scene, w = 960) {
  const [urls, setUrls] = useState({})
  const key = scene ? hash(JSON.stringify(scene)) : ''
  useEffect(() => {
    if (!scene) return
    let alive = true
    const next = {}
    scene.cameras.forEach((c) => { const k = `${key}:${c.id}:${w}`; if (cache.has(k)) next[c.id] = cache.get(k) })
    setUrls(next)
    ;(async () => {
      for (const c of scene.cameras) {
        const k = `${key}:${c.id}:${w}`
        if (cache.has(k)) continue
        const url = await renderStill({ ...scene, activeCam: c.id }, { w })
        cache.set(k, url)
        if (!alive) return
        setUrls((u) => ({ ...u, [c.id]: url }))
      }
    })()
    return () => { alive = false }
  }, [key, w])
  return urls
}
