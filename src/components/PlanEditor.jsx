import { useEffect, useMemo, useRef, useState } from 'react'
import { getAsset } from '../data/assets.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { wallFrame, openingCenter } from '../data/rooms.js'
import { hfov, ASPECTS } from '../engine/checks.js'

// A top-down editor drawn in metres. Room is centred on the origin; +x is right, +z is toward
// the front (bottom of the plan). Everything is dragged here with snapping, and changes are
// committed once on pointer-up so the 3D view and history don't churn while dragging.

const SNAP = 0.05
const snap = (v, free) => (free ? Math.round(v * 100) / 100 : Math.round(v / SNAP) * SNAP)
const r2 = (v) => Math.round(v * 100) / 100
const WALL_NAME = { N: 'back', S: 'front', W: 'left', E: 'right' }
const CAT_FILL = { Seating: '#4a5568', Tables: '#6b5a48', Practicals: '#7a6236', Storage: '#5b5048', 'Soft goods': '#5d4a52', Decor: '#4c5a4c' }

function nearestWall(room, x, z) {
  const c = [['N', Math.abs(z + room.d / 2)], ['S', Math.abs(room.d / 2 - z)], ['W', Math.abs(x + room.w / 2)], ['E', Math.abs(room.w / 2 - x)]]
  c.sort((a, b) => a[1] - b[1])
  return c[0][0]
}
function alongWall(room, wall, x, z) {
  const f = wallFrame(room, wall)
  return (x - f.o[0]) * f.t[0] + (z - f.o[1]) * f.t[1]
}

