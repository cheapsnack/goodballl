import type { Kinematics } from "../../types";

/**
 * Steering-behavior primitives — the classic Reynolds/Buckland toolkit,
 * applied to soccer. Each function returns a 2D vector force; callers add
 * them together (weighted) and hand the sum to a `seek` or `stepMovement`
 * to produce a MovementInput. That's what makes AI look like it's making
 * decisions ("head to goal, but bend around this defender, and don't crowd
 * my teammate") rather than a single hardcoded rule.
 */
export const STEERING_TUNING = {
  /** how far a dribbler looks ahead for defenders to steer around — longer = earlier arc, less last-second swerve */
  avoidLookahead: 10,
  /** how strongly a nearby opponent pushes the dribble path sideways */
  avoidStrength: 3.5,
  /** ignore opponents further than this from the dribble path */
  avoidRadius: 3.5,
  /** target-seek weight in a dribbler's blended force */
  seekWeight: 1,
  /** avoidance weight — high on purpose so a defender in the path actually deflects the run */
  avoidWeight: 2,
  /** how close a teammate can be before separation kicks in */
  separationRadius: 3,
  /** separation weight — keeps AI teammates from clumping into the ball */
  separationWeight: 1.3,
  /**
   * A jockeying defender sits this far from the carrier on the goal-side —
   * close enough to threaten, far enough not to just charge in.
   */
  jockeyDistance: 2.5,
  /** how quickly a jockey shadows sideways motion (0..1) */
  jockeyLateralGain: 0.8,
} as const;

export type Vec2 = { x: number; z: number };

const zero = (): Vec2 => ({ x: 0, z: 0 });

/** Direction unit vector from `from` toward `to`, or zero if they coincide. */
function toward(from: { x: number; z: number }, to: { x: number; z: number }): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return zero();
  return { x: dx / len, z: dz / len };
}

/**
 * Steers `self` toward `target`, deflected sideways to skirt any obstacle
 * (opponent) within `avoidRadius` of the straight line between them. This
 * is what turns "AI runs straight at the defender" into "AI curves around
 * the defender toward goal" — the classic soccer-sim obstacle avoidance.
 * Pure.
 */
export function seekAvoiding(
  self: Kinematics,
  target: { x: number; z: number },
  obstacles: Kinematics[],
): Vec2 {
  const t = STEERING_TUNING;
  const seekDir = toward(self.position, target);

  // Look ahead along the seek direction; anything roughly on that line pushes us perpendicular.
  const avoid = zero();
  for (const o of obstacles) {
    const rx = o.position.x - self.position.x;
    const rz = o.position.z - self.position.z;
    // Project onto the seek direction — how far ahead is this obstacle?
    const along = rx * seekDir.x + rz * seekDir.z;
    if (along <= 0 || along > t.avoidLookahead) continue;
    // Perpendicular distance from the seek line.
    const perpX = rx - seekDir.x * along;
    const perpZ = rz - seekDir.z * along;
    const perpDist = Math.hypot(perpX, perpZ);
    if (perpDist > t.avoidRadius) continue;

    // Push perpendicular to the seek dir, away from the obstacle, stronger
    // when close both laterally and along the path.
    const closeness = 1 - perpDist / t.avoidRadius;
    const proximity = 1 - along / t.avoidLookahead;
    const magnitude = t.avoidStrength * closeness * proximity;
    // Sideways vector = perpendicular unit vector, opposite the obstacle offset.
    const sidewaysX = perpDist < 1e-4 ? -seekDir.z : -perpX / perpDist;
    const sidewaysZ = perpDist < 1e-4 ? seekDir.x : -perpZ / perpDist;
    avoid.x += sidewaysX * magnitude;
    avoid.z += sidewaysZ * magnitude;
  }

  return {
    x: seekDir.x * t.seekWeight + avoid.x * t.avoidWeight,
    z: seekDir.z * t.seekWeight + avoid.z * t.avoidWeight,
  };
}

/**
 * A push away from every nearby teammate, so a group of AI players don't
 * all bunch onto the ball. Falls off with distance. Pure.
 */
export function separation(self: Kinematics, teammates: Kinematics[]): Vec2 {
  const t = STEERING_TUNING;
  const force = zero();
  for (const m of teammates) {
    if (m === self) continue;
    const dx = self.position.x - m.position.x;
    const dz = self.position.z - m.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4 || dist > t.separationRadius) continue;
    const strength = (1 - dist / t.separationRadius) / Math.max(dist, 0.2);
    force.x += dx * strength;
    force.z += dz * strength;
  }
  return { x: force.x * t.separationWeight, z: force.z * t.separationWeight };
}

/**
 * A "contain" spot for a defender: sits between the ball carrier and the
 * goal being defended, at `jockeyDistance` metres from the carrier. This
 * is the FIFA/PES defender behaviour — hold shape and cover the goal-side
 * lane rather than charging the ball. The human still has to press the
 * tackle button (F) to actually try to win it; the defender is here just
 * to threaten and delay. Pure.
 */
export function jockeyTarget(
  carrier: Kinematics,
  ownGoalX: number,
): { x: number; z: number } {
  const t = STEERING_TUNING;
  // Unit vector from the carrier toward our goal — sitting on that vector
  // at jockeyDistance puts the defender on the goal-side of the carrier.
  const dx = ownGoalX - carrier.position.x;
  const dz = -carrier.position.z; // aim toward centre of the goal
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: carrier.position.x + (dx / len) * t.jockeyDistance,
    z: carrier.position.z + (dz / len) * t.jockeyDistance,
  };
}

/** Reduces a steering-force vector to a normalized MovementInput (magnitude <= 1). */
export function forceToInput(force: Vec2, sprint: boolean): { x: number; z: number; sprint: boolean } {
  const mag = Math.hypot(force.x, force.z);
  if (mag < 1e-4) return { x: 0, z: 0, sprint: false };
  const scale = Math.min(1, mag) / mag;
  return { x: force.x * scale, z: force.z * scale, sprint };
}
