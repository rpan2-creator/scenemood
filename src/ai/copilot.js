// SIMULATED AI CO-PILOT. These functions stand in for model calls the PRD describes
// (location parsing, script breakdown, setup review, proactive studio suggestions,
// alternatives, comment digests and production notes). Each takes and returns plain JSON,
// so a real model can replace the body without touching the UI.
import { newId } from '../store.js'
import { getTemplate, wallFrame, openingCenter } from '../data/rooms.js'
import { getAsset } from '../data/assets.js'
import { FIXTURES } from '../data/gear.js'
import { runChecks, stopsAt, actorFace, clampToRoom, outletPositions } from '../engine/checks.js'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const r2 = (v) => Math.round(v * 100) / 100
const has = (t, re) => re.test(t)

// ---------------------------------------------------------------- 1. describe the location → room

const TYPES = [
  ['battlefield', /(battle|war\b|trench|front ?line|bunker|ruins|战场|战壕|前线|废墟|战争)/],
  ['street', /(street|alley|sidewalk|road|parking|crosswalk|街|马路|巷|路边|停车场|人行道)/],
  ['forest', /(forest|woods|clearing|campsite|camp\b|outdoors|field|森林|树林|野外|营地|草地|郊外)/],
  ['warehouse', /(warehouse|factory|garage|hangar|仓库|工厂|车库|厂房)/],
  ['bedroom', /(bedroom|卧室|睡房|bed\b|床)/],
  ['office', /(office|studio|办公|工作室|会议)/],
  ['diner', /(kitchen|diner|dining|cafe|café|restaurant|厨房|餐厅|饭厅|咖啡)/],
  ['living', /(living|lounge|apartment|flat|客厅|起居|公寓)/],
]
const NUM = { one: 1, two: 2, three: 3, four: 4, a: 1, an: 1, single: 1, '一': 1, '两': 2, '二': 2, '三': 3, '四': 4 }
const WALL_WORDS = [['W', /(left|左)/], ['E', /(right|右)/], ['N', /(back|far|rear|behind|后|里|对面)/], ['S', /(front|near|camera side|前|门口)/]]
const PIECES = [
  ['car', /(car\b|sedan|vehicle|汽车|轿车|车)/], ['streetlight', /(street ?light|lamp ?post|路灯)/], ['bench', /(bench|长椅|长凳)/],
  ['sandbags', /(sandbag|沙袋)/], ['barbed_wire', /(barbed|wire|铁丝网)/], ['crater', /(crater|shell hole|弹坑)/], ['ruin_wall', /(ruin|broken wall|rubble|废墟|断墙|残墙)/],
  ['barrel_fire', /(barrel|oil drum|火桶|油桶)/], ['campfire', /(campfire|bonfire|篝火)/], ['tree', /(tree|树)/], ['rock', /(rock|boulder|石头|岩石)/],
  ['crate', /(crate|box|箱子|木箱)/], ['tent', /(tent|帐篷)/], ['fence', /(fence|栅栏|篱笆)/],
]
const FURNITURE = [
  ['sofa', /(sofa|couch|沙发)/], ['bed', /(bed\b|双人床|单人床|床)/], ['armchair', /(armchair|lounge chair|扶手椅|单人沙发)/],
  ['coffee_round', /(coffee table|茶几)/], ['dining_table', /(dining table|kitchen table|餐桌|饭桌)/], ['desk', /(desk|书桌|办公桌|写字台)/],
  ['office_chair', /(office chair|task chair|办公椅|转椅)/], ['dining_chair', /(chairs?\b|椅子)/], ['counter', /(island|counter|吧台|料理台)/],
  ['standing_lamp', /(floor lamp|standing lamp|落地灯)/], ['table_lamp', /(table lamp|bedside lamp|台灯|床头灯)/], ['pendant', /(pendant|hanging lamp|吊灯)/],
  ['bookshelf', /(bookshelf|bookcase|shelves|书架|书柜)/], ['tv', /(\btv\b|television|电视)/], ['dresser', /(dresser|chest of drawers|wardrobe|衣柜|五斗柜|梳妆)/],
  ['sideboard', /(sideboard|cabinet|柜子|餐边柜)/], ['rug', /(rug|carpet|地毯)/], ['plant_tall', /(plant|植物|绿植|盆栽)/], ['side_table', /(side table|nightstand|边几|床头柜)/],
]

function countNear(t, word) {
  const m = t.match(new RegExp(`(\\d|one|two|three|four|a|an|single|一|两|二|三|四)\\s*(?:扇|个|张|道)?\\s*(?:big |large |small |tall |大|小)?${word}`))
  if (!m) return null
  return /\d/.test(m[1]) ? +m[1] : NUM[m[1]] || 1
}
function wallIn(fragment) {
  for (const [w, re] of WALL_WORDS) if (re.test(fragment)) return w
  return null
}
function spread(len, n, width) {
  if (n <= 1) return [0]
  const usable = len - width - 0.6
  return Array.from({ length: n }, (_, i) => r2(-usable / 2 + (usable * i) / (n - 1)))
}