export default function PlanEditor({
  room, objects = [], actors = [], lights = [], cameras = [], activeCam, aspect = '2.39',
  editRoom = false, editKinds = ['objects'], selection, onSelect, onRoom, onMove, onDropAsset, onDelete, onRotate, compact = false,
}) {
  const svgRef = useRef(null)
  const [drag, setDrag] = useState(null) // { kind, id, mode, ... }
  const [draft, setDraft] = useState(null) // live overrides while dragging
  const [hover, setHover] = useState(null)
  const pad = compact ? 0.85 : 1.1
  const R = draft?.room || room
  // the view box follows the committed room only, so it doesn't rescale under the pointer mid-drag
  const vb = useMemo(() => [-room.w / 2 - pad, -room.d / 2 - pad, room.w + pad * 2, room.d + pad * 2], [room.w, room.d, pad])
  const px = vb[2] / 900 // ~1 screen px in metres at a typical size, for strokes and text

  const toWorld = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: p.x, z: p.y }
  }

  const itemOf = (kind, id) => ({ objects, actors, lights, cameras }[kind] || []).find((x) => x.id === id)
  const live = (kind, it) => (draft && draft.kind === kind && draft.id === it.id ? { ...it, ...draft.changes } : it)

  const begin = (e, d) => {
    e.stopPropagation()
    e.preventDefault()
    svgRef.current.setPointerCapture(e.pointerId)
    const p = toWorld(e)
    if (d.kind && d.id) onSelect?.({ kind: d.kind, id: d.id })
    setDrag({ ...d, start: p, moved: false })
  }

  const onPointerMove = (e) => {
    if (!drag) {
      return
    }
    const p = toWorld(e)
    const free = e.altKey
    const moved = drag.moved || Math.hypot(p.x - drag.start.x, p.z - drag.start.z) > 0.03
    if (!moved) return
    if (!drag.moved) setDrag((d) => ({ ...d, moved: true }))
    if (drag.mode === 'move') {
      const it = itemOf(drag.kind, drag.id)
      const x = snap(it.x + (p.x - drag.start.x), free), z = snap(it.z + (p.z - drag.start.z), free)
      const m = drag.kind === 'objects' ? 0.05 : 0.2
      setDraft({ kind: drag.kind, id: drag.id, changes: { x: Math.max(-R.w / 2 + m, Math.min(R.w / 2 - m, x)), z: Math.max(-R.d / 2 + m, Math.min(R.d / 2 - m, z)) } })
    } else if (drag.mode === 'rotate') {
      const it = itemOf(drag.kind, drag.id)
      let a = Math.atan2(p.x - it.x, p.z - it.z)
      if (!free) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12)
      setDraft({ kind: drag.kind, id: drag.id, changes: { rot: r2(a) } })
    } else if (drag.mode === 'w' || drag.mode === 'd' || drag.mode === 'wd') {
      const w = drag.mode !== 'd' ? Math.max(2, Math.min(12, snap(Math.abs(p.x) * 2, free))) : room.w
      const d = drag.mode !== 'w' ? Math.max(2, Math.min(12, snap(Math.abs(p.z) * 2, free))) : room.d
      setDraft({ room: { ...room, w: r2(w), d: r2(d) } })
    } else if (drag.mode === 'opening' || drag.mode === 'outlet') {
      const wall = nearestWall(room, p.x, p.z)
      const len = wallFrame(room, wall).len
      const list = drag.mode === 'opening' ? room.openings : room.outlets
      const op = list[drag.index]
      const half = drag.mode === 'opening' ? op.width / 2 + 0.1 : 0.15
      const at = Math.max(-len / 2 + half, Math.min(len / 2 - half, snap(alongWall(room, wall, p.x, p.z), free)))
      const next = list.map((o, i) => (i === drag.index ? { ...o, wall, at: r2(at) } : o))
      setDraft({ room: { ...room, [drag.mode === 'opening' ? 'openings' : 'outlets']: next } })
    }
  }

  const onPointerUp = () => {
    if (!drag) return
    if (draft) {
      if (draft.room) {
        // keep furniture inside the resized room
        const rr = draft.room
        const fixed = objects.map((o) => ({ ...o, x: r2(Math.max(-rr.w / 2 + 0.1, Math.min(rr.w / 2 - 0.1, o.x))), z: r2(Math.max(-rr.d / 2 + 0.1, Math.min(rr.d / 2 - 0.1, o.z))) }))
        const ops = rr.openings.map((o) => { const len = wallFrame(rr, o.wall).len; return { ...o, at: r2(Math.max(-len / 2 + o.width / 2 + 0.1, Math.min(len / 2 - o.width / 2 - 0.1, o.at))) } })
        onRoom?.({ ...rr, openings: ops }, fixed)
      } else if (draft.kind) {
        onMove?.(draft.kind, draft.id, draft.changes)
      }
    }
    setDrag(null)
    setDraft(null)
  }

  // keyboard on the focused plan
  const onKeyDown = (e) => {
    const sel = selection
    if (!sel?.id) return
    const it = itemOf(sel.kind, sel.id)
    if (!it || !editKinds.includes(sel.kind)) return
    const step = e.shiftKey ? 0.25 : 0.05
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (mv) { e.preventDefault(); onMove?.(sel.kind, sel.id, { x: r2(it.x + mv[0]), z: r2(it.z + mv[1]) }); return }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); onMove?.(sel.kind, sel.id, { rot: r2((it.rot || 0) + (e.shiftKey ? -1 : 1) * Math.PI / 12) }) }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.kind !== 'actors') { e.preventDefault(); onDelete?.(sel.kind, sel.id) }
  }

  const onDrop = (e) => {
    const asset = e.dataTransfer.getData('text/asset')
    if (!asset) return
    e.preventDefault()
    const p = toWorld(e)
    onDropAsset?.(asset, r2(Math.max(-room.w / 2 + 0.2, Math.min(room.w / 2 - 0.2, snap(p.x)))), r2(Math.max(-room.d / 2 + 0.2, Math.min(room.d / 2 - 0.2, snap(p.z)))))
  }

  useEffect(() => { if (!drag) setDraft(null) }, [drag])

  const sel = selection?.id
  const wallT = 0.12
  const fs = Math.max(0.11, vb[2] / 70)

  // ---- drawing helpers
  const wedge = (x, z, ax, az, half, len) => {
    const a = Math.atan2(az - z, ax - x)
    const p1 = [x + Math.cos(a - half) * len, z + Math.sin(a - half) * len]
    const p2 = [x + Math.cos(a + half) * len, z + Math.sin(a + half) * len]
    return `M${x},${z} L${p1[0]},${p1[1]} A${len},${len} 0 0 1 ${p2[0]},${p2[1]} Z`
  }
  const selectable = (kind) => editKinds.includes(kind) || kind === 'cameras' || kind === 'actors' || kind === 'lights'

  return (
    <svg
      ref={svgRef}
      className={'plan-editor' + (drag?.moved ? ' dragging' : '')}
      style={{ overflow: 'visible' }}
      viewBox={vb.join(' ')}
      preserveAspectRatio="xMidYMid meet"
      tabIndex={0}
      role="application"
      aria-label={`Floor plan of ${room.name}, ${room.w} by ${room.d} metres. Drag to edit; arrow keys nudge the selection, R rotates, Delete removes.`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerDown={() => onSelect?.(null)}
      onKeyDown={onKeyDown}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('text/asset')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
      onDrop={onDrop}
    >
      <defs>
        <pattern id="pe-grid" width="0.5" height="0.5" patternUnits="userSpaceOnUse" x={-R.w / 2} y={-R.d / 2}>
          <path d="M 0.5 0 L 0 0 0 0.5" fill="none" stroke="#4a4d54" strokeWidth={px * 0.9} />
        </pattern>
      </defs>

      {/* floor and grid */}
      <rect x={-R.w / 2} y={-R.d / 2} width={R.w} height={R.d} fill="#33353a" onPointerDown={(e) => { if (editRoom) { e.stopPropagation(); onSelect?.({ kind: 'room' }) } }} />
      <rect x={-R.w / 2} y={-R.d / 2} width={R.w} height={R.d} fill="url(#pe-grid)" pointerEvents="none" />

      {/* light beams under the furniture */}
      {lights.map((l0) => {
        const l = live('lights', l0)
        const fx = FIXTURES[l.fixture]
        if (!fx || l.on === false) return null
        const len = Math.min(3, Math.hypot(l.aim[0] - l.x, l.aim[2] - l.z) + 0.5)
        return <path key={'b' + l.id} d={wedge(l.x, l.z, l.aim[0], l.aim[2], Math.min(1.1, (fx.beam / 2) * Math.PI / 180), len)} fill={cctToHex(l.cct)} opacity={0.1 + l.intensity * 0.15} pointerEvents="none" />
      })}

      {/* furniture */}
      {[...objects].sort((p, q) => (getAsset(q.asset)?.flat ? 1 : 0) - (getAsset(p.asset)?.flat ? 1 : 0)).map((o0) => {
        const o = live('objects', o0)
        const a = getAsset(o.asset)
        if (!a) return null
        const isSel = sel === o.id
        const canEdit = editKinds.includes('objects')
        const down = canEdit ? (e) => begin(e, { kind: 'objects', id: o.id, mode: 'move' }) : (e) => { e.stopPropagation(); onSelect?.({ kind: 'objects', id: o.id }) }
        if (a.wall) {
          const wall = nearestWall(R, o.x, o.z)
          const f = wallFrame(R, wall)
          const at = alongWall(R, wall, o.x, o.z)
          const cx = f.o[0] + f.t[0] * at + f.n[0] * 0.06, cz = f.o[1] + f.t[1] * at + f.n[1] * 0.06
          const horiz = wall === 'N' || wall === 'S'
          return <rect key={o.id} className={'pe-item' + (isSel ? ' sel' : '')} x={cx - (horiz ? a.size[0] / 2 : 0.05)} y={cz - (horiz ? 0.05 : a.size[0] / 2)} width={horiz ? a.size[0] : 0.1} height={horiz ? 0.1 : a.size[0]} fill="#8a7f6c" onPointerDown={down}><title>{a.name}</title></rect>
        }
        const [w, d] = a.size
        const deg = (-(o.rot || 0) * 180) / Math.PI
        const round = ['coffee_round', 'plant_tall', 'plant_small', 'pouf', 'stool', 'cushion'].includes(a.id)
        const small = a.onTable || a.hang
        const fill = a.flat ? '#5a4646' : CAT_FILL[a.cat] || '#4d5157'
        const ai = o.source === 'ai'
        return (
          <g key={o.id} transform={`translate(${o.x},${o.z}) rotate(${deg})`} className={'pe-item' + (isSel ? ' sel' : '') + (ai ? ' ai' : '')} onPointerDown={down} onPointerEnter={() => setHover(o.id)} onPointerLeave={() => setHover(null)}>
            {small
              ? <circle r={Math.max(0.09, Math.max(w, d) / 2)} fill={a.practical ? '#c9963f' : fill} stroke="#1f2023" strokeWidth={px} strokeDasharray={a.hang ? `${px * 4} ${px * 3}` : undefined} />
              : round
                ? <ellipse rx={w / 2} ry={d / 2} fill={fill} />
                : <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(0.08, w / 6)} fill={fill} opacity={a.flat ? 0.75 : 1} />}
            {!small && !a.flat && <line x1={-w / 2 + 0.06} x2={w / 2 - 0.06} y1={d / 2 - 0.05} y2={d / 2 - 0.05} stroke="rgba(255,255,255,0.35)" strokeWidth={px * 2} pointerEvents="none" />}
            {a.practical && <circle r={0.05} fill="#ffd59a" pointerEvents="none" />}
            {(isSel || hover === o.id || (!compact && !small && w > 0.6)) && (
              <text transform={`rotate(${-deg})`} textAnchor="middle" dy={fs * 0.35} fontSize={fs * (small ? 0.8 : 0.9)} className="pe-label" pointerEvents="none">{a.name}</text>
            )}
            {isSel && canEdit && !a.flat && !small && (
              <>
                <line x1={0} y1={d / 2} x2={0} y2={d / 2 + 0.32} stroke="var(--tungsten)" strokeWidth={px * 1.5} />
                <circle className="pe-handle" cx={0} cy={d / 2 + 0.38} r={0.08} onPointerDown={(e) => begin(e, { kind: 'objects', id: o.id, mode: 'rotate' })}><title>Drag to rotate (15° steps, hold Alt for free)</title></circle>
              </>
            )}
          </g>
        )
      })}

      {/* walls */}
      {['N', 'S', 'E', 'W'].map((side) => {
        const f = wallFrame(R, side)
        const a = [f.o[0] - f.t[0] * (f.len / 2 + wallT), f.o[1] - f.t[1] * (f.len / 2 + wallT)]
        const b = [f.o[0] + f.t[0] * (f.len / 2 + wallT), f.o[1] + f.t[1] * (f.len / 2 + wallT)]
        const off = [-f.n[0] * wallT / 2, -f.n[1] * wallT / 2]
        return <line key={side} x1={a[0] + off[0]} y1={a[1] + off[1]} x2={b[0] + off[0]} y2={b[1] + off[1]} stroke="#c9ccd3" strokeWidth={wallT} strokeLinecap="square" pointerEvents="none" />
      })}

      {/* openings */}
      {R.openings.map((op, i) => {
        const f = wallFrame(R, op.wall)
        const c = openingCenter(R, op)
        const a = [c[0] - f.t[0] * op.width / 2, c[1] - f.t[1] * op.width / 2]
        const b = [c[0] + f.t[0] * op.width / 2, c[1] + f.t[1] * op.width / 2]
        const off = [-f.n[0] * wallT / 2, -f.n[1] * wallT / 2]
        const isSel = sel === op.id
        const down = editRoom ? (e) => begin(e, { kind: 'opening', id: op.id, mode: 'opening', index: i }) : undefined
        return (
          <g key={op.id} className={'pe-opening' + (isSel ? ' sel' : '') + (editRoom ? ' editable' : '')} onPointerDown={down}>
            <line x1={a[0] + off[0]} y1={a[1] + off[1]} x2={b[0] + off[0]} y2={b[1] + off[1]} stroke="#33353a" strokeWidth={wallT + px * 2} />
            {op.type === 'window'
              ? <>
                <line x1={a[0] + off[0] * 1.6} y1={a[1] + off[1] * 1.6} x2={b[0] + off[0] * 1.6} y2={b[1] + off[1] * 1.6} stroke="var(--daylight)" strokeWidth={px * 2.5} />
                <line x1={a[0] + off[0] * 0.4} y1={a[1] + off[1] * 0.4} x2={b[0] + off[0] * 0.4} y2={b[1] + off[1] * 0.4} stroke="var(--daylight)" strokeWidth={px * 2.5} />
              </>
              : <>
                <line x1={a[0]} y1={a[1]} x2={a[0] + f.n[0] * op.width} y2={a[1] + f.n[1] * op.width} stroke="#d9dbe0" strokeWidth={px * 2.5} />
                <path d={`M${a[0] + f.n[0] * op.width},${a[1] + f.n[1] * op.width} A${op.width},${op.width} 0 0 ${op.wall === 'N' || op.wall === 'E' ? 0 : 0} ${b[0]},${b[1]}`} fill="none" stroke="#9a9ea6" strokeWidth={px * 1.2} strokeDasharray={`${px * 5} ${px * 4}`} />
              </>}
            {/* fat invisible hit area */}
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={0.4} />
            {(isSel || !compact) && <text x={c[0] + f.n[0] * 0.3} y={c[1] + f.n[1] * 0.3} textAnchor="middle" dy={fs * 0.35} fontSize={fs * 0.8} className="pe-dim" pointerEvents="none">{op.type === 'window' ? 'Window' : 'Door'} {op.width.toFixed(1)}</text>}
            <title>{op.type === 'window' ? 'Window' : 'Door'} on the {WALL_NAME[op.wall]} wall. Drag along any wall to move it.</title>
          </g>
        )
      })}

      {/* outlets */}
      {R.outlets.map((ou, i) => {
        const f = wallFrame(R, ou.wall)
        const c = [f.o[0] + f.t[0] * ou.at + f.n[0] * 0.1, f.o[1] + f.t[1] * ou.at + f.n[1] * 0.1]
        return (
          <g key={'ou' + i} className={'pe-outlet' + (editRoom ? ' editable' : '')} onPointerDown={editRoom ? (e) => begin(e, { kind: 'outlet', id: 'outlet' + i, mode: 'outlet', index: i }) : undefined}>
            <circle cx={c[0]} cy={c[1]} r={0.075} fill="#1f2023" stroke="#e8c26a" strokeWidth={px * 1.6} />
            <circle cx={c[0] - 0.022} cy={c[1]} r={0.012} fill="#e8c26a" /><circle cx={c[0] + 0.022} cy={c[1]} r={0.012} fill="#e8c26a" />
            <circle cx={c[0]} cy={c[1]} r={0.2} fill="transparent" />
            <title>Power outlet. Drag along any wall.</title>
          </g>
        )
      })}

      {/* cameras */}
      {cameras.map((c0) => {
        const c = live('cameras', c0)
        const active = c.id === activeCam
        const half = Math.atan(Math.tan(hfov(c.focal) / 2))
        const isSel = sel === c.id
        const col = active ? 'var(--tally)' : '#a7abb3'
        const ang = Math.atan2(c.aim[2] - c.z, c.aim[0] - c.x)
        return (
          <g key={c.id} className={'pe-item' + (isSel ? ' sel' : '')} onPointerDown={(e) => editKinds.includes('cameras') ? begin(e, { kind: 'cameras', id: c.id, mode: 'move' }) : (e.stopPropagation(), onSelect?.({ kind: 'cameras', id: c.id }))}>
            <path d={wedge(c.x, c.z, c.aim[0], c.aim[2], half, 1.3)} fill={col} opacity={0.1} stroke={col} strokeWidth={px * 1.2} />
            <rect x={-0.16} y={-0.11} width={0.32} height={0.22} rx={0.03} fill="#202125" stroke={col} strokeWidth={px * 2} transform={`translate(${c.x},${c.z}) rotate(${ang * 180 / Math.PI})`} />
            <text x={c.x} y={c.z - 0.24} textAnchor="middle" fontSize={fs * 0.85} className="pe-label" fill={col} pointerEvents="none">Cam {c.label} · {c.focal}mm</text>
          </g>
        )
      })}

      {/* lights */}
      {lights.map((l0) => {
        const l = live('lights', l0)
        const col = l.on === false ? '#6b6e75' : cctToHex(l.cct)
        const ang = Math.atan2(l.aim[2] - l.z, l.aim[0] - l.x)
        const isSel = sel === l.id
        return (
          <g key={l.id} className={'pe-item' + (isSel ? ' sel' : '') + (l.source === 'ai' ? ' ai' : '')} onPointerDown={(e) => editKinds.includes('lights') ? begin(e, { kind: 'lights', id: l.id, mode: 'move' }) : (e.stopPropagation(), onSelect?.({ kind: 'lights', id: l.id }))}>
            <circle cx={l.x} cy={l.z} r={0.2} fill="transparent" />
            <rect x={-0.07} y={-0.17} width={0.14} height={0.34} rx={0.02} fill={col} stroke="#1f2023" strokeWidth={px * 1.5} transform={`translate(${l.x},${l.z}) rotate(${ang * 180 / Math.PI})`} />
            <text x={l.x} y={l.z - 0.27} textAnchor="middle" fontSize={fs * 0.8} className="pe-label" pointerEvents="none">{l.label || l.role} · {Math.round(l.intensity * 100)}%</text>
          </g>
        )
      })}

      {/* actors */}
      {actors.map((a0) => {
        const a = live('actors', a0)
        const isSel = sel === a.id
        const fx = Math.sin(a.rot || 0), fz = Math.cos(a.rot || 0)
        return (
          <g key={a.id} className={'pe-item' + (isSel ? ' sel' : '')} onPointerDown={(e) => editKinds.includes('actors') ? begin(e, { kind: 'actors', id: a.id, mode: 'move' }) : (e.stopPropagation(), onSelect?.({ kind: 'actors', id: a.id }))}>
            <line x1={a.x} y1={a.z} x2={a.x + fx * 0.42} y2={a.z + fz * 0.42} stroke="#eeeef0" strokeWidth={px * 2.5} strokeLinecap="round" />
            <circle cx={a.x} cy={a.z} r={0.22} fill="#6f5a8f" stroke="#eeeef0" strokeWidth={px * 2} />
            <text x={a.x} y={a.z} textAnchor="middle" dy={fs * 0.35} fontSize={fs} fontWeight="700" fill="#fff" pointerEvents="none">{a.label}</text>
            <text x={a.x} y={a.z + 0.42} textAnchor="middle" fontSize={fs * 0.8} className="pe-label" pointerEvents="none">{a.name}</text>
            {isSel && editKinds.includes('actors') && <circle className="pe-handle" cx={a.x + fx * 0.55} cy={a.z + fz * 0.55} r={0.08} onPointerDown={(e) => begin(e, { kind: 'actors', id: a.id, mode: 'rotate' })}><title>Drag to turn</title></circle>}
          </g>
        )
      })}

      {/* room dimensions and resize handles */}
      <g pointerEvents="none" className="pe-dim">
        <line x1={-R.w / 2} x2={R.w / 2} y1={-R.d / 2 - 0.42} y2={-R.d / 2 - 0.42} stroke="#8a8d95" strokeWidth={px} />
        <line x1={-R.w / 2} x2={-R.w / 2} y1={-R.d / 2 - 0.52} y2={-R.d / 2 - 0.32} stroke="#8a8d95" strokeWidth={px} />
        <line x1={R.w / 2} x2={R.w / 2} y1={-R.d / 2 - 0.52} y2={-R.d / 2 - 0.32} stroke="#8a8d95" strokeWidth={px} />
        <text x={0} y={-R.d / 2 - 0.5} textAnchor="middle" fontSize={fs} className="pe-dimtext">{R.w.toFixed(2)} m</text>
        <line y1={-R.d / 2} y2={R.d / 2} x1={-R.w / 2 - 0.42} x2={-R.w / 2 - 0.42} stroke="#8a8d95" strokeWidth={px} />
        <text transform={`translate(${-R.w / 2 - 0.52},0) rotate(-90)`} textAnchor="middle" fontSize={fs} className="pe-dimtext">{R.d.toFixed(2)} m</text>
      </g>
      {editRoom && (
        <g>
          <circle className="pe-handle big" cx={R.w / 2 + wallT / 2} cy={0} r={0.11} onPointerDown={(e) => begin(e, { kind: 'room', mode: 'w' })}><title>Drag to change the width</title></circle>
          <circle className="pe-handle big" cx={0} cy={R.d / 2 + wallT / 2} r={0.11} onPointerDown={(e) => begin(e, { kind: 'room', mode: 'd' })}><title>Drag to change the depth</title></circle>
          <rect className="pe-handle big" x={R.w / 2 - 0.02} y={R.d / 2 - 0.02} width={0.2} height={0.2} rx={0.03} onPointerDown={(e) => begin(e, { kind: 'room', mode: 'wd' })}><title>Drag to resize the room</title></rect>
        </g>
      )}
      <text x={0} y={R.d / 2 + 0.55} textAnchor="middle" fontSize={fs * 0.8} className="pe-dim" pointerEvents="none">Front · camera side</text>
    </svg>
  )
}
