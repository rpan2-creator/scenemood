// Room templates. Units are meters. The room is centered on the origin, floor at y = 0.
// Walls: N = back (z = -d/2), S = front (z = +d/2), W = left (x = -w/2), E = right (x = +w/2).
// An opening's `at` is its center along the wall, measured from the wall's middle.

export const ROOM_TEMPLATES = [
  {
    id: 'living',
    name: 'Living room',
    note: 'Apartment, two windows, one door',
    w: 5.4, d: 4.4, h: 2.7,
    floor: '#e8dccd', wall: '#b9afa1', floorType: 'wood',
    openings: [
      { id: 'win1', type: 'window', wall: 'W', at: -0.9, width: 1.0, height: 1.5, sill: 0.8 },
      { id: 'win2', type: 'window', wall: 'W', at: 0.6, width: 1.0, height: 1.5, sill: 0.8 },
      { id: 'door1', type: 'door', wall: 'E', at: -1.2, width: 0.9, height: 2.1, sill: 0 },
    ],
    outlets: [{ wall: 'N', at: 1.8 }, { wall: 'S', at: -1.6 }, { wall: 'E', at: 1.2 }],
    starter: [
      { asset: 'sofa', x: 0.1, z: -1.65, rot: 0 },
      { asset: 'coffee_round', x: 0.1, z: -0.55, rot: 0 },
      { asset: 'standing_lamp', x: 1.75, z: -1.85, rot: 0 },
      { asset: 'plant_tall', x: -2.3, z: 1.4, rot: 0 },
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    note: 'One window, one door, low ceiling',
    w: 4.2, d: 3.8, h: 2.55,
    floor: '#f0e2cf', wall: '#9fa8a6', floorType: 'wood',
    openings: [
      { id: 'win1', type: 'window', wall: 'N', at: 1.1, width: 1.2, height: 1.4, sill: 0.9 },
      { id: 'door1', type: 'door', wall: 'S', at: 1.4, width: 0.85, height: 2.05, sill: 0 },
    ],
    outlets: [{ wall: 'N', at: -1.2 }, { wall: 'W', at: 0.6 }],
    starter: [
      { asset: 'bed', x: -0.6, z: -0.7, rot: 0 },
      { asset: 'side_table', x: -1.75, z: -1.55, rot: 0 },
      { asset: 'table_lamp', x: -1.75, z: -1.55, rot: 0, y: 0.55 },
      { asset: 'dresser', x: 1.45, z: 1.4, rot: Math.PI },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    note: 'Open plan corner, window wall',
    w: 6.2, d: 5.0, h: 2.9,
    floor: '#c9cbcb', wall: '#a7acab', floorType: 'concrete',
    openings: [
      { id: 'win1', type: 'window', wall: 'N', at: -1.4, width: 1.6, height: 1.8, sill: 0.7 },
      { id: 'win2', type: 'window', wall: 'N', at: 1.0, width: 1.6, height: 1.8, sill: 0.7 },
      { id: 'door1', type: 'door', wall: 'E', at: 1.6, width: 1.0, height: 2.1, sill: 0 },
    ],
    outlets: [{ wall: 'W', at: 0 }, { wall: 'S', at: 0.8 }, { wall: 'N', at: 2.4 }],
    starter: [
      { asset: 'desk', x: -1.2, z: -1.4, rot: 0 },
      { asset: 'office_chair', x: -1.2, z: -0.75, rot: Math.PI },
      { asset: 'bookshelf', x: 2.6, z: -2.25, rot: 0 },
      { asset: 'plant_tall', x: 2.7, z: 1.9, rot: 0 },
    ],
  },
  {
    id: 'diner',
    name: 'Kitchen diner',
    note: 'Dining table, pendant light, door to hall',
    w: 5.0, d: 4.0, h: 2.6,
    floor: '#ffffff', wall: '#b9b0a0', floorType: 'tile',
    openings: [
      { id: 'win1', type: 'window', wall: 'W', at: 0, width: 1.4, height: 1.3, sill: 1.0 },
      { id: 'door1', type: 'door', wall: 'S', at: 1.5, width: 0.85, height: 2.05, sill: 0 },
    ],
    outlets: [{ wall: 'N', at: 0 }, { wall: 'E', at: -1.0 }],
    starter: [
      { asset: 'dining_table', x: 0, z: 0, rot: 0 },
      { asset: 'dining_chair', x: -0.55, z: 0.62, rot: Math.PI },
      { asset: 'dining_chair', x: 0.55, z: -0.62, rot: 0 },
      { asset: 'pendant', x: 0, z: 0, rot: 0 },
      { asset: 'sideboard', x: 0, z: -1.75, rot: 0 },
    ],
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    note: 'Big concrete interior, high windows',
    w: 12, d: 9, h: 5.5,
    floor: '#9a9a96', wall: '#8f908c', floorType: 'concrete',
    openings: [
      { id: 'win1', type: 'window', wall: 'N', at: -3, width: 2.4, height: 1.4, sill: 3.4 },
      { id: 'win2', type: 'window', wall: 'N', at: 1.5, width: 2.4, height: 1.4, sill: 3.4 },
      { id: 'door1', type: 'door', wall: 'E', at: 2.5, width: 2.6, height: 3.0, sill: 0 },
    ],
    outlets: [{ wall: 'W', at: 0 }, { wall: 'S', at: 3 }],
    starter: [
      { asset: 'crate', x: -4.2, z: -3.2, rot: 0.2 }, { asset: 'crate', x: -3.4, z: -3.4, rot: -0.1 },
      { asset: 'barrel_fire', x: 3.5, z: -2.5, rot: 0 }, { asset: 'car', x: 3.8, z: 1.6, rot: 1.3 },
    ],
  },
  {
    id: 'studio_flat', name: 'Studio flat', note: 'Bed and sofa in one room, big window',
    w: 6.0, d: 4.6, h: 2.6, floor: '#d9c8b2', wall: '#a8a39a', floorType: 'wood',
    openings: [
      { id: 'win1', type: 'window', wall: 'N', at: -1.2, width: 1.8, height: 1.6, sill: 0.7 },
      { id: 'door1', type: 'door', wall: 'E', at: 1.5, width: 0.9, height: 2.1, sill: 0 },
    ],
    outlets: [{ wall: 'W', at: 0.5 }, { wall: 'S', at: -1.8 }],
    starter: [
      { asset: 'bed', x: -1.6, z: -1.1, rot: 0 }, { asset: 'sofa', x: 1.4, z: 0.9, rot: Math.PI },
      { asset: 'rug', x: 1.2, z: 0.2, rot: 0 }, { asset: 'side_table', x: -2.6, z: -1.8, rot: 0 },
      { asset: 'table_lamp', x: -2.6, z: -1.8, rot: 0, y: 0.55 }, { asset: 'tv', x: 1.4, z: -1.95, rot: 0 }, { asset: 'boxes', x: 2.4, z: 1.7, rot: 0.3 },
    ],
  },
  {
    id: 'bar', name: 'Bar', note: 'Counter, stools, pendants, a neon sign',
    w: 7.0, d: 5.0, h: 3.0, floor: '#5a4636', wall: '#5d554c', floorType: 'wood',
    openings: [
      { id: 'win1', type: 'window', wall: 'S', at: -2.0, width: 1.6, height: 1.6, sill: 0.8 },
      { id: 'door1', type: 'door', wall: 'S', at: 1.8, width: 1.0, height: 2.2, sill: 0 },
    ],
    outlets: [{ wall: 'N', at: 2.5 }, { wall: 'W', at: 0 }],
    starter: [
      { asset: 'counter', x: 0, z: -1.4, rot: 0 }, { asset: 'bar_stool', x: -0.6, z: -0.7, rot: 0 }, { asset: 'bar_stool', x: 0, z: -0.7, rot: 0 }, { asset: 'bar_stool', x: 0.6, z: -0.7, rot: 0 },
      { asset: 'pendant', x: -0.5, z: -1.4, rot: 0 }, { asset: 'pendant', x: 0.5, z: -1.4, rot: 0 }, { asset: 'neon_sign', x: 1.8, z: -2.45, rot: 0 },
      { asset: 'armchair', x: -2.6, z: 1.3, rot: 0.6 }, { asset: 'side_table', x: -2.0, z: 1.7, rot: 0 }, { asset: 'candles', x: -2.0, z: 1.7, rot: 0, y: 0.55 },
    ],
  },
  {
    id: 'cafe', name: 'Café', note: 'Two tables by the window, a counter',
    w: 6.5, d: 5.0, h: 2.9, floor: '#e9e2d6', wall: '#b8ada0', floorType: 'tile',
    openings: [
      { id: 'win1', type: 'window', wall: 'W', at: -1.0, width: 2.0, height: 1.8, sill: 0.6 },
      { id: 'win2', type: 'window', wall: 'W', at: 1.4, width: 1.4, height: 1.8, sill: 0.6 },
      { id: 'door1', type: 'door', wall: 'S', at: 2.0, width: 0.9, height: 2.1, sill: 0 },
    ],
    outlets: [{ wall: 'N', at: 1.0 }, { wall: 'E', at: 0 }],
    starter: [
      { asset: 'dining_table', x: -1.6, z: -1.0, rot: 0 }, { asset: 'dining_chair', x: -1.6, z: -0.35, rot: Math.PI }, { asset: 'dining_chair', x: -1.6, z: -1.65, rot: 0 },
      { asset: 'dining_table', x: -1.6, z: 1.3, rot: 0 }, { asset: 'dining_chair', x: -1.6, z: 1.95, rot: Math.PI },
      { asset: 'counter', x: 2.0, z: -1.6, rot: Math.PI / 2 }, { asset: 'pendant', x: -1.6, z: -1.0, rot: 0 }, { asset: 'plant_small', x: 2.8, z: 2.0, rot: 0 }, { asset: 'flowers', x: -1.6, z: 1.3, rot: 0, y: 0.75 },
    ],
  },
  {
    id: 'study', name: 'Study', note: 'Bookshelves, a desk, a reading chair',
    w: 4.8, d: 4.2, h: 2.8, floor: '#7a5a40', wall: '#8b7f6e', floorType: 'wood',
    openings: [
      { id: 'win1', type: 'window', wall: 'E', at: -0.6, width: 1.2, height: 1.5, sill: 0.85 },
      { id: 'door1', type: 'door', wall: 'S', at: -1.4, width: 0.85, height: 2.05, sill: 0 },
    ],
    outlets: [{ wall: 'N', at: 0 }, { wall: 'W', at: 1.0 }],
    starter: [
      { asset: 'bookshelf', x: -1.2, z: -1.85, rot: 0 }, { asset: 'bookshelf', x: 0.3, z: -1.85, rot: 0 }, { asset: 'desk', x: 1.5, z: -0.6, rot: -Math.PI / 2 },
      { asset: 'office_chair', x: 0.9, z: -0.6, rot: Math.PI / 2 }, { asset: 'desk_lamp', x: 1.6, z: -0.9, rot: 0, y: 0.75 }, { asset: 'armchair', x: -1.4, z: 0.6, rot: 0.5 },
      { asset: 'rug', x: -0.6, z: 0.4, rot: 0 }, { asset: 'clock', x: -2.35, z: 0, rot: 0 },
    ],
  },
  {
    id: 'hotel', name: 'Hotel room', note: 'Bed, armchair, a long curtain',
    w: 5.0, d: 4.4, h: 2.7, floor: '#b9a88e', wall: '#c2b8a8', floorType: 'wood',
    openings: [
      { id: 'win1', type: 'window', wall: 'N', at: 0.8, width: 2.2, height: 1.9, sill: 0.4 },
      { id: 'door1', type: 'door', wall: 'S', at: -1.6, width: 0.9, height: 2.1, sill: 0 },
    ],
    outlets: [{ wall: 'W', at: -1.0 }, { wall: 'E', at: 1.0 }],
    starter: [
      { asset: 'bed', x: -0.8, z: -0.4, rot: 0 }, { asset: 'side_table', x: -2.0, z: -1.6, rot: 0 }, { asset: 'table_lamp', x: -2.0, z: -1.6, rot: 0, y: 0.55 },
      { asset: 'armchair', x: 1.6, z: -1.2, rot: -0.6 }, { asset: 'curtain', x: 0.8, z: -2.1, rot: 0 }, { asset: 'mirror', x: 2.45, z: 0.8, rot: 0 }, { asset: 'suitcase', x: 1.5, z: 1.4, rot: 0.4 },
    ],
  },
  {
    id: 'rehearsal', name: 'Rehearsal room', note: 'Amp, mic stand, a sofa against the wall',
    w: 6.0, d: 5.0, h: 3.0, floor: '#6b6b68', wall: '#3f3d3a', floorType: 'concrete',
    openings: [{ id: 'door1', type: 'door', wall: 'E', at: 1.6, width: 1.0, height: 2.1, sill: 0 }],
    outlets: [{ wall: 'N', at: -1.5 }, { wall: 'N', at: 1.5 }, { wall: 'W', at: 0 }],
    starter: [
      { asset: 'mic_stand', x: 0, z: -0.4, rot: 0 }, { asset: 'amp', x: -1.2, z: -1.9, rot: 0.2 }, { asset: 'amp', x: 1.2, z: -1.9, rot: -0.2 },
      { asset: 'sofa', x: 0, z: 2.05, rot: Math.PI }, { asset: 'rug', x: 0, z: -0.6, rot: 0 }, { asset: 'neon_sign', x: 0, z: -2.45, rot: 0 }, { asset: 'standing_lamp', x: -2.6, z: 1.9, rot: 0 },
    ],
  },
  {
    id: 'hallway', name: 'Hallway', note: 'Long and narrow, a door at each end',
    w: 8.0, d: 2.2, h: 2.6, floor: '#c9b9a2', wall: '#b3ab9e', floorType: 'wood',
    openings: [
      { id: 'door1', type: 'door', wall: 'W', at: 0, width: 0.9, height: 2.1, sill: 0 },
      { id: 'door2', type: 'door', wall: 'E', at: 0, width: 0.9, height: 2.1, sill: 0 },
      { id: 'door3', type: 'door', wall: 'N', at: 1.5, width: 0.85, height: 2.05, sill: 0 },
    ],
    outlets: [{ wall: 'S', at: -2.0 }],
    starter: [
      { asset: 'pendant', x: -2, z: 0, rot: 0 }, { asset: 'pendant', x: 2, z: 0, rot: 0 }, { asset: 'coat_rack', x: -3.4, z: -0.75, rot: 0 },
      { asset: 'wall_art', x: -1, z: -1.08, rot: 0 }, { asset: 'mirror', x: 2.6, z: 1.08, rot: 0 }, { asset: 'plant_small', x: 3.5, z: -0.75, rot: 0 },
    ],
  },
  // ---- exteriors: no walls; w × d is the playing area, h is how tall stands can go
  {
    id: 'street', kind: 'exterior', name: 'Street at night', note: 'Sidewalk, street light, parked car',
    w: 14, d: 10, h: 6, ground: 'asphalt',
    openings: [], outlets: [{ wall: 'S', at: 5 }],
    starter: [
      { asset: 'streetlight', x: -3.6, z: -2.6, rot: 0 }, { asset: 'car', x: 1.8, z: -2.4, rot: Math.PI / 2 },
      { asset: 'bench', x: -1.2, z: -3.4, rot: 0 }, { asset: 'tree', x: 5.2, z: -3.6, rot: 0 }, { asset: 'fence', x: -5.4, z: -4.2, rot: 0 },
    ],
  },
  {
    id: 'battlefield', kind: 'exterior', name: 'Battlefield', note: 'Trench line, sandbags, ruins',
    w: 16, d: 12, h: 8, ground: 'dirt', haze: 0.6,
    openings: [], outlets: [{ wall: 'S', at: -6 }],
    starter: [
      { asset: 'sandbags', x: -1.6, z: -1.2, rot: 0.1 }, { asset: 'sandbags', x: 1.0, z: -1.4, rot: -0.15 },
      { asset: 'barbed_wire', x: 0.2, z: -3.6, rot: 0.05 }, { asset: 'crater', x: 3.8, z: 1.6, rot: 0 },
      { asset: 'ruin_wall', x: -4.6, z: -3.2, rot: 0.35 }, { asset: 'barrel_fire', x: -3.2, z: 1.2, rot: 0 },
      { asset: 'crate', x: 3.1, z: -1.6, rot: 0.4 }, { asset: 'tent', x: 5.6, z: -3.4, rot: -0.5 }, { asset: 'rock', x: -5.8, z: 2.8, rot: 0.8 },
    ],
  },
  {
    id: 'forest', kind: 'exterior', name: 'Forest clearing', note: 'Trees, a campfire, a tent',
    w: 14, d: 12, h: 7, ground: 'grass',
    openings: [], outlets: [],
    starter: [
      { asset: 'campfire', x: 0, z: -0.6, rot: 0 }, { asset: 'tent', x: -3.4, z: -3.2, rot: 0.4 },
      { asset: 'tree', x: -5.2, z: -4.4, rot: 0 }, { asset: 'tree', x: 4.6, z: -4.0, rot: 1 }, { asset: 'tree', x: 5.6, z: 2.8, rot: 2 },
      { asset: 'rock', x: 1.6, z: -0.2, rot: 0.3 }, { asset: 'rock', x: -1.6, z: 0.2, rot: 1.9 },
    ],
  },
  {
    id: 'parking', kind: 'exterior', name: 'Parking lot', note: 'Two cars, sodium lights, cones',
    w: 16, d: 12, h: 7, ground: 'asphalt',
    openings: [], outlets: [{ wall: 'N', at: 6 }],
    starter: [
      { asset: 'car', x: -1.6, z: -1.6, rot: 0 }, { asset: 'car', x: 2.2, z: -1.8, rot: 0.1 }, { asset: 'streetlight', x: -5.2, z: -3.6, rot: 0 }, { asset: 'streetlight', x: 5.4, z: -3.8, rot: 0 },
      { asset: 'traffic_cone', x: 0.4, z: 1.4, rot: 0 }, { asset: 'traffic_cone', x: 1.0, z: 1.8, rot: 0 }, { asset: 'trash_can', x: -6.4, z: 1.2, rot: 0 },
    ],
  },
  {
    id: 'park', kind: 'exterior', name: 'City park', note: 'Benches under trees, one lamp post',
    w: 14, d: 12, h: 7, ground: 'grass',
    openings: [], outlets: [{ wall: 'S', at: -5 }],
    starter: [
      { asset: 'bench', x: -1.4, z: -1.6, rot: 0 }, { asset: 'bench', x: 2.6, z: -1.2, rot: -0.4 }, { asset: 'streetlight', x: 0.6, z: -2.8, rot: 0 },
      { asset: 'tree', x: -4.8, z: -3.8, rot: 0 }, { asset: 'tree', x: 4.8, z: -4.2, rot: 1.2 }, { asset: 'tree', x: -5.4, z: 3.0, rot: 2 }, { asset: 'trash_can', x: 0.6, z: -1.6, rot: 0 }, { asset: 'rock', x: 5.4, z: 2.6, rot: 0.6 },
    ],
  },
  {
    id: 'campsite', kind: 'exterior', name: 'Campsite at night', note: 'Two tents, a fire, crates to sit on',
    w: 14, d: 12, h: 7, ground: 'dirt',
    openings: [], outlets: [],
    starter: [
      { asset: 'campfire', x: 0, z: 0, rot: 0 }, { asset: 'tent', x: -3.2, z: -3.0, rot: 0.3 }, { asset: 'tent', x: 3.4, z: -3.4, rot: -0.4 },
      { asset: 'crate', x: -1.4, z: 0.6, rot: 0.3 }, { asset: 'crate', x: 1.5, z: 0.4, rot: -0.2 }, { asset: 'tree', x: -5.6, z: -4.6, rot: 0 }, { asset: 'tree', x: 5.8, z: 3.6, rot: 1 }, { asset: 'rock', x: 0.2, z: -1.6, rot: 0.8 },
    ],
  },
  {
    id: 'rooftop', kind: 'exterior', name: 'Rooftop', note: 'A ledge, a bench, the city behind',
    w: 12, d: 9, h: 6, ground: 'asphalt',
    openings: [], outlets: [{ wall: 'E', at: 0 }],
    starter: [
      { asset: 'fence', x: -3, z: -4.2, rot: 0 }, { asset: 'fence', x: 0, z: -4.2, rot: 0 }, { asset: 'fence', x: 3, z: -4.2, rot: 0 },
      { asset: 'bench', x: 0, z: -2.4, rot: 0 }, { asset: 'oil_drum', x: -3.6, z: -1.8, rot: 0 }, { asset: 'pallets', x: 3.8, z: -1.6, rot: 0.3 }, { asset: 'crate', x: 4.2, z: 0.8, rot: 0.6 },
    ],
  },
  {
    id: 'desert', kind: 'exterior', name: 'Desert road', note: 'A car on the shoulder, rocks, nothing else',
    w: 18, d: 12, h: 8, ground: 'sand',
    openings: [], outlets: [],
    starter: [
      { asset: 'car', x: 0.6, z: -1.6, rot: 1.45 }, { asset: 'rock', x: -4.6, z: -2.8, rot: 0 }, { asset: 'rock', x: -6.0, z: 1.8, rot: 1.2 }, { asset: 'rock', x: 5.4, z: -3.6, rot: 2.1 },
      { asset: 'oil_drum', x: 3.4, z: 0.4, rot: 0 }, { asset: 'traffic_cone', x: -1.6, z: 0.8, rot: 0 },
    ],
  },
]

export const getTemplate = (id) => ROOM_TEMPLATES.find((t) => t.id === id) || ROOM_TEMPLATES[0]

export function wallFrame(room, wall) {
  // returns origin + tangent + inward normal for a wall, in XZ
  const { w, d } = room
  switch (wall) {
    case 'N': return { o: [0, -d / 2], t: [1, 0], n: [0, 1], len: w }
    case 'S': return { o: [0, d / 2], t: [-1, 0], n: [0, -1], len: w }
    case 'W': return { o: [-w / 2, 0], t: [0, -1], n: [1, 0], len: d }
    case 'E': return { o: [w / 2, 0], t: [0, 1], n: [-1, 0], len: d }
    default: return { o: [0, 0], t: [1, 0], n: [0, 1], len: w }
  }
}

export function openingCenter(room, op) {
  const f = wallFrame(room, op.wall)
  return [f.o[0] + f.t[0] * op.at, f.o[1] + f.t[1] * op.at]
}