export async function parseLocation(text) {
  await wait(900 + Math.random() * 500)
  const t = text.toLowerCase()
  const understood = [], assumed = []
  const type = (TYPES.find(([, re]) => re.test(t)) || ['living'])[0]
  const tpl = getTemplate(type)
  if (TYPES.some(([, re]) => re.test(t))) understood.push(`A ${tpl.name.toLowerCase()}`)
  else assumed.push('Room type not given: treated it as a living room')

  if (tpl.kind === 'exterior') return parseExterior(t, tpl, understood, assumed)
  let w = tpl.w, d = tpl.d, h = tpl.h
  const feet = /\d\s*(ft|feet|foot)\b|英尺|\d'/.test(t)
  const dm = t.match(/(\d+(?:\.\d+)?)\s*(?:m|米|ft|feet)?\s*(?:x|×|\*|by|乘)\s*(\d+(?:\.\d+)?)/)
  if (dm) {
    let a = +dm[1], b = +dm[2]
    if (feet || a > 15) { a *= 0.3048; b *= 0.3048 }
    w = r2(Math.min(12, Math.max(2.2, Math.max(a, b)))); d = r2(Math.min(12, Math.max(2.2, Math.min(a, b))))
    understood.push(`${w} × ${d} m${feet ? ' (converted from feet)' : ''}`)
  } else {
    const area = t.match(/(\d+(?:\.\d+)?)\s*(?:平米|平方米|㎡|sqm|square met)/)
    if (area) { const A = +area[1]; w = r2(Math.sqrt(A * 1.25)); d = r2(A / w); understood.push(`About ${A} m², laid out as ${w} × ${d} m`) }
    else assumed.push(`No size given: used a typical ${tpl.name.toLowerCase()}, ${w} × ${d} m`)
  }
  const hm = t.match(/(?:ceiling|层高|吊顶|高)[^\d]{0,12}(\d+(?:\.\d+)?)/)
  if (hm && +hm[1] > 2 && +hm[1] < 6) { h = +hm[1]; understood.push(`Ceiling ${h} m`) }
  else if (/(low ceiling|层高低|矮)/.test(t)) { h = 2.4; understood.push('Low ceiling, about 2.4 m') }
  else if (/(high ceiling|loft|挑高|层高高)/.test(t)) { h = 3.4; understood.push('High ceiling, about 3.4 m') }

  const room = { template: type, name: tpl.name, w, d, h, floor: tpl.floor, wall: tpl.wall, floorType: /(concrete|水泥)/.test(t) ? 'concrete' : /(tile|瓷砖)/.test(t) ? 'tile' : /(wood|木地板|木)/.test(t) ? 'wood' : tpl.floorType, openings: [], outlets: [] }
  const frags = t.split(/[,.;，。；\n]| and | with |和|还有/)
  // windows
  const winFrags = frags.filter((f) => /(window|窗)/.test(f))
  if (winFrags.length) {
    for (const f of winFrags) {
      const n = countNear(f, '(?:windows?|窗户?)') || 1
      const wall = wallIn(f) || (room.openings.some((o) => o.wall === 'W') ? 'N' : 'W')
      const len = wallFrame(room, wall).len, width = Math.min(1.4, (len - 0.8) / n - 0.3)
      spread(len, n, width).forEach((at) => room.openings.push({ id: newId('win'), type: 'window', wall, at, width: r2(width), height: 1.45, sill: 0.85 }))
      understood.push(`${n} window${n > 1 ? 's' : ''} on the ${{ N: 'back', S: 'front', W: 'left', E: 'right' }[wall]} wall`)
    }
  } else {
    tpl.openings.filter((o) => o.type === 'window').forEach((o) => room.openings.push({ ...o, id: newId('win'), at: r2(Math.max(-1, Math.min(1, o.at))) }))
    assumed.push('Windows not mentioned: kept the usual ones for this room type')
  }
  const doorFrag = frags.find((f) => /(door|门)/.test(f) && !/(window|窗)/.test(f))
  const doorWall = (doorFrag && wallIn(doorFrag)) || (room.openings.some((o) => o.wall === 'E') ? 'S' : 'E')
  room.openings.push({ id: newId('door'), type: 'door', wall: doorWall, at: r2(wallFrame(room, doorWall).len / 2 - 0.9), width: 0.9, height: 2.05, sill: 0 })
  if (doorFrag) understood.push(`Door on the ${{ N: 'back', S: 'front', W: 'left', E: 'right' }[doorWall]} wall`)
  else assumed.push('Door not mentioned: put one on the ' + { N: 'back', S: 'front', W: 'left', E: 'right' }[doorWall] + ' wall')
  room.outlets = [{ wall: 'N', at: r2(w / 2 - 0.6) }, { wall: 'S', at: r2(-w / 2 + 0.6) }, { wall: doorWall === 'E' ? 'W' : 'E', at: 0 }]
  assumed.push('Outlets: one per wall near the corners. Drag them to where they really are.')

  // furniture
  const found = []
  for (const [asset, re] of FURNITURE) {
    if (!re.test(t)) continue
    if (asset === 'dining_chair' && /(armchair|office chair|扶手椅|办公椅)/.test(t) && !/(dining chairs?|chairs\b|椅子们|几把椅子)/.test(t)) continue
    if (asset === 'bed' && /(bedroom|卧室)/.test(t) && !/(bed\b(?!room)|双人床|单人床|床(?!头))/.test(t.replace('bedroom', ''))) continue
    const label = (re.source.match(/\(([^|)]+)/) || [])[1]
    const n = asset === 'dining_chair' ? countNear(t, '(?:dining )?chairs?|把?椅子') || 2 : 1
    found.push([asset, n])
    understood.push(n > 1 ? `${n} × ${getAsset(asset).name.toLowerCase()}` : getAsset(asset).name)
    void label
  }
  let objects
  if (found.length) objects = layout(room, found)
  else { objects = tpl.starter.map((s) => ({ ...s, id: newId('obj'), layer: 'dressing', y: s.y || 0, source: 'location' })); assumed.push('No furniture mentioned: placed what a ' + tpl.name.toLowerCase() + ' usually has') }
  objects.forEach((o) => clampToRoom(room, o, 0.3))
  return { room, objects, understood, assumed }
}

