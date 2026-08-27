# Step 1 — Football game scaffolding

Set up the 3D scene and empty folder structure so your pre-written `src/game/` logic files can be pasted in next, with zero game logic invented here.

## Dependencies

Install `three`, `@react-three/fiber` (v9), `@react-three/drei` (v10), `zustand`, and `@types/three` (dev). React 19 is already in the project, so the v9/v10 majors are the right pair.

## Folder structure

Create placeholder-free directories ready for your paste:

```text
src/game/
  types.ts          (stub export, replaced by your file)
  data/             (.gitkeep)
  logic/            (.gitkeep)
  store/            (.gitkeep)
```

Nothing in these will contain invented physics, AI, or data — they exist only so your files drop in cleanly.

## Pitch scene

Replace the placeholder home page (`src/routes/index.tsx`) with a client-only route rendering a full-viewport canvas:

- Pitch plane 105 x 68 units, mown-stripe green (procedural canvas texture rather than a flat single colour, so it doesn't read as a placeholder).
- White line markings: touchlines, halfway line, centre circle + spot, both penalty boxes, six-yard boxes, penalty spots, and corner arcs — drawn into the same pitch texture for crispness, so no extra draw calls.
- A goal frame at each end (posts + crossbar + simple net plane), built from thin cylinders/boxes at regulation-ish proportions (7.32 x 2.44).
- Lighting: ambient + a shadowed directional key light, plus a small local `<Environment>` with Lightformers (no CDN presets) so materials have something to reflect.
- Sky-coloured background and light distance fog.
- Fixed elevated broadcast-angle camera looking at the centre spot. No OrbitControls in the app path — the camera is left static and unwired so your `camera.ts` can take it over in a later step.

## Look

Clean daylight stadium-broadcast style: sky blue backdrop, striped turf, crisp white lines. No neon/synthwave.

## Explicitly not built in this step

Player meshes, ball, movement, input handling, HUD, or store wiring. Those come in Step 2 after you paste the logic files.

## Technical notes

- Route uses `ssr: false` since `<Canvas>` must not render on the server.
- Scene split into `src/components/game/GameCanvas.tsx`, `Pitch.tsx`, `Goal.tsx`, `pitchTexture.ts` so Step 2 only touches new files.
- Page head metadata (title, description, og/twitter) set on the index route.
- Verified with a headless screenshot before handing back, so you see the actual pitch, not a build-passes claim.
