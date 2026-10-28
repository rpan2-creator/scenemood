import { getAsset } from '../data/assets.js'
import { FIXTURES, cctToHex } from '../data/gear.js'
import { wallFrame, openingCenter } from '../data/rooms.js'
import { hfov, ASPECTS } from '../engine/checks.js'
import { outletPositions } from '../engine/checks.js'

const SKIN = { light: '#e3bc98', medium: '#b27b54', deep: '#6a432c' }

// A top-down lighting and blocking diagram, drawn from the same scene JSON as the 3D view.
export default function PlanSVG({ scene, labels = false, width = 400, height = 300, highlight }) {
  if (!scene) return null
  const ids = new Set()
  const { room } = scene
  const pad = labels ? 46 : 22
  const s = Math.min((width - pad * 2) / room.w, (height - pad * 2) / room.d)
  const ox = width / 2, oy = height / 2
  const X = (x) => ox + x * s
  const Y = (z) => oy + z * s
  const aspect = ASPECTS[scene.aspect] || 2.39
  const wallW = Math.max(3, 0.1 * s)

  const wedge = (x, z, ax, az, half, len) => {
    const a = Math.atan2(az - z, ax - x)
    const p1 = [x + Math.cos(a - half) * len, z + Math.sin(a - half) * len]
    const p2 = [x + Math.cos(a + half) * len, z + Math.sin(a + half) * len]
    return `M${X(x)},${Y(z)} L${X(p1[0])},${Y(p1[1])} A${len * s},${len * s} 0 0 1 ${X(p2[0])},${Y(p2[1])} Z`
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Plan of ${room.name}`}>
      <defs>
        <pattern id="floorgrid" width={s * 0.5} height={s * 0.5} patternUnits="userSpaceOnUse" x={X(-room.w / 2)} y={Y(-room.d / 2)}>
          <path d={`M ${s * 0.5} 0 L 0 0 0 ${s * 0.5}`} fill="none" stroke="#3f4247" strokeWidth="1" />
        </pattern>
      </defs>
      {/* floor */}
      <rect x={X(-room.w / 2)} y={Y(-room.d / 2)} width={room.w * s} height={room.d * s} fill="#2e3034" />
      <rect x={X(-room.w / 2)} y={Y(-room.d / 2)} width={room.w * s} height={room.d * s} fill="url(#floorgrid)" />

      {/* light beams under everything else */}
      {scene.lights.map((l) => {
        const fx = FIXTURES[l.fixture]
        if (!fx || l.on === false) return null
        const len = Math.min(3.2, Math.hypot(l.aim[0] - l.x, l.aim[2] - l.z) + 0.6)
        const half = Math.min(1.2, ((fx.beam / 2) * Math.PI) / 180)
        const col = cctToHex(l.cct)
        return <path key={'b' + l.id} d={wedge(l.x, l.z, l.aim[0], l.aim[2], half, len)} fill={col} opacity={0.08 + l.intensity * 0.2} />
      })}

      {/* furniture */}
      {[...scene.objects].sort((p, q) => (getAsset(q.asset)?.flat ? 1 : 0) - (getAsset(p.asset)?.flat ? 1 : 0)).map((o) => {
        const a = getAsset(o.asset)
        if (!a || a.wall) return null
        const [w, d] = a.size
        const deg = (-(o.rot || 0) * 180) / Math.PI
        const hl = highlight?.includes(o.id)
        const fill = a.flat ? '#4f3d3d' : a.practical ? '#5d4c2c' : '#45484f'
        return (
          <g key={o.id} transform={`translate(${X(o.x)},${Y(o.z)}) rotate(${deg})`}>
            {a.id === 'coffee_round' || a.id === 'plant_tall' || a.id === 'plant_small' || a.practical
              ? <circle r={(Math.min(w, d) / 2) * s} fill={fill} stroke={hl ? '#7cc8f0' : '#4a514d'} strokeWidth={hl ? 2 : 1} />
              : <rect x={(-w / 2) * s} y={(-d / 2) * s} width={w * s} height={d * s} rx={2} fill={fill} stroke={hl ? '#7cc8f0' : '#4a514d'} strokeWidth={hl ? 2 : 1} strokeDasharray={o.source === 'ai' && labels ? '4 3' : undefined} />}
            {a.practical && o.on !== false && <circle r={Math.max(3, 0.08 * s)} fill="#ffb15c" />}
            {labels && !a.flat && !a.onTable && !a.wall && Math.max(w, d) > 0.5 && (
              <text y={4} textAnchor="middle" fontSize="9.5" fill="#a3a6ad" transform={`rotate(${-deg})`} style={{ fontFamily: 'var(--font)' }}>{a.name.replace(/ \(.*\)/, '')}</text>
            )}
          </g>
        )
      })}

      {/* walls */}
      <rect x={X(-room.w / 2)} y={Y(-room.d / 2)} width={room.w * s} height={room.d * s} fill="none" stroke="#9aa09b" strokeWidth={wallW} />
      {room.openings.map((op) => {
        const f = wallFrame(room, op.wall)
        const c = openingCenter(room, op)
        const a = [c[0] - f.t[0] * op.width / 2, c[1] - f.t[1] * op.width / 2]
        const b = [c[0] + f.t[0] * op.width / 2, c[1] + f.t[1] * op.width / 2]
        if (op.type === 'window') {
          return (
            <g key={op.id}>
              <line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#2e3034" strokeWidth={wallW + 1} />
              <line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#7cc8f0" strokeWidth={1.5} transform={`translate(${f.n[0] * 2},${f.n[1] * 2})`} />
              <line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#7cc8f0" strokeWidth={1.5} transform={`translate(${-f.n[0] * 2},${-f.n[1] * 2})`} />
            </g>
          )
        }
        const r = op.width * s
        const swingEnd = [a[0] + f.n[0] * op.width, a[1] + f.n[1] * op.width]
        return (
          <g key={op.id}>
            <line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#2e3034" strokeWidth={wallW + 1} />
            <line x1={X(a[0])} y1={Y(a[1])} x2={X(swingEnd[0])} y2={Y(swingEnd[1])} stroke="#6f7672" strokeWidth={1.5} />
            <path d={`M${X(swingEnd[0])},${Y(swingEnd[1])} A${r},${r} 0 0 ${op.wall === 'N' || op.wall === 'E' ? 1 : 0} ${X(b[0])},${Y(b[1])}`} fill="none" stroke="#4a514d" strokeDasharray="3 3" />
          </g>
        )
      })}
      {labels && outletPositions(room).map((p, i) => <rect key={'o' + i} x={X(p[0]) - 3} y={Y(p[1]) - 3} width={6} height={6} fill="#2e3034" stroke="#a3a9a4" />)}

      {/* camera wedges */}
      {scene.cameras.map((c) => {
        const active = c.id === scene.activeCam
        const half = hfov(c.focal) / 2
        const len = Math.min(3.5, Math.hypot(c.aim[0] - c.x, c.aim[2] - c.z) + 0.4)
        const col = active ? '#ffb15c' : '#8b918d'
        const ang = Math.atan2(c.aim[2] - c.z, c.aim[0] - c.x) * 180 / Math.PI
        return (
          <g key={c.id}>
            <path d={wedge(c.x, c.z, c.aim[0], c.aim[2], half, len)} fill={col} fillOpacity={0.06} stroke={col} strokeOpacity={0.7} strokeWidth={1} />
            <g transform={`translate(${X(c.x)},${Y(c.z)}) rotate(${ang})`}>
              <rect x={-9} y={-6} width={13} height={12} rx={2} fill={col} />
              <path d="M4,-4 L10,-7 L10,7 L4,4 Z" fill={col} />
            </g>
            <text x={X(c.x)} y={Y(c.z) + 20} textAnchor="middle" fontSize="11" fill={col} style={{ fontFamily: 'var(--mono)' }}>{labels ? `Cam ${c.label} · ${c.focal}mm` : c.label}</text>
          </g>
        )
      })}

      {/* fixtures */}
      {scene.lights.map((l) => {
        const fx = FIXTURES[l.fixture]
        const col = cctToHex(l.cct)
        const ang = Math.atan2(l.aim[2] - l.z, l.aim[0] - l.x) * 180 / Math.PI
        const hl = highlight?.includes(l.id)
        return (
          <g key={l.id}>
            <g transform={`translate(${X(l.x)},${Y(l.z)}) rotate(${ang})`}>
              {fx?.symbol === 'panel' && <rect x={-3} y={-8} width={6} height={16} fill={col} stroke="#111" />}
              {fx?.symbol === 'fresnel' && <><rect x={-8} y={-6} width={11} height={12} rx={2} fill="#2b2d2f" stroke={col} strokeWidth={1.5} /><rect x={3} y={-5} width={3} height={10} fill={col} /></>}
              {fx?.symbol === 'tube' && <rect x={-2} y={-11} width={4} height={22} rx={2} fill={col} />}
              {fx?.symbol === 'cob' && <><rect x={-8} y={-5} width={8} height={10} rx={1} fill="#2b2d2f" stroke={col} /><path d="M0,-11 L9,-14 L9,14 L0,11 Z" fill={col} opacity={0.85} /></>}
              {fx?.symbol === 'reflector' && <path d="M-2,-11 A12,12 0 0 1 -2,11" fill="none" stroke="#d9dcdf" strokeWidth={3} />}
            </g>
            {hl && <circle cx={X(l.x)} cy={Y(l.z)} r={14} fill="none" stroke="#7cc8f0" strokeDasharray="3 3" />}
            {labels && <text x={X(l.x)} y={Y(l.z) - 14} textAnchor="middle" fontSize="10.5" fill="#d5d6d1" style={{ fontFamily: 'var(--mono)' }}>{`${l.label || l.role} ${Math.round(l.intensity * 100)}% ${l.cct}K`}</text>}
          </g>
        )
      })}

      {/* actors */}
      {scene.actors.map((a) => {
        const r = Math.max(7, 0.2 * s)
        const hl = highlight?.includes(a.id)
        const fx = Math.sin(a.rot || 0), fz = Math.cos(a.rot || 0)
        return (
          <g key={a.id}>
            <line x1={X(a.x)} y1={Y(a.z)} x2={X(a.x + fx * 0.38)} y2={Y(a.z + fz * 0.38)} stroke="#ecebe6" strokeWidth={1.5} />
            <circle cx={X(a.x)} cy={Y(a.z)} r={r} fill={SKIN[a.tone] || '#b27b54'} stroke={hl ? '#7cc8f0' : '#ecebe6'} strokeWidth={hl ? 2.5 : 1.5} />
            <text x={X(a.x)} y={Y(a.z) + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#121413">{a.label}</text>
            {labels && <text x={X(a.x)} y={Y(a.z) - r - 5} textAnchor="middle" fontSize="11" fill="#ecebe6">{a.name}{a.pose === 'sit' ? ' (seated)' : ''}</text>}
          </g>
        )
      })}

      {labels && (
        <g transform={`translate(${X(-room.w / 2)},${Y(room.d / 2) + 26})`} style={{ fontFamily: 'var(--mono)' }}>
          <line x1={0} y1={0} x2={s} y2={0} stroke="#a3a9a4" />
          <line x1={0} y1={-4} x2={0} y2={4} stroke="#a3a9a4" />
          <line x1={s} y1={-4} x2={s} y2={4} stroke="#a3a9a4" />
          <text x={s + 8} y={4} fontSize="11" fill="#a3a9a4">1 m</text>
          <text x={room.w * s} y={4} fontSize="11" fill="#6f7672" textAnchor="end">{room.w.toFixed(1)} × {room.d.toFixed(1)} m · ceiling {room.h.toFixed(1)} m</text>
        </g>
      )}
    </svg>
  )
}
