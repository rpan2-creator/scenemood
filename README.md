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
| Locations: rooms plus exteriors (street, forest, battlefield) with sun, sky and ground | Real |
| People: realistic fictional stand-ins (Microsoft Rocketbox), posed per look and per Breakdown blocking. No real actor's face or photo is ever used | Real |
| Storyboard: one frame per camera setup in shooting order, with changeover notes, exportable as PDF | Real (deterministic code) |
| Feasibility checks: gear, stands in frame, exposure per face, 180° line, collisions, power | Real (deterministic code) |
| False color exposure map | Real (from the render) |
| Direction generation (plan, design, validate, review) | Simulated in `src/ai/sim.js` |
| Natural-language edits | Simulated (keyword parser) |
| Reference frames | Simulated (graded lens render) |
| Framing of AI cameras (headroom, lens choice, avoiding blocked lines) | Real (deterministic code) |
| Review links (`#/share/...`) | Real: the plan is compressed into the URL, no server needed |
| Comments, votes, team, rental quotes, billing | Simulated, stored in this browser |
| AI co-pilot: room from a description, script breakdown, setup review, studio suggestions, alternatives, note digest, shooting order | Simulated in `src/ai/copilot.js` (same JSON contract a model call would use) |

## Performance

- The 3D set view is a plain forward render with a neutral work light. The lens view renders fast while you edit and redraws once at full quality (AO, bloom, grade) when things stop moving.
- Shadow maps update only when something in the set moves, not when the view orbits. Practical lamps don't cast shadows.
- The landing page and asset thumbnails are pre-rendered images, so no WebGL runs there.

Every simulated function takes and returns the same JSON a real model call would, so connecting an API means replacing the function bodies in `src/ai/sim.js` and calling them from a server route that holds the key. Never put an API key in the browser.

## Layout

```
src/
  ai/sim.js            simulated model calls (swap for real ones)
  actions.js           workflow actions (generate, edit, frames, share, export)
  engine/SceneEngine.js  Three.js viewport, lights, cameras, post-processing, stills
  engine/humans.js     rigged avatars, poses, skin tone
  engine/checks.js     feasibility checks and fixes
  data/                rooms, gear, asset library (glTF + procedural)
  pages/               Landing, Marketing, Projects, Setup, Directions, Studio,
                       Review, ShotPlan, Share, Workspace (library, insights, settings)
  store.js             projects, scenes, undo/redo, versions, local save

public/models          glTF furniture (Khronos samples, CC BY 4.0) and avatars (see site footer)
public/stills          pre-rendered example frames for the marketing pages
```

## Workflow

1. **Breakdown**: what happens, then Location (interior or exterior, place, time of day, measured size, doors and windows), Cast and blocking (names, standing or sitting, skin tone for exposure), Props and set dressing (placed on the plan), Lights you own, and Look and schedule.
2. **Looks**: four ways to shoot that breakdown, each lit only with the crew's own lights.
3. **Block + light**: walk the set and look through each lens. Each camera is one storyboard frame.
4. **Storyboard**: every setup in shooting order (one direction at a time, widest first) with its lighting and what changes between setups. Add coverage (wide master, over the shoulder, single, close-up) without breaking the 180° line. Export as PDF.
5. **Share + approve**: send a link; reviewers' notes come back through a reply link. Approving locks a version; editing afterwards returns the scene to a draft.

A project with several scenes also gets a **Shooting day**: scenes grouped by location, day before night, with the company moves, time-of-day changes, cast in and out, and extra lights between them.

Run regression checks with `node --test tests/workflow.test.js`, then `npm run build`.
