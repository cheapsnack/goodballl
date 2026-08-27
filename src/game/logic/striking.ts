import type { ActionInput, BallState, ChargeState, Kinematics, StrikeAction } from "../types";
import { BALL_RADIUS, STRIKE_TUNING } from "./ballPhysics";

/** Stable identity so subscribers don't re-render while nothing is charging. */
export const IDLE_CHARGE: ChargeState = { action: null, power: 0, elapsed: 0, loft: false };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Which action the keys are asking for this frame. Shoot wins ties. */
function desiredAction(actions: ActionInput): StrikeAction | null {
  if (actions.shoot) return "shoot";
  if (actions.pass) return "pass";
  return null;
}

/**
 * Advances the charge by dt seconds. Pure.
 *  - Power ramps from minPower to 1 over chargeTime, then caps (no over-charge penalty).
 *  - Switching action mid-charge restarts the ramp.
 *  - Returns the shared IDLE_CHARGE reference when idle, so store subscribers stay quiet.
 */
export function stepCharge(charge: ChargeState, actions: ActionInput, dt: number): ChargeState {
  const want = desiredAction(actions);
  if (!want) return IDLE_CHARGE;

  const restarted = charge.action !== want;
  const elapsed = restarted ? dt : charge.elapsed + dt;
  const t = clamp01(elapsed / STRIKE_TUNING.chargeTime);
  const power = STRIKE_TUNING.minPower + (1 - STRIKE_TUNING.minPower) * t;

  return {
    action: want,
    power: clamp01(power),
    elapsed,
    // Latch the modifier: holding it at any point during the charge lofts the strike.
    loft: actions.loft || (!restarted && charge.loft),
  };
}

/** True when the ball is close enough (and low enough) for the player to strike it. */
export function canStrike(player: Kinematics, ball: BallState): boolean {
  const dist = Math.hypot(ball.position.x - player.position.x, ball.position.z - player.position.z);
  return dist <= STRIKE_TUNING.reach && ball.position.y <= STRIKE_TUNING.maxStrikeHeight;
}

export type StrikeResult = {
  direction: { x: number; z: number };
  /** horizontal speed in m/s */
  speed: number;
  /** vertical launch speed in m/s */
  lift: number;
};

/**
 * Turns a released charge into an impulse.
 *
 * `target` is the assist seam for step 2 (nearest teammate). While it is
 * undefined the direction is purely the player's heading, so behaviour today
 * is unchanged and teammates plug in later without touching this call site.
 */
export function resolveStrike(
  player: Kinematics,
  charge: ChargeState,
  target?: { x: number; z: number },
): StrikeResult {
  const cfg = charge.action === "pass" ? STRIKE_TUNING.pass : STRIKE_TUNING.shot;

  // Facing direction on the ground plane.
  let dx = Math.sin(player.heading);
  let dz = -Math.cos(player.heading);

  // Pass assist: blend toward the target when one is supplied and roughly ahead.
  if (target && charge.action === "pass") {
    const tx = target.x - player.position.x;
    const tz = target.z - player.position.z;
    const len = Math.hypot(tx, tz);
    if (len > 1e-3) {
      const nx = tx / len;
      const nz = tz / len;
      if (dx * nx + dz * nz >= STRIKE_TUNING.assistMinAlignment) {
        const w = STRIKE_TUNING.assistWeight;
        dx += (nx - dx) * w;
        dz += (nz - dz) * w;
      }
    }
  }

  const dirLen = Math.hypot(dx, dz) || 1;
  dx /= dirLen;
  dz /= dirLen;

  // Momentum: running into the strike adds power, running away takes some off.
  const forward = player.velocity.x * dx + player.velocity.z * dz;
  const base = cfg.minSpeed + (cfg.maxSpeed - cfg.minSpeed) * charge.power;
  const speed = Math.max(
    cfg.minSpeed * 0.5,
    base + forward * STRIKE_TUNING.momentumTransfer,
  );

  const loftRatio = charge.loft ? cfg.loftRatio : cfg.baseLoftRatio;

  return { direction: { x: dx, z: dz }, speed, lift: speed * loftRatio };
}