function parseExterior(t, tpl, understood, assumed) {
  let w = tpl.w, d = tpl.d
  const dm = t.match(/(\d+(?:\.\d+)?)\s*(?:m|米)?\s*(?:x|×|\*|by|乘)\s*(\d+(?:\.\d+)?)/)
  if (dm) { w = r2(Math.min(30, Math.max(4, Math.max(+dm[1], +dm[2])))); d = r2(Math.min(30, Math.max(4, Math.min(+dm[1], +dm[2])))); understood.push(`Playing area ${w} × ${d} m`) }
  else assumed.push(`No size given: used a ${w} × ${d} m playing area`)
  const time = /(dusk|sunset|golden hour|evening|黄昏|傍晚|日落)/.test(t) ? 'dusk' : /(night|midnight|夜|晚上)/.test(t) ? 'night' : /(day|noon|morning|afternoon|白天|中午|早上|下午)/.test(t) ? 'day' : null
  if (time) understood.push({ dusk: 'Dusk', night: 'Night', day: 'Daylight' }[time])
  const ground = /(grass|草)/.test(t) ? 'grass' : /(\bsand\b|sandy|desert|beach|沙漠|沙滩)/.test(t) ? 'sand' : /(asphalt|road|street|柏油|马路|街)/.test(t) ? 'asphalt' : /(mud|dirt|土|泥)/.test(t) ? 'dirt' : tpl.ground
  understood.push(`Ground: ${ground}`)
  const room = { template: tpl.id, kind: 'exterior', ground, haze: tpl.haze || 0, name: tpl.name, w, d, h: tpl.h, openings: [], outlets: tpl.outlets.map((o) => ({ ...o })) }
  const found = PIECES.filter(([, re]) => re.test(t)).map(([a]) => a)
  let objects
  if (found.length) {
    // spread the pieces around the edges of the playing area, leaving the middle for the action
    const ring = [[-0.32, -0.3], [0.3, -0.32], [-0.38, 0.05], [0.38, 0.08], [-0.15, -0.4], [0.12, -0.42], [-0.35, 0.3], [0.34, 0.32]]
    objects = found.map((a, i) => { const [fx, fz] = ring[i % ring.length]; return { id: newId('obj'), asset: a, x: r2(fx * w), z: r2(fz * d), y: 0, rot: r2((i * 0.7) % 3), layer: 'dressing', source: 'location' } })
    found.forEach((a) => understood.push(getAsset(a).name))
  } else {
    objects = tpl.starter.map((s) => ({ ...s, id: newId('obj'), layer: 'dressing', y: s.y || 0, source: 'location' }))
    assumed.push(`No set pieces mentioned: placed what a ${tpl.name.toLowerCase()} usually has`)
  }
  assumed.push('Power comes from a generator at the edge of the area. Drag the power marker to where it really is.')
  return { room, objects, understood, assumed, time }
}

