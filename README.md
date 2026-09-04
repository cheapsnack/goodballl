# Goodball - Arcade Football

A 3D arcade football (soccer) game: 11 v 11 matches, penalty shootouts, free-kick
practice and online 1 v 1, built with React Three Fiber on TanStack Start.

Live: https://goodball.imranmn.life

## Features

- Full match mode with two halves, a 15x match clock, extra time and penalties
- Formation-aware AI (goalkeepers, pressing, zonal shape, mentality, bookings)
- Charge-based shooting and passing, slide tackles, restarts (throw-ins,
  corners, goal kicks, free kicks)
- Standalone Penalty Shootout and Free Kick modes with difficulty levels
- Local 1 v 1 (two key schemes on one keyboard) and online rooms over Supabase
  Realtime
- Touch controls on mobile, keyboard on desktop

## Tech stack

- TanStack Start (React 19, file-based routing) + Vite
- React Three Fiber / drei / three.js for rendering
- Zustand for game state
- Tailwind CSS v4 for UI overlays
- Supabase (Lovable Cloud) for multiplayer rooms
- Vitest for the pure game-logic tests

## Getting started

```sh
bun install   # or npm i
bun run dev   # http://localhost:8080
```

Environment variables live in `.env` (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`). Multiplayer is the
only feature that needs them.

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Dev server |
| `bun run build` | Production build |
| `bun run test` | Vitest game-logic suite |
| `bun run lint` | ESLint |
| `bun run format` | Prettier |

## Project structure

```text
src/
  components/game/   R3F scenes and HUD overlays (match, set pieces, menus)
  game/
    data/clubs.ts    8 clubs, 16 players each
    logic/           Pure, unit-tested gameplay: physics, AI, match rules
    store/           Zustand store shared by scene + UI
  hooks/             Keyboard and touch input
  multiplayer/       Supabase room client, channel and snapshot encoding
  routes/            TanStack Start routes (single game route)
```

Everything under `src/game/logic` is framework-free and covered by tests; the
components only render state produced there.

## Controls

Move `WASD` / arrows · Sprint `Shift` · Shoot `Space` · Pass `E` ·
Loft `Ctrl` · Slide `F` · Switch player `Q` · Camera `C`.
In-game Options (top-left) pauses the match and lists the full scheme.
