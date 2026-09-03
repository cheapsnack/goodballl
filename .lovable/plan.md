# Shooting, AI shape, match clock, extra time and penalties

## Bug fixes

1. **Shots stay on the floor.** Driven shots currently launch with almost no lift, so everything skids along the grass. Raise the driven shot lift so a normal shot rises 5-10 m/s and can find the top of the net, while the lofted (modifier) shot stays higher still.
2. **Pass auto-switch picks the wrong player.** Right now control jumps to whoever is nearest the ball straight after the kick - usually the passer himself. Control will switch to the intended receiver (the teammate the pass was aimed at), and only fall back to nearest-to-ball when the pass had no target.
3. **Players crowd the ball.** Only one outfielder per side will press at a time, and the whole team's horizontal drift toward the ball is reduced further, so the back line and far-side midfield hold their shape instead of collapsing into a blob.
4. **Throw-in transition.** The restart pause is too short for the ball and taker to settle before play goes live; lengthen it slightly so the throw visibly restarts from the correct spot.

## New features

5. **Realistic match clock.** Each half is 3 real minutes, displayed as 45 minutes (15x scale). The HUD shows 0:00-45:00 in the first half and 45:00-90:00 in the second.
6. **Extra time.** If the score is level at full time, two extra periods of 1 real minute each, displayed as 15 minutes apiece (90-105, 105-120). Half-time style break between them, then a final whistle.
7. **Penalty shootout.** If still level after extra time, the match goes to penalties. Also selectable as a standalone mode from the main menu.
   - Aim + power arcade flow: move an aim reticle inside the goal, hold Space for power, release to strike; the keeper dives on a guess weighted by the chosen difficulty.
   - Best of 5 per side, then sudden death. Scoreboard of takes for both sides, winner banner at the end.

## Technical notes

- `STRIKE_TUNING.shot.baseLoftRatio` 0.05 -> 0.4 in `ballPhysics.ts`.
- `MatchScene.tsx`: after a home/away pass release, resolve the receiver index from the same `nearestTeammateInCone` result used for assist and set `controlledIndex` to it.
- `OUTFIELD_TUNING`: `presserCount` 2 -> 1, `zonalTrackX` 0.18 -> ~0.10; keep the defender press handicap.
- `MATCH_TUNING`: `periodSeconds` 180, add `clockScale: 15`, `extraPeriodSeconds: 60`, `extraPeriods: 2`, `restartPause` ~0.9. `displayClock` rescales real seconds to displayed minutes and accounts for extra-time periods; `MatchHud` labels 1st/2nd half, ET1/ET2, penalties.
- `MatchStatus` gains `extratime` and `penalties`; store gains shootout state (kick index, per-side results, current taker). Full-time handling in `MatchScene` branches: level score -> extra time -> penalties.
- New `src/game/logic/penalties.ts` with pure, tested functions (keeper dive choice, save/goal resolution, shootout progression and winner detection) plus a `PenaltyShootout` overlay component driving aim/power input. Menu gains a "Penalty Shootout" mode entry.
- Vitest coverage added for the clock rescale, extra-time progression and shootout resolution.
