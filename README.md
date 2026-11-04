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
| People: faceless grey previs actors on real body scans (Microsoft Rocketbox), posed per direction and per Set up blocking | Real |
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

1. **Set up** the room (dimensions, windows, doors, outlets, furniture), your gear kit and the scene brief.
2. **Directions**: four distinct options, each with dressing, blocking/camera and lighting plus the reasons.
3. **Studio**: 3D set and lens view side by side. Edit by hand or in plain language; checks update live.
4. **Review**: send a link to the DP, gaffer or client; they comment and vote without an account.
5. **Shot plan**: lock it, then export the shot list, gear list, call sheet or a PDF.

## Fonts

Newsreader, Instrument Sans and JetBrains Mono (SIL Open Font License) are self-hosted in `public/fonts`, subset to Latin.

Actors are Microsoft Rocketbox avatars (Male_Adult_07, Female_Adult_14, Male_Adult_02; MIT licence, https://github.com/microsoft/Microsoft-Rocketbox), converted to glTF with 1024 px textures. In the app the scanned heads are replaced by a smooth, featureless head and clothing is rendered in neutral grey, so no real likeness appears.

## Workflow

1. **Set up** is a scene breakdown: what happens, then Location (interior or exterior, place, time of day, measured size, doors and windows), Cast and blocking (names, standing or sitting, skin tone for exposure), Props and set dressing (placed on the plan), Lights you own, and Look and schedule.
2. **Directions** proposes four ways to shoot it within that breakdown. Technical detail stays folded.
3. **Studio** opens on the lens view. Each camera is one storyboard frame. Advanced tools expose layers and specialist controls.
4. **Review** creates a link. Reviewers leave notes per camera and press Send; their reply link adds the notes back to the director's review. A JSON file export is kept as a fallback.
5. **Storyboard** shows every setup in shooting order (one direction at a time, widest first), with the lighting for each frame and what changes between setups: camera moves, lens changes, turnarounds and lights that enter the frame. Export it as a PDF, or export the full plan, shot list and gear list.

Approving saves a version; editing after approval returns the scene to a draft, and earlier approvals can be restored. AI previews must be accepted or discarded before leaving the studio.

Run regression checks with `node --test tests/workflow.test.js`, then `npm run build`.