function layout(room, found) {
  const { w, d } = room
  const out = []
  const add = (asset, x, z, rot = 0, extra = {}) => { const o = { id: newId('obj'), asset, x: r2(x), z: r2(z), y: 0, rot, layer: 'dressing', source: 'location', ...extra }; out.push(o); return o }
  const want = Object.fromEntries(found)
  let anchor = null
  if (want.sofa) anchor = add('sofa', 0, -d / 2 + 0.6)
  if (want.bed) anchor = add('bed', want.sofa ? -w / 4 : -0.3, -d / 2 + 1.1)
  if (want.coffee_round) add('coffee_round', anchor ? anchor.x : 0, (anchor ? anchor.z : 0) + 1.15)
  if (want.rug) add('rug', anchor ? anchor.x : 0, (anchor ? anchor.z : 0) + 1.0)
  if (want.armchair) add('armchair', w / 2 - 0.9, -d / 2 + 1.3, -0.9)
  if (want.dining_table) {
    const tb = add('dining_table', want.sofa || want.bed ? w / 4 : 0, want.sofa || want.bed ? d / 4 : 0)
    const n = want.dining_chair || 2
    ;[[-0.55, 0.62, Math.PI], [0.55, -0.62, 0], [0.55, 0.62, Math.PI], [-0.55, -0.62, 0]].slice(0, n).forEach(([dx, dz, r]) => add('dining_chair', tb.x + dx, tb.z + dz, r))
    if (want.pendant) add('pendant', tb.x, tb.z)
  } else if (want.dining_chair && !want.desk) {
    for (let i = 0; i < want.dining_chair; i++) add('dining_chair', -0.6 + i * 0.6, 0.4, Math.PI)
  }
  if (want.desk) {
    const win = room.openings.find((o) => o.type === 'window')
    let x = -w / 4, z = -d / 2 + 0.5, rot = 0
    if (win) { const c = openingCenter(room, win), f = wallFrame(room, win.wall); x = c[0] + f.n[0] * 0.55; z = c[1] + f.n[1] * 0.55; rot = Math.atan2(-f.n[0], -f.n[1]) + Math.PI }
    const dk = add('desk', x, z, r2(rot))
    if (want.office_chair || !want.dining_chair) add('office_chair', dk.x + Math.sin(rot) * 0.65, dk.z + Math.cos(rot) * 0.65, r2(rot + Math.PI))
  }
  if (want.counter) add('counter', 0, -d / 2 + 0.6)
  if (want.standing_lamp) add('standing_lamp', (anchor ? anchor.x : 0) + 1.5, (anchor ? anchor.z : -d / 2 + 0.5) - 0.15)
  if (want.side_table || want.table_lamp) {
    const st = add('side_table', (anchor ? anchor.x - (anchor.asset === 'bed' ? 1.1 : 1.4) : -w / 2 + 0.5), (anchor ? anchor.z - (anchor.asset === 'bed' ? 0.7 : 0) : -d / 2 + 0.5))
    if (want.table_lamp) add('table_lamp', st.x, st.z, 0, { y: 0.55 })
  }
  if (want.pendant && !want.dining_table) add('pendant', 0, 0)
  if (want.bookshelf) add('bookshelf', w / 2 - 0.25, -d / 2 + 1.4, -Math.PI / 2)
  if (want.tv) add('tv', 0, d / 2 - 0.3, Math.PI)
  if (want.dresser) add('dresser', w / 2 - 0.8, d / 2 - 0.35, Math.PI)
  if (want.sideboard) add('sideboard', -w / 2 + 0.3, 0, Math.PI / 2)
  if (want.plant_tall) add('plant_tall', -w / 2 + 0.5, d / 2 - 0.5)
  return out
}

// ---------------------------------------------------------------- 2. script page → brief

const MOOD_WORDS = [
  ['tension', /(tense|tension|argue|argument|fight|紧张|争吵|吵架)/], ['intimate', /(intimate|close|whisper|kiss|亲密|低语|温柔)/],
  ['lonely', /(lonely|alone|empty|孤独|一个人|空荡)/], ['confrontation', /(confront|accuse|shout|yell|angry|对峙|质问|愤怒|大喊)/],
  ['quiet', /(quiet|silent|silence|pause|安静|沉默|不说话)/], ['nostalgic', /(remember|old photo|memory|nostalg|回忆|怀旧|老照片)/],
  ['cold and blue', /(cold|rain|winter|blue|冷|雨|冬)/], ['soft and warm', /(warm|candle|cozy|温暖|蜡烛|温馨)/],
  ['hard shadows', /(harsh|interrogat|noir|硬|审问|黑色电影)/], ['motivated light', /(lamp|window|candle|台灯|窗|蜡烛)/],
]

