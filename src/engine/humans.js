import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Rigged, realistic people (Mixamo / Ready Player Me rigs) posed procedurally.
// Poses are written as world-space bone directions in the character's own frame
// (+Z forward, +Y up), so the same pose works on any humanoid rig.

// Scanned-quality people from Microsoft Rocketbox (MIT licence), converted to glTF with web-size textures.
export const HUMAN_MODELS = {
  male: { url: 'models/rb-male.glb', credit: 'Microsoft Rocketbox avatar Male_Adult_07, MIT licence' },
  female: { url: 'models/rb-female.glb', credit: 'Microsoft Rocketbox avatar Female_Adult_14, MIT licence' },
  third: { url: 'models/rb-third.glb', credit: 'Microsoft Rocketbox avatar Male_Adult_02, MIT licence' },
}

// 3ds Max biped bone names (Rocketbox) mapped to the Mixamo names the poses use
const BIP = {
  Pelvis: 'Hips', Spine: 'Spine', Spine1: 'Spine1', Spine2: 'Spine2', Neck: 'Neck', Head: 'Head',
  L_Thigh: 'LeftUpLeg', R_Thigh: 'RightUpLeg', L_Calf: 'LeftLeg', R_Calf: 'RightLeg', L_Foot: 'LeftFoot', R_Foot: 'RightFoot',
  L_Toe0: 'LeftToeBase', R_Toe0: 'RightToeBase', L_UpperArm: 'LeftArm', R_UpperArm: 'RightArm', L_Forearm: 'LeftForeArm', R_Forearm: 'RightForeArm',
  L_Hand: 'LeftHand', R_Hand: 'RightHand',
}

const loader = new GLTFLoader()
const cache = new Map()
export function loadHuman(kind) {
  const m = HUMAN_MODELS[kind] || HUMAN_MODELS.female
  if (!cache.has(m.url)) cache.set(m.url, loader.loadAsync(m.url).then((g) => g.scene))
  return cache.get(m.url)
}

const L = (x, y, z) => new THREE.Vector3(x, y, z).normalize()

export const POSES = {
  stand: {
    seat: false,
    dirs: {
      Spine: L(0, 1, 0), Spine2: L(0, 1, 0.02), Neck: L(0, 1, 0.08),
      LeftUpLeg: L(0.04, -1, 0), RightUpLeg: L(-0.04, -1, 0),
      LeftLeg: L(0.02, -1, -0.03), RightLeg: L(-0.02, -1, -0.03),
      LeftFoot: L(0.1, -0.45, 1), RightFoot: L(-0.1, -0.45, 1),
      LeftArm: L(0.16, -1, 0.02), RightArm: L(-0.16, -1, 0.02),
      LeftForeArm: L(0.06, -1, 0.14), RightForeArm: L(-0.06, -1, 0.14),
    },
  },
  crossed: {
    seat: false,
    dirs: {
      Spine: L(0, 1, -0.04), Spine2: L(0, 1, 0), Neck: L(0, 1, 0.12),
      LeftUpLeg: L(0.05, -1, 0), RightUpLeg: L(-0.05, -1, 0),
      LeftLeg: L(0.02, -1, -0.03), RightLeg: L(-0.02, -1, -0.03),
      LeftFoot: L(0.12, -0.45, 1), RightFoot: L(-0.12, -0.45, 1),
      LeftArm: L(0.32, -1, 0.38), RightArm: L(-0.32, -1, 0.42),
      LeftForeArm: L(-1, 0.18, 0.42), RightForeArm: L(1, 0.26, 0.36),
    },
  },
  sit: {
    seat: true,
    dirs: {
      Spine: L(0, 1, -0.08), Spine2: L(0, 1, 0.02), Neck: L(0, 1, 0.12),
      LeftUpLeg: L(0.12, -0.08, 1), RightUpLeg: L(-0.12, -0.08, 1),
      LeftLeg: L(0.03, -1, 0.1), RightLeg: L(-0.03, -1, 0.1),
      LeftFoot: L(0.12, -0.35, 1), RightFoot: L(-0.12, -0.35, 1),
      LeftArm: L(0.2, -1, 0.25), RightArm: L(-0.2, -1, 0.25),
      LeftForeArm: L(0.08, -0.35, 1), RightForeArm: L(-0.08, -0.35, 1),
    },
  },
  hunched: {
    seat: true,
    dirs: {
      Spine: L(0, 1, 0.3), Spine2: L(0, 1, 0.4), Neck: L(0, 1, 0.5),
      LeftUpLeg: L(0.16, -0.05, 1), RightUpLeg: L(-0.16, -0.05, 1),
      LeftLeg: L(0.05, -1, 0.06), RightLeg: L(-0.05, -1, 0.06),
      LeftFoot: L(0.12, -0.35, 1), RightFoot: L(-0.12, -0.35, 1),
      LeftArm: L(0.18, -0.75, 0.7), RightArm: L(-0.18, -0.75, 0.7),
      LeftForeArm: L(-0.55, -0.2, 0.8), RightForeArm: L(0.55, -0.2, 0.8),
    },
  },
  turned: {
    // seated, shoulders turned away, arms wrapped: closed off
    seat: true,
    dirs: {
      Spine: L(0, 1, -0.06), Spine2: L(0, 1, 0.05), Neck: L(-0.18, 1, 0.1),
      LeftUpLeg: L(0.2, -0.06, 1), RightUpLeg: L(0.02, -0.06, 1),
      LeftLeg: L(0.08, -1, 0.1), RightLeg: L(0, -1, 0.1),
      LeftFoot: L(0.15, -0.35, 1), RightFoot: L(0, -0.35, 1),
      LeftArm: L(0.28, -1, 0.4), RightArm: L(-0.28, -1, 0.45),
      LeftForeArm: L(-1, 0.2, 0.35), RightForeArm: L(1, 0.28, 0.3),
    },
  },
}

