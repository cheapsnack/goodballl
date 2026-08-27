import type { BallState, Kinematics } from "../types";

export const BALL_RADIUS = 0.36;

export const BALL_TUNING = {
  /** exponential ground-roll damping per second */
  rollFriction: 0.62,
  /** exponential air drag per second */
  airDrag: 0.16,
  gravity: -21,
  /** vertical energy kept on each bounce */
  restitution: 0.55,
  /** horizontal energy kept on each bounce */
  bounceGrip: 0.82,
  /** how hard the player's body shoves the ball on contact */
  pushStrength: 16,
  /** distance at which the ball is considered "at the player's feet" */
  controlRadius: 1.45,
  /** where the dribbled ball sits ahead of the player */
  dribbleDistance: 1.0,
  /** how strongly the dribble pulls the ball to that spot */
  dribbleGrip: 7.5,
  maxSpeed: 42,
} as const;

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

  // Simple boundary: bounce off the run-off edge so the ball never escapes.
  const bx = opts.halfLength + 6;
  const bz = opts.halfWidth + 6;
  if (Math.abs(x) > bx) {
    x = Math.sign(x) * bx;
    vx = -vx * 0.55;
  }
  if (Math.abs(z) > bz) {
    z = Math.sign(z) * bz;
    vz = -vz * 0.55;
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
 * Push-based player/ball interaction (no rigid bodies).
 *  - Inside the control radius while moving, the ball is nudged toward a point
 *    just ahead of the player: that reads as close-control dribbling.
 *  - Body contact always shoves the ball out so it can never sit inside the player.
 */
export function resolvePlayerBall(
  ball: BallState,
  player: Kinematics,
  playerRadius: number,
  dt: number,
): BallState {
  const dx = ball.position.x - player.position.x;
  const dz = ball.position.z - player.position.z;
  const dist = Math.hypot(dx, dz) || 1e-4;

  let vx = ball.velocity.x;
  let vz = ball.velocity.z;
  let x = ball.position.x;
  let z = ball.position.z;

  const playerSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const airborne = ball.position.y > BALL_RADIUS * 2.5;

  // Dribble pull.
  if (!airborne && dist < BALL_TUNING.controlRadius && playerSpeed > 0.4) {
    const tx = player.position.x + Math.sin(player.heading) * BALL_TUNING.dribbleDistance;
    const tz = player.position.z - Math.cos(player.heading) * BALL_TUNING.dribbleDistance;
    const grip = BALL_TUNING.dribbleGrip * dt;
    vx += (tx - x) * grip * 6;
    vz += (tz - z) * grip * 6;
  }

  // Hard body separation + push.
  const minDist = playerRadius + BALL_RADIUS;
  if (!airborne && dist < minDist) {
    const nx = dx / dist;
    const nz = dz / dist;
    x = player.position.x + nx * minDist;
    z = player.position.z + nz * minDist;

    const approach = player.velocity.x * nx + player.velocity.z * nz;
    const push = Math.max(approach, 0) + BALL_TUNING.pushStrength * dt;
    vx += nx * push;
    vz += nz * push;
  }

  if (vx === ball.velocity.x && vz === ball.velocity.z && x === ball.position.x) return ball;

  return {
    ...ball,
    position: { x, y: ball.position.y, z },
    velocity: { x: vx, y: ball.velocity.y, z: vz },
  };
}
