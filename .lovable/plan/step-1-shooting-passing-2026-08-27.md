# Step 1 — Shooting & Passing

Scope for this increment: charge-up shooting and passing for the single controllable player, plus the power-bar UI. No AI, no teammates, no match state — those are steps 2 and 3.

## What you'll be able to do

- Hold **Space** to charge a shot. A power bar fills on screen. Release to fire the ball in the direction the player is facing.
- Hold **Space + Ctrl** (loft modifier) to lift the shot into the air instead of driving it along the ground.
- Hold **E** to charge a pass. Lighter, flatter, and more accurate than a shot, released the same way.
- Charging while running slows the player slightly, so you have to commit to the strike.
- You can only strike the ball when it's within control range of your feet; otherwise the charge fizzles.

## How it behaves

**Charge mechanic.** Power ramps from a floor value to full over a fixed charge time, then holds at max (no penalty for over-holding — it just caps). Releasing fires immediately. Releasing before the minimum threshold produces a soft tap rather than nothing, so light touches stay usable.

**Shooting.** Impulse along the player's heading, scaled by charge power. Without the loft modifier the ball stays low and skids. With loft held, a vertical component is added proportional to power, giving a lofted ball that arcs and bounces via the existing gravity/restitution in `stepBall`. The player's forward momentum adds a small amount to shot power so shooting on the run is stronger than shooting standing still.

**Passing.** Same charge flow, lower power ceiling, flatter trajectory, and a small amount of the player's current velocity carried into the ball. The teammate-homing assist is **not** wired up in this step because there are no teammates yet — the direction resolution is written as a seam that takes an optional target and falls back to pure heading, so step 2 plugs teammates in without touching the release logic.

**Cooldown.** A short post-strike lockout stops the dribble logic from instantly re-capturing the ball and prevents accidental double-strikes. During the lockout the ball ignores the dribble pull so it actually leaves the foot.

## Power bar

A slim vertical/horizontal bar anchored near the bottom-center of the screen, only visible while charging. Shot and pass use different accent colors so the bar reads which action is charging. It matches the broadcast-sports direction (semi-transparent dark track, clean fill, no chrome) so it's consistent with the HUD coming in step 3.

## Technical notes

**`src/game/logic/ballPhysics.ts`** — add `applyImpulse(ball, direction, power, loft)` as a pure function returning a new `BallState`. It only sets velocity; it does not integrate. `stepBall` is untouched. Add a `STRIKE_TUNING` object next to the existing `BALL_TUNING` holding: shot min/max power, pass min/max power, charge time, loft ratio, momentum transfer factor, strike cooldown, and strike reach. No inline constants.

**`src/game/logic/striking.ts`** (new) — pure charge-state helpers: `stepCharge(chargeState, actions, dt)` advancing charge, and `resolveStrike(player, ball, chargeState, target?)` returning the impulse direction and power. The optional `target` argument is the seam for step 2's pass assist. Also owns the "is the ball strikeable" reach check.

**`src/game/types.ts`** — add `ActionInput` (`shoot`, `pass`, `loft` booleans) and `ChargeState` (`active` action, `power`, `elapsed`).

**`src/hooks/useKeyboardInput.ts`** — extend the existing keymap with Space, E, and Ctrl. Keep the ref-based, no-re-render approach. Space needs `preventDefault` so it doesn't scroll the page.

**`src/game/store/useGameStore.ts`** — add `charge: ChargeState` and `strikeCooldown: number`. Written from the frame loop like `player`/`ball`. The power bar subscribes to `charge` specifically so it re-renders only while charging, not every frame of gameplay.

**`src/components/game/MatchScene.tsx`** — inside the existing `useFrame`, between the movement step and the ball step: advance charge, detect key release, call `resolveStrike` + `applyImpulse`, decrement cooldown, and skip `resolvePlayerBall`'s dribble pull while the cooldown is active.

**`src/components/game/PowerBar.tsx`** (new) — DOM overlay rendered in `GameCanvas` alongside `ControlsHint`, outside the `<Canvas>`.

**`ControlsHint`** — updated to list the new keys.

## Out of scope for this step

Teammate homing, AI, goalkeeper, goal detection, score, clock, HUD, sound. The pass-assist parameter is stubbed in so step 2 is additive.