const ORDER = ['Spine', 'Spine2', 'Neck', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']
const CHILD = {
  Spine: 'Spine1', Spine2: 'Neck', Neck: 'Head', LeftUpLeg: 'LeftLeg', RightUpLeg: 'RightLeg', LeftLeg: 'LeftFoot', RightLeg: 'RightFoot',
  LeftFoot: 'LeftToeBase', RightFoot: 'RightToeBase', LeftArm: 'LeftForeArm', RightArm: 'RightForeArm', LeftForeArm: 'LeftHand', RightForeArm: 'RightHand',
}

function bonesOf(root) {
  const map = {}
  root.traverse((o) => {
    if (!o.isBone) return
    let short = o.name.replace(/^mixamorig:?/, '')
    const bip = short.match(/^Bip01[_ ](.+)$/)
    if (bip) short = BIP[bip[1].replace(/ /g, '_')] || short
    if (!map[short]) map[short] = o
  })
  return map
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion()
function aim(bone, child, dir) {
  bone.updateWorldMatrix(true, false)
  child.updateWorldMatrix(true, false)
  bone.getWorldPosition(_a)
  child.getWorldPosition(_b)
  const cur = _b.sub(_a).normalize()
  if (cur.lengthSq() < 1e-6) return
  _q.setFromUnitVectors(cur, dir)
  bone.getWorldQuaternion(_wq)
  bone.parent.getWorldQuaternion(_pq)
  bone.quaternion.copy(_pq.invert().multiply(_q).multiply(_wq))
  bone.updateWorldMatrix(false, true)
}

// darken or lighten only skin-colored texels (single-texture characters wear clothes in the same map)
const TONE = { light: [1.04, 1.02, 1.0], medium: [0.8, 0.68, 0.58], deep: [0.46, 0.34, 0.27] }
function applyTone(root, tone, outfit) {
  const k = TONE[tone] || TONE.medium
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    o.material = mats.map((m0) => {
      const m = m0.clone()
      const name = (m.name || '').toLowerCase()
      const isSkinMat = /skin|body|head/.test(name) && !/eye|teeth|tongue|lash|brow|hair/.test(name)
      if (isSkinMat) {
        {
          m.onBeforeCompile = (sh) => {
            sh.uniforms.toneMul = { value: new THREE.Vector3(...k) }
            sh.fragmentShader = 'uniform vec3 toneMul;\n' + sh.fragmentShader.replace(
              '#include <map_fragment>',
              `#include <map_fragment>
              {
                vec3 c = diffuseColor.rgb;
                vec3 s = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); // judge skin in display space
                float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b));
                float sat = (mx - mn) / max(mx, 1e-4);
                float hueOk = step(s.b, s.g + 0.02) * step(s.g, s.r + 0.01) * step(0.06, s.r - s.b);
                float skin = hueOk * smoothstep(0.1, 0.2, sat) * (1.0 - smoothstep(0.72, 0.85, sat)) * smoothstep(0.12, 0.22, mx);
                diffuseColor.rgb = mix(c, c * toneMul, skin);
              }`)
          }
          m.customProgramCacheKey = () => 'tone' + tone + (outfit || '')
        }
      }
      const fabric = (c) => { const col = new THREE.Color(c); m.color = col; if (m.map) { m.map = m.map } }
      if (outfit && name.includes('outfit_top')) fabric(outfit)
      if (name.includes('headwear')) m.visible = false
      return m
    })
    if (o.material.length === 1) o.material = o.material[0]
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
  })
}

