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
    for (const m of mats) {
      const n = (m.name || '').toLowerCase()
      if (n.includes('opacity')) { m.alphaTest = 0.4; m.transparent = false; m.side = THREE.DoubleSide; m.roughness = 0.8 }
      else if (n.includes('head')) { m.roughness = 0.55; if (m.normalScale) m.normalScale.set(0.8, 0.8) }
      else { m.roughness = 0.82 }
      m.envMapIntensity = 0.6
    }
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
  if (style === 'mannequin') applyMannequin(body, MANNEQUIN_TINTS[actor.id] || '#d2cdc5')
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
  g.userData.kind = kind
  return g
}
