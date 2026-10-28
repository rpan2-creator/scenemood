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
| People: realistic rigged actors (Microsoft Rocketbox), posed per direction | Real |
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

Actors are Microsoft Rocketbox avatars (Male_Adult_07, Female_Adult_14, Male_Adult_02; MIT licence, https://github.com/microsoft/Microsoft-Rocketbox), converted to glTF with 1024 px textures.
