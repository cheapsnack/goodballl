# Arcade Goal Rush

# Football Game — pre-built logic layer + Lovable starter kit

## What's in here

Everything Claude can build without burning Lovable credits: **all the pure game logic**, fully
written, type-checked, and spot-tested — no rendering, no React, no Three.js dependency in the
logic itself. Lovable's job becomes "render this and wire up the UI," not "invent football physics
and AI from scratch." That's the credit-saving move.

```
src/game/
  types.ts              — shared types (Club, Player, BallState, MatchPhase, etc.)
  data/
    clubs.ts             — 8 fictional clubs × 16 players each, generated data (see NAMING.md)
  logic/
    movement.ts           — arcade player movement (accel/friction/turn rate) — TESTED
    ballPhysics.ts         — ball rolling/bounce/dribble physics
    passing.ts              — pass-target selection (facing cone) + pass velocity
    shooting.ts               — charge/release shot power + shot vector
    goalkeeper.ts               — GK positioning + save roll + rebounds (3 difficulty tiers)
    fouls.ts                     — foul detection + full penalty shootout state machine — TESTED
    camera.ts                     — broadcast cam + first-person run cam, smooth transitions
    matchClock.ts                  — kickoff → halftime → fulltime → extra time → shootout
    competition.ts                  — round-robin group fixtures/standings + knockout bracket — TESTED
  store/
    useGameStore.ts                  — Zustand store wiring all of the above together
scripts/
  gen-clubs.mjs                       — regenerate clubs.ts with different names/tiers if you want
NAMING.md                                — why names look the way they do, and how to extend them
```

Everything above type-checks cleanly (`npx tsc --noEmit`) and the trickiest logic (penalty shootout
sudden-death rules, round-robin fixture generation, knockout bracket seeding/advancement) has been
run through actual test cases, not just eyeballed. Movement/camera/goalkeeper math is correct by
construction but **will need real playtesting and constant-tuning once it's rendering** — that's
normal and expected, and the params are deliberately isolated (see e.g. `paramsFromAttributes` in
`movement.ts`) so tuning doesn't mean rewriting logic.

## What Lovable still needs to do

Lovable's job is the part that genuinely needs a live rendering loop to build/see: the R3F scene,
meshes, materials, camera wiring, UI screens, input handling, and gluing the store's state to
`useFrame`. That's real work, but it's *wiring*, not *invention* — which is exactly what should
save you credits.

---

## Step 1 — Set up the Lovable project

Start a new Lovable project and paste this as your **first prompt**:

> I'm building a 3D arcade football (soccer) game using React Three Fiber. I already have a
> complete, working game-logic layer written in plain TypeScript (movement physics, ball physics,
> passing, shooting, goalkeeper AI, fouls/penalties, camera system, match clock, and
> competition/bracket logic) that I'm going to paste in as files under `src/game/`. Your job in this
> first step is just to scaffold the project correctly, NOT to reimplement any of this logic:
>
> 1. Install and set up `@react-three/fiber`, `@react-three/drei`, and `zustand` as dependencies.
> 2. Create the folder structure `src/game/types.ts`, `src/game/data/`, `src/game/logic/`,
>    `src/game/store/` — I will paste my own files into these.
> 3. Create a basic `

` scene in the main app view with a green pitch plane (roughly 105x68
>    unit proportions), simple white line markings, a goal frame at each end, and basic ambient +
>    directional lighting. Camera should start at a fixed elevated angle looking at the pitch center
>    — I'll wire up dynamic camera logic myself next.
> 4. Do not add player movement, ball physics, or any game logic yet — I have that ready to paste in
>    and wire up in the next step. This step is scaffolding only.
>
> Once this is set up, I'll paste in my `src/game/` files and ask you to wire them into rendered
> meshes.

Then create each file under `src/game/` in the Lovable file explorer and paste in the exact contents
from this project (types.ts, data/clubs.ts, and every file under logic/ and store/).

## Step 2 — Wire logic to rendering (first playable slice)

Once the files are pasted in, use this prompt:

> I've added my game logic files under `src/game/`. Now wire up the first playable slice:
> 1. Render one controllable player as a capsule mesh, positioned at the pitch center, using the
>    `useGameStore` store plus `stepMovement` from `src/game/logic/movement.ts` inside a `useFrame`
>    loop. Read WASD/arrow key input (add a simple keyboard input hook if one doesn't exist), build a
>    normalized `MovementInput`, call `stepMovement` each frame with `paramsFromAttributes` using
>    pace=70, dribble=70 as placeholder values, and update the mesh position/rotation from the
>    returned state.
> 2. Render a ball as a small sphere, driven by `stepBall` from `src/game/logic/ballPhysics.ts`,
>    starting at the pitch center.
> 3. Do not add passing, shooting, AI teammates, or opponents yet — just get one controllable player
>    and the ball feeling right first. Do not modify the logic files themselves — if the movement
>    feels off, tell me what parameter you'd adjust in `paramsFromAttributes` rather than changing
>    the integration math.

Playtest this for real before moving on — this is the feel-critical slice from the build plan.

## Step 3 onward — follow the phased build plan

Use `football-game-build-plan.md` (already saved from our earlier conversation) sections 5 and 6.3
for the remaining phases (ball control/dribbling, pass & shoot buttons, AI teammates/opponents,
goalkeeper, fouls & penalties, match HUD/clock, camera toggle, club select, World Cup mode). For each
phase, the follow-up prompt template is:

> Continuing the football game project. [state what currently works]. Now wire up [phase goal] using
> `src/game/logic/[relevant file].ts`, which is already written — don't reimplement its logic, just
> call its exported functions from the render loop / UI and connect the results to `useGameStore`.

This keeps every Lovable prompt scoped to "connect existing logic to a rendered/interactive layer,"
which is both cheaper in credits and much less likely to produce broken math than asking Lovable to
invent physics or AI inline.

## Credit-saving habits worth keeping up

- If something feels mathematically wrong (movement, save rates, bracket seeding) once it's
  rendering, bring the specific symptom back to a Claude conversation (this one or a fresh one) and
  ask for a fix to the relevant `logic/*.ts` file — then paste the corrected file back into Lovable.
  Don't ask Lovable to debug math inline; it'll iterate expensively and may "fix" it by quietly
  rewriting logic in a worse way.
- When you want a bigger content batch (more clubs, a 16-nation World Cup roster, additional
  formations), ask Claude to extend `scripts/gen-clubs.mjs` or generate a new data file directly —
  that's pure data generation and doesn't need Lovable at all.
- Keep the Lovable project connected to GitHub so you can roll back a phase that goes sideways
  without spending credits re-deriving working code.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://goodballl.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fa7f5533-434d-49b6-9b70-346178108078).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
