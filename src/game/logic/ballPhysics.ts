import type { BallState, Kinematics } from "../types";

export const BALL_RADIUS = 0.36;

export const BALL_TUNING = {
  /** exponential ground-roll damping per second */
  rollFriction: 1.15,
  /** exponential air drag per second */
  airDrag: 0.16,
  gravity: -21,
  /** vertical energy kept on each bounce */
  restitution: 0.55,
  /** horizontal energy kept on each bounce */
  bounceGrip: 0.78,
  maxSpeed: 24,
} as const;

/**
 * Striking feel. All shooting/passing numbers live here — nothing downstream
 * should hardcode a speed, a charge time, or a loft ratio.
 */
export const STRIKE_TUNING = {
  /** seconds of holding to reach full power */
  chargeTime: 0.85,
  /** power floor on an instant tap (0..1) */
  minPower: 0.24,
  /** how much of the player's closing speed is added to the strike */
  momentumTransfer: 0.4,
  /** seconds after a strike where the dribble pull is disabled */
  cooldown: 0.3,
  /** how close the ball must be to be strikeable */
  reach: 2.1,
  /** ball can't be struck above this height */
  maxStrikeHeight: 1.6,
  /** movement input is scaled by this while charging */
  chargeMoveScale: 0.74,
  /** pass assist blend toward a target (0 = none, 1 = fully homing) */
  assistWeight: 0.55,
  /** target must be at least this aligned with facing to attract the pass */
  assistMinAlignment: 0.35,
  /**
   * Shot assist: much lighter than pass assist — nudges a shot toward goal
   * when you're already roughly facing it, so near-miss aim doesn't feel
   * unresponsive, but it never aims for you outside that cone.
   */
  shotAssistWeight: 0.22,
  shotAssistMinAlignment: 0.55,

  shot: {
    minSpeed: 10,
    maxSpeed: 22,
    /** vertical:horizontal ratio with the loft modifier held */
    loftRatio: 0.5,
    /** vertical:horizontal ratio for a driven shot */
    baseLoftRatio: 0.05,
  },
  pass: {
    minSpeed: 13,
    maxSpeed: 22,
    loftRatio: 0.28,
    baseLoftRatio: 0,
  },
} as const;

/**
 * Applies an instantaneous kick to the ball. Pure — sets velocity only and
 * never integrates, so it composes with stepBall instead of fighting it.
 */
export function applyImpulse(
  ball: BallState,
  direction: { x: number; z: number },
  speed: number,
  lift = 0,
): BallState {
  const len = Math.hypot(direction.x, direction.z) || 1;
  const nx = direction.x / len;
  const nz = direction.z / len;

  const capped = Math.min(speed, BALL_TUNING.maxSpeed);

  return {
    ...ball,
    // Nudge off the deck so the very next stepBall doesn't treat a lofted
    // ball as grounded and cancel its vertical velocity.
    position: {
      ...ball.position,
      y: lift > 0 ? Math.max(ball.position.y, BALL_RADIUS + 0.02) : ball.position.y,
    },
    velocity: { x: nx * capped, y: lift, z: nz * capped },
    heading: Math.atan2(nx, nz),
  };
}

export type BallStepOptions = {
  halfLength: number;
  halfWidth: number;
};

/** Advances the ball by dt seconds. Pure. */
export function stepBall(ball: BallState, dt: number, opts: BallStepOptions): BallState {
  let { x, y, z } = ball.position;
  let vx = ball.velocity.x;
  let vy = ball.velocity.y;
  let vz = ball.velocity.z;

  const grounded = y <= BALL_RADIUS + 1e-3 && Math.abs(vy) < 0.35;

  // Gravity + integrate height.
  if (!grounded) {
    vy += BALL_TUNING.gravity * dt;
    y += vy * dt;
  } else {
    y = BALL_RADIUS;
    vy = 0;
  }

  // Bounce.
  if (y < BALL_RADIUS) {
    y = BALL_RADIUS;
    if (vy < 0) {
      vy = -vy * BALL_TUNING.restitution;
      vx *= BALL_TUNING.bounceGrip;
      vz *= BALL_TUNING.bounceGrip;
      if (vy < 0.6) vy = 0;
    }
  }

  // Horizontal damping: rolling is draggier than flying.
  const k = grounded ? BALL_TUNING.rollFriction : BALL_TUNING.airDrag;
  const damp = Math.exp(-k * dt);
  vx *= damp;
  vz *= damp;

  x += vx * dt;
  z += vz * dt;

  // The ball is allowed to leave the true pitch bounds — that's what makes a
  // throw-in/corner/goal-kick (see restarts.ts) rather than an invisible
  // wall. This is only a hard safety net far past the run-off so a wild
  // deflection can't send it to infinity before the restart logic catches it.
  const safetyX = opts.halfLength + 18;
  const safetyZ = opts.halfWidth + 18;
  if (Math.abs(x) > safetyX) {
    x = Math.sign(x) * safetyX;
    vx = 0;
  }
  if (Math.abs(z) > safetyZ) {
    z = Math.sign(z) * safetyZ;
    vz = 0;
  }

  const speed = Math.hypot(vx, vz);
  if (speed > BALL_TUNING.maxSpeed) {
    vx = (vx / speed) * BALL_TUNING.maxSpeed;
    vz = (vz / speed) * BALL_TUNING.maxSpeed;
  }
  if (speed < 0.05 && grounded) {
    vx = 0;
    vz = 0;
  }

  return {
    position: { x, y, z },
    velocity: { x: vx, y: vy, z: vz },
    heading: speed > 0.01 ? Math.atan2(vx, vz) : ball.heading,
    spin: ball.spin + (speed / BALL_RADIUS) * dt,
  };
}

/**
 * A simple hard-body deflection for anything touching a *loose* ball
 * without possessing it — a shoulder brushing it, a shot cannoning off a
 * defender. It only ever separates and lightly redirects; it never pulls
 * the ball toward anyone. Actually *controlling* the ball is entirely the
 * job of the possession system (see possession.ts) now, which is what
 * fixed the ball feeling like it was fighting the player for control.
 */
export function deflectOffPlayer(
  ball: BallState,
  player: Kinematics,
  playerRadius: number,
): BallState {
  const dx = ball.position.x - player.position.x;
  const dz = ball.position.z - player.position.z;
  const dist = Math.hypot(dx, dz) || 1e-4;
  const minDist = playerRadius + BALL_RADIUS;
  if (ball.position.y > BALL_RADIUS * 2.5 || dist >= minDist) return ball;

  const nx = dx / dist;
  const nz = dz / dist;
  const approach = player.velocity.x * nx + player.velocity.z * nz;
  const kick = Math.max(approach, 0) * 0.3 + 1.5;

  return {
    ...ball,
    position: {
      x: player.position.x + nx * minDist,
      y: ball.position.y,
      z: player.position.z + nz * minDist,
    },
    velocity: { x: ball.velocity.x + nx * kick, y: ball.velocity.y, z: ball.velocity.z + nz * kick },
  };
}
