import type { BallState, Kinematics, MovementInput } from "../../types";
import { FIELD } from "../field";

/** Outfield AI feel. */
export const DEFENDER_TUNING = {
  /** how far ahead of the ball's motion the defender aims when chasing */
  interceptLead: 0.35,
  /** stop closing once inside this radius so they don't jitter on the ball */
  pressDeadZone: 0.45,
  /** sprint when the ball is further away than this */
  sprintRange: 6,
  /** zonal anchor: how strongly the holding defender shifts with the ball's z */
  zonalTrackZ: 0.55,
  /** ...and how far up the pitch they push with the ball's x */
  zonalTrackX: 0.45,
  /** goal-side bias: sit this far behind the ball, toward their own goal */
  goalSideDepth: 7,
  /** dead zone before a zonal defender bothers repositioning */
  zonalDeadZone: 1.4,
  /** never drop deeper than this from their own goal line */
  maxDepth: FIELD.halfLength - 3,
} as const;

export type DefenderRole = {
  id: string;
  /** which goal this defender protects (1 = +x goal, -1 = -x goal) */
  side: 1 | -1;
  /** resting z lane, in metres */
  laneZ: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Squared planar distance — used for "who's nearest" without a sqrt. */
export function distanceToBall(body: Kinematics, ball: BallState): number {
  return Math.hypot(ball.position.x - body.position.x, ball.position.z - body.position.z);
}

/**
 * Picks the index of the defender that should press the ball. Everyone else
 * holds their zone. Pure.
 */
export function nearestDefenderIndex(defenders: Kinematics[], ball: BallState): number {
  let best = -1;
  let bestDist = Infinity;
  defenders.forEach((d, i) => {
    const dist = distanceToBall(d, ball);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

/** The spot a zonal defender wants to occupy given where the ball is. */
export function zonalAnchor(role: DefenderRole, ball: BallState): { x: number; z: number } {
  const t = DEFENDER_TUNING;
  // Stay goal-side of the ball: between it and the goal they defend.
  const x = clamp(
    ball.position.x * t.zonalTrackX + role.side * t.goalSideDepth,
    -t.maxDepth,
    t.maxDepth,
  );
  const z = clamp(
    role.laneZ + ball.position.z * t.zonalTrackZ,
    -FIELD.halfWidth + 2,
    FIELD.halfWidth - 2,
  );
  return { x, z };
}

/** Steering toward an arbitrary point, shaped like human input. */
export function seek(
  self: Kinematics,
  target: { x: number; z: number },
  opts: { deadZone: number; sprintRange: number },
): MovementInput {
  const dx = target.x - self.position.x;
  const dz = target.z - self.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < opts.deadZone) return { x: 0, z: 0, sprint: false };

  // Ease in over the last couple of metres so they arrive instead of overshooting.
  const gain = clamp(dist / 2, 0.4, 1);
  return {
    x: (dx / dist) * gain,
    z: (dz / dist) * gain,
    sprint: dist > opts.sprintRange,
  };
}

/**
 * One outfield defender's decision for this frame.
 *  - the nearest defender presses the ball (aiming slightly ahead of it)
 *  - everyone else holds a loose zone relative to the ball
 *
 * Pure: returns a MovementInput that goes straight into stepMovement, so AI
 * players obey exactly the same physics as the human.
 */
export function stepDefender(
  self: Kinematics,
  role: DefenderRole,
  ball: BallState,
  isChaser: boolean,
): MovementInput {
  const t = DEFENDER_TUNING;

  if (isChaser) {
    const target = {
      x: ball.position.x + ball.velocity.x * t.interceptLead,
      z: ball.position.z + ball.velocity.z * t.interceptLead,
    };
    return seek(self, target, { deadZone: t.pressDeadZone, sprintRange: t.sprintRange });
  }

  return seek(self, zonalAnchor(role, ball), {
    deadZone: t.zonalDeadZone,
    sprintRange: t.sprintRange * 2,
  });
}
