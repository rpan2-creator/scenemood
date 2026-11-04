// Film lighting fixtures. `cd` = peak luminous intensity in candela at 100% output
// (lux at 1 m on axis). Values are rounded from typical manufacturer photometrics
// for this class of fixture and are only used for rough planning estimates.

export const FIXTURES = {
  led_panel: {
    id: 'led_panel', name: 'Bi-color LED panel', spec: '60 W · 3200–5600 K',
    cd: 1600, beam: 55, cctMin: 3200, cctMax: 5600, softness: 0.7, symbol: 'panel',
  },
  fresnel: {
    id: 'fresnel', name: 'LED Fresnel', spec: '150 W · 3200–5600 K · 15–45°',
    cd: 5200, beam: 32, cctMin: 3200, cctMax: 5600, softness: 0.25, symbol: 'fresnel',
  },
  cob: {
    id: 'cob', name: 'COB light + softbox', spec: '300 W · 5600 K · 90 cm dome',
    cd: 6800, beam: 70, cctMin: 5600, cctMax: 5600, softness: 0.9, symbol: 'cob',
  },
  tube: {
    id: 'tube', name: 'RGB tube light', spec: '4 ft · 2700–7500 K',
    cd: 320, beam: 120, cctMin: 2700, cctMax: 7500, softness: 0.9, symbol: 'tube',
  },
  skypanel: {
    id: 'skypanel', name: 'Large soft panel', spec: 'S60 class · 2800–10000 K',
    cd: 4200, beam: 110, cctMin: 2800, cctMax: 10000, softness: 0.85, symbol: 'panel',
  },
  hmi: {
    id: 'hmi', name: 'HMI PAR', spec: '1.2 kW · 5600 K · hard',
    cd: 30000, beam: 24, cctMin: 5600, cctMax: 5600, softness: 0.1, symbol: 'fresnel',
  },
  tungsten: {
    id: 'tungsten', name: 'Tungsten Fresnel', spec: '650 W · 3200 K',
    cd: 3800, beam: 30, cctMin: 3200, cctMax: 3200, softness: 0.2, symbol: 'fresnel',
  },
  mat: {
    id: 'mat', name: 'Flexible LED mat', spec: '1×1 ft · 100 W · 2700–6500 K',
    cd: 1400, beam: 100, cctMin: 2700, cctMax: 6500, softness: 0.8, symbol: 'panel',
  },
  lantern: {
    id: 'lantern', name: 'China ball lantern', spec: '60 cm · 2700–5600 K',
    cd: 520, beam: 170, cctMin: 2700, cctMax: 5600, softness: 1, symbol: 'cob',
  },
  bounce: {
    id: 'bounce', name: 'Foam core bounce', spec: '4×8 ft · white',
    cd: 200, beam: 90, cctMin: 3200, cctMax: 5600, softness: 1, symbol: 'reflector', passive: true,
  },
  reflector: {
    id: 'reflector', name: '5-in-1 reflector', spec: '107 cm · silver / gold / white',
    cd: 260, beam: 80, cctMin: 3200, cctMax: 5600, softness: 1, symbol: 'reflector', passive: true,
  },
}

export const GEAR_KITS = [
  {
    id: 'two',
    name: 'Two-light basic',
    note: 'What most student and indie crews actually carry',
    items: { led_panel: 2, reflector: 1 },
  },
  {
    id: 'four',
    name: 'Four-light standard',
    note: 'Small commercial or music video kit',
    rental: 185,
    items: { cob: 1, led_panel: 2, fresnel: 1, tube: 1, reflector: 1 },
  },
  {
    id: 'doc',
    name: 'Run and gun',
    note: 'Documentary bag: battery mats and tubes',
    items: { mat: 2, tube: 2, reflector: 1 },
  },
  {
    id: 'tungsten',
    name: 'Tungsten classic',
    note: 'Three Fresnels, a lantern and bounce',
    rental: 120,
    items: { tungsten: 3, lantern: 1, bounce: 1 },
  },
  {
    id: 'night_ext',
    name: 'Night exterior',
    note: 'An HMI for moonlight, a big soft source, tubes',
    rental: 340,
    items: { hmi: 1, skypanel: 1, tube: 2, reflector: 1 },
  },
  {
    id: 'natural',
    name: 'Natural light',
    note: 'Window light, one tube and bounce',
    items: { tube: 1, reflector: 1 },
  },
]

export const getKit = (id) => GEAR_KITS.find((k) => k.id === id) || GEAR_KITS[0]

// Correlated color temperature (Kelvin) to linear-ish sRGB hex. Tanner Helland approximation.
export function cctToRgb(k) {
  const t = k / 100
  let r, g, b
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    b = 255
  }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)))
  return [c(r), c(g), c(b)]
}

export const cctToHex = (k) => {
  const [r, g, b] = cctToRgb(k)
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}