// Previs mannequins: one matte material per character, no eyes or lashes. Reads as deliberate,
// not uncanny; photoreal people come from the reference-frame image model instead.
export const MANNEQUIN_TINTS = { actor_a: '#9ea6b1', actor_b: '#b9a495', actor_c: '#a2ad96' }
// Previs actors: real body proportions and clothing folds, rendered in neutral grey with a blank,
// featureless head. Readable blocking without faces, so nobody's likeness is used.
export const PREVIS_TINTS = { actor_a: '#a7adb5', actor_b: '#b8b0a6', actor_c: '#a9b0a4' }
let style = 'real'
export const setHumanStyle = (s) => { style = s }
export const getHumanStyle = () => style
function applyMannequin(root, tint) {
  const base = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.62, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.6, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') })
  const dark = base.clone(); dark.color = new THREE.Color(tint).multiplyScalar(0.62)
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const names = mats.map((m) => (m.name || '').toLowerCase()).join(' ') + ' ' + (o.name || '').toLowerCase()
    if (/eye|teeth|tongue|lash|brow|headwear|hair|ponytail|beard/.test(names)) { o.visible = false; return }
    o.material = /hair|ponytail|beard|shoe|footwear/.test(names) ? dark : base
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
  })
}

function applyReal(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const next = mats.map((m) => {
      const n = (m.name || '').toLowerCase()
      if (n.includes('opacity')) { const h = m.clone(); h.alphaTest = 0.5; h.transparent = false; h.side = THREE.DoubleSide; h.roughness = 0.75; h.envMapIntensity = 0.5; return h }
      if (n.includes('head')) {
        // skin: soft forward scatter (sheen) and a faint warm rim, glossier where the scan says so (eyes, lips)
        const k = new THREE.MeshPhysicalMaterial({ map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: 0.95, metalness: 0,
          sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffb999'), specularIntensity: 0.55, envMapIntensity: 0.55 })
        if (k.normalMap) k.normalScale = new THREE.Vector2(0.9, 0.9)
        k.name = m.name
        return k
      }
      const c = m.clone(); c.roughness = 1; c.envMapIntensity = 0.45
      return c
    })
    o.material = next.length === 1 ? next[0] : next
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
  })
}

// Previs heads: the scanned head and upper neck are cut away and replaced by one smooth lathe
// (neck into an ovoid skull), placed on the posed Neck and Head bones. No face, no hair.
const cutCache = new WeakMap()
function cutHead(geom) {
  if (cutCache.has(geom)) return cutCache.get(geom)
  const g = geom.clone()
  const pos = g.attributes.position, idx = g.index
  let hi = -Infinity
  for (let i = 0; i < pos.count; i++) hi = Math.max(hi, pos.getZ(i))
  // Rocketbox bind space is z-up in centimetres; keep everything below the lower neck
  const cut = hi - hi * 0.125 * 1.25
  if (idx) {
    const keep = []
    for (let i = 0; i < idx.count; i += 3) { const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]; if (t.every((v) => pos.getZ(v) < cut)) keep.push(...t) }
    g.setIndex(keep)
  }
  cutCache.set(geom, g)
  return g
}
let headGeom = null
function previsHeadGeometry() {
  if (headGeom) return headGeom
  const P = [[0.0, -0.06], [0.056, -0.06], [0.055, 0.0], [0.052, 0.06], [0.05, 0.095], [0.058, 0.112], [0.074, 0.13], [0.086, 0.158], [0.091, 0.19], [0.089, 0.222], [0.081, 0.252], [0.066, 0.279], [0.044, 0.298], [0.02, 0.308], [0.0, 0.311]]
  headGeom = new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x, y)), 40)
  return headGeom
}
function addPrevisHead(group, bones, tint, stature) {
  const neck = bones.Neck, head = bones.Head
  if (!neck || !head) return
  const a = new THREE.Vector3(), b = new THREE.Vector3()
  neck.getWorldPosition(a); head.getWorldPosition(b)
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert()
  a.applyMatrix4(inv); b.applyMatrix4(inv)
  const axis = b.clone().sub(a)
  const len = axis.length()
  if (len < 1e-4) return
  axis.normalize()
  const m = new THREE.Mesh(previsHeadGeometry(), new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).multiplyScalar(1.05), roughness: 0.5, metalness: 0 }))
  const k = stature / 1.78
  m.scale.set(k * 0.94, k, k * 1.08)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
  // keep the chin over the chest: the face side of the ovoid follows the body's facing (+Z)
  m.position.copy(a)
  m.castShadow = true; m.receiveShadow = true
  m.name = 'previs-head'
  group.add(m)
}