export async function parseScript(text) {
  await wait(1000 + Math.random() * 500)
  const raw = text.trim()
  const t = raw.toLowerCase()
  const understood = []
  let time = null
  const slug = raw.match(/(INT|EXT|内景|外景)[.\s]*([^\n]*?)\s*[-–—]\s*(NIGHT|DAY|DUSK|DAWN|MORNING|EVENING|夜|日|黄昏|清晨)/i)
  if (slug) { time = /(night|夜|dusk|evening|黄昏)/i.test(slug[3]) ? 'night' : 'day'; understood.push(`Scene heading: ${slug[0].trim()}`) }
  else if (/(night|midnight|evening|夜|晚上|深夜)/.test(t)) { time = 'night'; understood.push('Night') }
  else if (/(morning|day|afternoon|noon|早上|白天|下午|中午)/.test(t)) { time = 'day'; understood.push('Day') }
  // character cues: lines in CAPS, or "Name:" at line start
  const names = []
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^([A-Z][A-Z .'-]{1,18})(?:\s*\(.*\))?$/) || line.trim().match(/^([A-Z][a-z]+|[一-龥]{1,4})\s*[:：]/)
    if (m) { const n = m[1].trim().replace(/\s+/g, ' '); const nice = /^[A-Z .'-]+$/.test(n) ? n.charAt(0) + n.slice(1).toLowerCase() : n; if (!names.includes(nice) && !/^(INT|EXT|CUT TO|FADE)/.test(n)) names.push(nice) }
  }
  if (!names.length) { const m = raw.match(/\b([A-Z][a-z]{2,})\b/g) || []; const stop = new Set(['Night', 'Day', 'She', 'He', 'They', 'The', 'Int', 'Ext', 'Morning', 'Evening', 'Late']); m.forEach((n) => { if (!stop.has(n) && !names.includes(n)) names.push(n) }) }
  if (names.length) understood.push(`Characters: ${names.slice(0, 3).join(', ')}`)
  const refs = MOOD_WORDS.filter(([, re]) => re.test(t)).map(([w]) => w).slice(0, 4)
  if (refs.length) understood.push(`Mood: ${refs.join(', ')}`)
  // a one-line brief the generator can work from
  // action lines only: skip headings, character cues and the dialogue under them
  const lines = raw.split('\n').map((l) => l.trim())
  const action = []
  let inDialogue = false
  for (const l of lines) {
    if (!l) { inDialogue = false; continue }
    if (/^(INT|EXT|内景|外景)/i.test(l)) continue
    if (/^[A-Z][A-Z .'-]{1,18}(\s*\(.*\))?$/.test(l) || /^([A-Z][a-z]+|[\u4e00-\u9fa5]{1,4})\s*[:：]/.test(l)) { inDialogue = true; continue }
    if (!inDialogue) action.push(l)
  }
  const firstAction = action.slice(0, 2).join(' ').replace(/\b([A-Z]{2,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase())
  const brief = `${time === 'night' ? 'Night. ' : time === 'day' ? 'Day. ' : ''}${firstAction.slice(0, 180)}${refs.length ? ' ' + refs.slice(0, 2).map((r) => r[0].toUpperCase() + r.slice(1)).join(', ') + '.' : ''}`
  return { time, names: names.slice(0, 3), refs, brief: brief.trim(), understood }
}

// ---------------------------------------------------------------- 3. setup review + gear advice

export function reviewSetup(setup) {
  const { room, objects = [], kit, brief } = setup
  const notes = []
  const wins = room.openings.filter((o) => o.type === 'window')
  const powered = Object.entries(kit).filter(([k]) => !FIXTURES[k]?.passive).reduce((a, [, v]) => a + v, 0)
  if (!wins.length) notes.push({ level: 'tip', text: 'No windows: every source has to be a lamp or one of your units. Directions will lean on practicals.' })
  else if (brief.time === 'night') notes.push({ level: 'ok', text: `Night with ${wins.length} window${wins.length > 1 ? 's' : ''}: the AI can use a cool “moonlight” unit outside the glass as an edge light.` })
  else notes.push({ level: 'ok', text: `Day: the ${wins.length > 1 ? 'windows are' : 'window is'} your biggest source. Expect directions that key from the ${{ N: 'back', S: 'front', W: 'left', E: 'right' }[wins[0].wall]} wall.` })
  if (room.h < 2.5) notes.push({ level: 'warn', text: `Ceiling ${room.h} m: no room for a top light or a high key. Lights will sit on stands at eye level or below.` })
  if (room.w * room.d < 12) notes.push({ level: 'warn', text: `Small room (${(room.w * room.d).toFixed(0)} m²): wide shots need an 18–24 mm lens, and stands will fight for space.` })
  const practical = objects.find((o) => getAsset(o.asset)?.practical)
  if (!practical && brief.time === 'night') notes.push({ level: 'tip', text: 'No practical lamp in the room. For a night interior, adding one gives the key light a visible reason.', action: { type: 'add', asset: 'standing_lamp', label: 'Add a floor lamp' } })
  if (powered < 2) notes.push({ level: 'warn', text: `Only ${powered} powered unit${powered === 1 ? '' : 's'}. Expect one-source looks and higher ISO.` })
  if (brief.actors >= 3 && powered < 3) notes.push({ level: 'tip', text: 'Three actors with two units: the AI will block them closer together so one key covers two faces.' })
  const outlets = outletPositions(room)
  if (outlets.length < 2) notes.push({ level: 'warn', text: 'One outlet: plan on a power strip and a 25 ft stinger.' })
  const tones = Object.values(brief.tones || {}).slice(0, brief.actors)
  if (tones.includes('deep') && tones.includes('light')) notes.push({ level: 'tip', text: 'Very different skin tones in one frame: the AI will balance exposure per face rather than one meter reading.' })
  return notes
}

export function gearAdvice(kit, brief) {
  const out = []
  const n = (k) => kit[k] || 0
  if (!n('reflector')) out.push('A 5-in-1 reflector is the cheapest fill you can carry. It costs nothing in power and opens up night looks.')
  if (n('led_panel') + n('cob') + n('fresnel') + n('tube') <= 2 && brief.time === 'night') out.push('Two units cover a night two-shot: one motivated key, one cool edge. A third would let you light the background.')
  if (!n('tube') && /(lonely|cold|quiet)/.test((brief.refs || []).join(' '))) out.push('A tube light is easy to hide in frame as a practical: good for cold, lonely looks.')
  if (!n('fresnel') && /(hard shadows|confrontation)/.test((brief.refs || []).join(' '))) out.push('No Fresnel: hard looks will come from a bare panel. A Fresnel gives cleaner shadows if you can borrow one.')
  if (!out.length) out.push('This kit covers the brief. Nothing to add.')
  return out
}

// ---------------------------------------------------------------- 4. studio co-pilot

export function copilotSuggestions(scene, kit) {
  if (!scene) return []
  const out = []
  const checks = runChecks(scene, kit)
  checks.filter((c) => c.level === 'error').forEach((c) => out.push({ id: 'chk-' + c.id, level: 'error', title: c.title, why: c.detail, action: c.fix ? { type: 'fix', fix: c.fix, label: c.fix.label } : null }))
  for (const a of scene.actors) {
    const s = stopsAt(scene, a).stops
    if (s < -1.3) out.push({ id: 'dark-' + a.id, level: 'warn', title: `${a.name} is ${Math.abs(s).toFixed(1)} stops under`, why: `At T${scene.tstop} and ISO ${scene.iso}, ${a.name}'s face reads dark. That can be the look, or it can be lost in the grade.`, action: { type: 'command', text: `${a.name}'s face is too dark`, hint: a.id, label: 'Brighten her face'.replace('her', a.name + "'s") } })
    if (s > 1.4) out.push({ id: 'hot-' + a.id, level: 'warn', title: `${a.name} is ${s.toFixed(1)} stops hot`, why: 'Skin this far over will clip on most cameras.', action: { type: 'command', text: 'make it moodier', label: 'Bring the lights down' } })
  }
  const key = scene.lights.find((l) => l.role === 'key')
  const fill = scene.lights.find((l) => l.role === 'fill')
  if (key && fill && key.intensity / Math.max(0.05, fill.intensity) < 1.6) out.push({ id: 'ratio', level: 'tip', title: 'Key and fill are almost even', why: 'Under 2:1 reads flat. For tension, let one side of the face fall off.', action: { type: 'command', text: 'make it moodier', label: 'Raise the contrast' } })
  if (key && !scene.objects.some((o) => getAsset(o.asset)?.practical && o.on !== false)) out.push({ id: 'motivate', level: 'tip', title: 'The key has no visible source', why: 'A lamp or candle in frame tells the audience where the light comes from.', action: { type: 'command', text: 'add a candle', label: 'Add a candle' } })
  if (!scene.lights.some((l) => l.role === 'rim' || l.role === 'back') && scene.lights.length < Object.values(kit).reduce((a, b) => a + b, 0)) out.push({ id: 'sep', level: 'tip', title: 'Nothing separates them from the wall', why: 'An edge light from behind keeps dark hair and clothes from merging with the background.', action: { type: 'command', text: 'add a rim light', label: 'Raise the edge light' } })
  if (scene.cameras.length < 2 && scene.actors.length > 1) out.push({ id: 'coverage', level: 'tip', title: 'Only one angle', why: 'One camera gives the editor nothing to cut to. A close-up on the lead adds coverage for 10 minutes of setup.', action: { type: 'addCam', label: 'Add a close-up' } })
  const clutter = scene.objects.filter((o) => getAsset(o.asset)?.tags?.includes('clutter')).length
  if (clutter > 4) out.push({ id: 'clutter', level: 'tip', title: `${clutter} small props on surfaces`, why: 'Busy tabletops pull the eye in a wide. Keep two or three that say something.', action: { type: 'command', text: 'clear the clutter', label: 'Clear some props' } })
  if (!out.length) out.push({ id: 'good', level: 'ok', title: 'Looks shootable', why: 'Gear, exposure, coverage and the 180° line all check out. Make a reference frame or send it for review.', action: { type: 'go', to: '/review', label: 'Send for review' } })
  return out.slice(0, 6)
}

export function explainItem(scene, kind, item) {
  if (!item) return ''
  const bits = []
  if (item.why) bits.push(`${item.why.ref}: ${item.why.text}`)
  if (kind === 'lights') {
    const fx = FIXTURES[item.fixture]
    const lit = scene.actors.map((a) => ({ a, d: Math.hypot(a.x - item.aim[0], a.z - item.aim[2]) })).sort((p, q) => p.d - q.d)[0]
    bits.push(`It's a ${fx.name.toLowerCase()} at ${Math.round(item.intensity * 100)}%, ${item.cct} K, ${item.y} m high${lit ? `, aimed at ${lit.a.name}` : ''}.`)
    if (item.role === 'key') bits.push('As the key it sets the exposure; everything else is measured against it.')
    if (item.role === 'fill') bits.push('As fill it only lifts the shadow side. Keep it at least a stop under the key.')
    if (item.role === 'rim' || item.role === 'back') bits.push('From behind, it draws an outline that separates the actor from the wall.')
  } else if (kind === 'cameras') {
    bits.push(`${item.focal} mm at ${item.y} m. ${item.focal >= 65 ? 'A long lens compresses the background and isolates the face.' : item.focal <= 28 ? 'A wide lens shows the room and the distance between people.' : 'A normal lens, close to how the eye sees the room.'}`)
  } else if (kind === 'actors') {
    const s = stopsAt(scene, item)
    bits.push(`${item.name} gets about ${Math.round(s.lux)} lux, ${s.stops >= 0 ? '+' : ''}${s.stops.toFixed(1)} stops from the exposure target.`)
  } else if (kind === 'objects') {
    const a = getAsset(item.asset)
    bits.push(item.source === 'location' ? `The ${a?.name.toLowerCase()} is already at the location; directions dress around it.` : `The ${a?.name.toLowerCase()} is set dressing to bring or borrow.`)
  }
  return bits.join(' ')
}

// three different ways to place one thing, each a full scene the user can preview
export async function alternativesFor(scene, kind, id, kit) {
  await wait(800 + Math.random() * 400)
  const item = scene[kind].find((x) => x.id === id)
  if (!item) return []
  const mk = (label, why, mut) => {
    const s = structuredClone(scene)
    const it = s[kind].find((x) => x.id === id)
    mut(it, s)
    clampToRoom(s.room, it, 0.3)
    const issues = runChecks(s, kit).filter((c) => c.level === 'error').length
    return { id: newId('alt'), label, why, scene: s, changed: [id], issues }
  }
  const cam = scene.cameras.find((c) => c.id === scene.activeCam) || scene.cameras[0]
  if (kind === 'lights') {
    const aim = item.aim
    const side = (sgn) => (l) => { if (!cam) return; const dx = cam.aim[0] - cam.x, dz = cam.aim[2] - cam.z, L = Math.hypot(dx, dz) || 1; l.x = r2(aim[0] + (sgn * -dz / L) * 1.5 - (dx / L) * 0.5); l.z = r2(aim[2] + (sgn * dx / L) * 1.5 - (dz / L) * 0.5); delete l.target }
    return [
      mk('Classic 45°', 'Front-side key at 45° to the lens: flattering, reads clearly.', (l) => { side(1)(l); l.y = Math.min(scene.room.h - 0.3, 2.0) }),
      mk('Side light', 'Pure side light: half the face falls into shadow. More drama.', (l) => { if (!cam) return; const dx = cam.aim[0] - cam.x, dz = cam.aim[2] - cam.z, L = Math.hypot(dx, dz) || 1; l.x = r2(aim[0] + (dz / L) * 1.6); l.z = r2(aim[2] - (dx / L) * 1.6); l.y = 1.7; l.diffusion = 0.3; delete l.target }),
      mk('Far side, soft', 'Key from the far side of the eyeline: more shadow facing the lens, the modern look.', (l) => { side(-1)(l); l.diffusion = 0.9; l.intensity = Math.min(1, l.intensity * 1.2) }),
    ]
  }
  if (kind === 'cameras') {
    return [
      mk('Tighter', 'Longer lens from the same spot: closer on the face, background goes soft.', (c) => { c.focal = Math.min(135, Math.round(c.focal * 1.6)); c.shot = 'Close-up' }),
      mk('Lower angle', 'Camera 40 cm lower: the subject gains weight and power.', (c) => { c.y = Math.max(0.6, r2(c.y - 0.4)) }),
      mk('Wider, further back', 'Wider lens: shows the room and the distance between them.', (c) => { c.focal = Math.max(18, Math.round(c.focal / 1.5)); c.shot = 'Wide'; const dx = c.x - c.aim[0], dz = c.z - c.aim[2], L = Math.hypot(dx, dz) || 1; c.x = r2(c.x + (dx / L) * 0.8); c.z = r2(c.z + (dz / L) * 0.8) }),
    ]
  }
  if (kind === 'actors') {
    const other = scene.actors.find((a) => a.id !== id)
    return [
      mk('Closer', `Moves ${item.name} half a metre toward ${other?.name || 'the others'}: less distance, more intimacy.`, (a) => { if (other) { a.x = r2(a.x + (other.x - a.x) * 0.35); a.z = r2(a.z + (other.z - a.z) * 0.35) } }),
      mk('Turned away', `${item.name} turns away from the lens: we read the scene on the back and the profile.`, (a) => { a.rot = r2((a.rot || 0) + Math.PI * 0.6); a.pose = a.pose === 'sit' || a.pose === 'hunched' ? 'turned' : 'crossed' }),
      mk('Standing', `${item.name} gets up: a change of height marks a change of power.`, (a) => { a.pose = 'stand'; a.z = r2(a.z + 0.4) }),
    ]
  }
  // objects
  return [
    mk('In the background', 'Pushed back toward the wall: in frame, but not competing with faces.', (o) => { o.z = r2(o.z - 0.6) }),
    mk('Foreground', 'Closer to the lens: it frames the shot and adds depth.', (o) => { if (cam) { o.x = r2(o.x + (cam.x - o.x) * 0.35); o.z = r2(o.z + (cam.z - o.z) * 0.35) } }),
    mk('Other side', 'Mirrored across the room: balances the frame the other way.', (o) => { o.x = r2(-o.x) }),
  ]
}

// ---------------------------------------------------------------- 5. review digest

export async function digestComments(comments, scene) {
  await wait(900)
  const open = comments.filter((c) => !c.resolved)
  const items = []
  const add = (text, command, from) => { const k = items.find((i) => i.command === command); if (k) k.from.push(...from); else items.push({ id: newId('dg'), text, command, from }) }
  for (const c of open) {
    const t = c.text.toLowerCase()
    const who = c.target?.name || scene.actors.find((a) => t.includes(a.name.toLowerCase()))?.name || (/\b(her|she)\b|她/.test(t) ? scene.actors.find((a) => a.model === 'female')?.name : /\b(him|he|his)\b|他/.test(t) ? scene.actors.find((a) => a.model === 'male')?.name : undefined)
    if (/(dark|暗|看不清|can't see)/.test(t)) add(`Lift ${who || 'the lead'}'s face`, `${who || ''} face is too dark`.trim(), [c.author])
    else if (/(bright|亮|hot|blown|过曝)/.test(t)) add('Bring the overall level down', 'make it moodier', [c.author])
    else if (/(warm|暖)/.test(t)) add('Warmer key', 'make it warmer', [c.author])
    else if (/(cold|cool|blue|冷)/.test(t)) add('Cooler background', 'make it cooler', [c.author])
    else if (/(clutter|busy|乱|杂)/.test(t)) add('Clear the tabletops', 'clear the clutter', [c.author])
    else if (/(close|tight|近|特写)/.test(t)) add('Tighter on the main camera', 'tighter on this camera', [c.author])
    else if (/(wide|room|全景)/.test(t)) add('Wider on the main camera', 'wider', [c.author])
    else if (/(door|门)/.test(t)) add(`${who || 'Lead'} closer to the door`, `${who || ''} move closer to the door`.trim(), [c.author])
    else items.push({ id: newId('dg'), text: `Discuss: “${c.text}”`, command: null, from: [c.author] })
  }
  return items
}

// ---------------------------------------------------------------- 6. production notes for the shot plan

export async function productionNotes(scene, kit) {
  await wait(900)
  const cams = [...scene.cameras].sort((a, b) => a.focal - b.focal)
  const order = cams.map((c, i) => {
    const notes = []
    if (i === 0) notes.push('Shoot the widest first while the whole set is dressed and every light is hidden.')
    else notes.push(`Keep the lighting from setup ${i}; only the camera moves. Check for stands creeping into frame.`)
    if (c.focal >= 65) notes.push('Long lens: pull the background practicals in a little brighter so they read as shapes, not black.')
    if (c.y < 1.0) notes.push('Low camera: watch the ceiling and the top of the door frame.')
    return { cam: c.label, shot: c.shot, focal: c.focal, minutes: i === 0 ? 30 + scene.lights.length * 8 : 12, notes }
  })
  const risks = []
  const used = scene.lights.filter((l) => !FIXTURES[l.fixture]?.passive)
  const watts = used.length * 90
  risks.push({ level: watts > 1200 ? 'warn' : 'ok', text: `About ${watts} W of lighting: ${watts > 1200 ? 'split it across two circuits.' : 'one household circuit is enough.'}` })
  const outlets = outletPositions(scene.room)
  const far = used.filter((l) => Math.min(...outlets.map((o) => Math.hypot(o[0] - l.x, o[1] - l.z))) > 4).length
  if (far) risks.push({ level: 'warn', text: `${far} unit${far > 1 ? 's are' : ' is'} more than 4 m from an outlet: bring stingers and tape the runs.` })
  if (scene.objects.some((o) => o.asset === 'candles' && o.on !== false)) risks.push({ level: 'warn', text: 'Real candle on set: keep a fire blanket nearby, and note its height for continuity.' })
  if (scene.room.openings.some((o) => o.type === 'window') && scene.time === 'day') risks.push({ level: 'warn', text: 'Daylight through the window changes by the hour. Shoot the window-facing angle first, or gel the glass.' })
  risks.push({ level: 'ok', text: `Continuity: photograph the set dressing (${scene.objects.length} pieces) before the first take.` })
  const total = order.reduce((a, o) => a + o.minutes, 0)
  return { order, risks, total }
}
