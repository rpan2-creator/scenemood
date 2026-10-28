# SceneMood

AI scene design for small film crews. Describe the room, the gear you own and the mood; SceneMood proposes set dressing, blocking and camera, and lighting you can actually build, then lets you check every shot through the lens.

Group 3 · AI Products P3 prototype.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Deploy

```bash
npx vercel --prod
```

## What is real and what is simulated

| Part | Status |
| --- | --- |
| 3D set, lights in candela, camera lens view (Three.js) | Real |
| Feasibility checks: gear, stands in frame, exposure per face, 180° line, collisions, power | Real (deterministic code) |
| False color exposure map | Real (from the render) |
| Direction generation (plan, design, validate, review) | Simulated in `src/ai/sim.js` |
| Natural-language edits | Simulated (keyword parser) |
| Reference frames | Simulated (graded lens render) |

Every simulated function takes and returns the same JSON a real model call would, so connecting an API means replacing the function bodies in `src/ai/sim.js` and calling them from a server route that holds the key. Never put an API key in the browser.

## Layout

```
src/
  ai/sim.js            simulated model calls (swap for real ones)
  engine/SceneEngine.js  Three.js viewport, lights, cameras, snapshots
  engine/checks.js     feasibility checks and fixes
  data/                rooms, gear, procedural asset library
  pages/               Landing, Setup, Directions, Studio, ShotPlan
  store.js             scene state, undo/redo, local save
```