function greyFabric(tint) {
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.78, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = vec3(0.55 + 0.9 * pow(l, 0.8)) * diffuse; }`)
  }
  m.customProgramCacheKey = () => 'greyFabric'
  return m
}

function applyPrevis(root, tint) {
  root.traverse((o) => { if ((o.isMesh || o.isSkinnedMesh) && !Array.isArray(o.material) && /head/i.test(o.material?.name || '')) o.geometry = cutHead(o.geometry) })
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const next = mats.map((m) => {
      const n = (m.name || '').toLowerCase()
      if (n.includes('opacity') || /eye|lash|hair|brow/.test(n)) { const h = new THREE.MeshBasicMaterial(); h.visible = false; return h }
      if (n.includes('head')) return new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).multiplyScalar(1.06), roughness: 0.55, metalness: 0 })
      const f = greyFabric(tint); f.map = m.map || null; f.normalMap = m.normalMap || null; if (f.normalMap) f.normalScale = new THREE.Vector2(1, 1); return f
    })
    o.material = next.length === 1 ? next[0] : next
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
  })
}

// Dressed stand-ins: the actor's real clothes, hair and hands, but a smooth, featureless head in
// their skin tone, like a display mannequin. Reads as a person in frame without anyone's face.
const SKIN = { light: '#dcb79a', medium: '#b4876a', deep: '#6f4d3c' }
function desatFabric(m0, amount) {
  const m = new THREE.MeshStandardMaterial({ map: m0.map || null, normalMap: m0.normalMap || null, roughness: 0.82, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.desat = { value: amount }
    sh.fragmentShader = 'uniform float desat;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(1.04, 1.0, 0.95), desat); }`)
  }
  m.customProgramCacheKey = () => 'desat' + amount
  return m
}
function applyDressed(root, { desat = 0, hairColor = null } = {}) {
  root.traverse((o) => { if ((o.isMesh || o.isSkinnedMesh) && !Array.isArray(o.material) && /head/i.test(o.material?.name || '')) o.geometry = cutHead(o.geometry) })
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const next = mats.map((m) => {
      const n = (m.name || '').toLowerCase()
      if (n.includes('opacity')) { const h = new THREE.MeshBasicMaterial(); h.visible = false; return h }
      if (n.includes('head')) { const h = new THREE.MeshBasicMaterial(); h.visible = false; return h }
      return desat ? desatFabric(m, desat) : Object.assign(m.clone(), { roughness: 0.82, envMapIntensity: 0.6 })
    })
    o.material = next.length === 1 ? next[0] : next
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
  })
}

// Build a posed person. Returns a Group whose origin is the floor point under the hips, facing +Z.
export async function buildHuman(actor, seatHeight = 0.45) {
  const kind = actor.model || (actor.id === 'actor_b' ? 'female' : actor.id === 'actor_c' ? 'third' : 'male')
  const proto = await loadHuman(kind)
  const body = skeletonClone(proto)
  if (style === 'previs') applyPrevis(body, PREVIS_TINTS[actor.id] || '#adb0b3')
  else if (style === 'dressed') applyDressed(body)
  else if (style === 'soft') applyDressed(body, { desat: 0.72 })
  else if (style === 'mannequin') applyMannequin(body, MANNEQUIN_TINTS[actor.id] || '#d2cdc5')
  else applyReal(body)
  const bones = bonesOf(body)
  const pose = POSES[actor.pose] || (actor.pose === 'sit' ? POSES.sit : POSES.stand)
  body.updateWorldMatrix(true, true)
  for (const name of ORDER) {
    const b = bones[name], c = bones[CHILD[name]]
    if (b && c && pose.dirs[name]) aim(b, c, pose.dirs[name])
  }
  // Spine1 follows halfway between Spine and Spine2
  if (bones.Spine1 && bones.Spine2 && pose.dirs.Spine2) aim(bones.Spine1, bones.Spine2, pose.dirs.Spine2)
  body.updateWorldMatrix(true, true)
  const g = new THREE.Group()
  g.add(body)
  const hips = bones.Hips
  const hp = new THREE.Vector3()
  hips.getWorldPosition(hp)
  // put the hips over the origin; seated people rest on the seat, standing people on the floor
  body.position.x -= hp.x
  body.position.z -= hp.z
  if (pose.seat) {
    body.position.y += seatHeight + 0.1 - hp.y
  } else {
    body.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(body, true)
    body.position.y -= box.min.y
  }
  if (style === 'previs' || style === 'dressed' || style === 'soft') {
    g.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(body, true)
    const tone = style === 'dressed' ? (SKIN[actor.tone] || SKIN.medium) : style === 'soft' ? '#d9d3c9' : (PREVIS_TINTS[actor.id] || '#adb0b3')
    addPrevisHead(g, bones, tone, pose.seat ? 1.78 : Math.max(1.55, Math.min(1.95, box.max.y - box.min.y)))
  }
  g.userData.kind = kind
  return g
}
