import type { BallState, Kinematics } from "../types";
import { BALL_RADIUS } from "./ballPhysics";
import { FIELD, cornerSpot, goalKickSpot, throwInSpot } from "./field";
import { scorerForGoalLine, type TeamSide } from "./match";

export type RestartType = "throwin" | "corner" | "goalkick" | "freekick" | "penalty";

/** True when (x, z) is inside the penalty area defended by `defendSide`. */
export function isInPenaltyArea(
  pos: { x: number; z: number },
  defendSide: 1 | -1,
): boolean {
  const inDepth = pos.x * defendSide >= FIELD.halfLength - FIELD.penaltyDepth;
  return inDepth && Math.abs(pos.z) <= FIELD.penaltyHalfWidth / 2 + FIELD.goalHalfWidth;
}

/** The penalty spot in front of the goal defended by `defendSide`. */
export function penaltySpot(defendSide: 1 | -1): { x: number; z: number } {
  return { x: defendSide * (FIELD.halfLength - 11), z: 0 };
}

export type Restart = {
  type: RestartType;
  /** the team taking the restart */
  team: TeamSide;
  position: { x: number; z: number };
};

/**
 * Detects the ball leaving the pitch across one frame (not through a goal —
 * call this only after detectGoal() has returned null for the same frame).
 * `lastTouch` is whichever team's player most recently made contact with the
 * ball, used to award the restart to the correct side. Pure.
 */
export function detectOutOfBounds(
  prev: BallState,
  next: BallState,
  lastTouch: TeamSide,
): Restart | null {
  const { halfLength, halfWidth } = FIELD;
  // Matches detectGoal()'s threshold exactly (whole ball fully past the
  // line) so the two checks agree on which frame the ball actually left —
  // detectGoal must run first each frame; this only fires when it said no.
  const lineWithBall = halfLength + BALL_RADIUS;

  // Goal line (either end) — missed/over the frame, not a goal.
  for (const side of [1, -1] as const) {
    const before = prev.position.x * side;
    const after = next.position.x * side;
    if (before < lineWithBall && after >= lineWithBall) {
      const attacker = scorerForGoalLine(side);
      const defender: TeamSide = attacker === "home" ? "away" : "home";
      const zSign: 1 | -1 = next.position.z >= 0 ? 1 : -1;

      // Off the defender (or last touched by nobody meaningful) → corner.
      // Off the attacker (shot/cross that drifted wide or over) → goal kick.
      if (lastTouch === defender) {
        return { type: "corner", team: attacker, position: cornerSpot(side, zSign) };
      }
      return { type: "goalkick", team: defender, position: goalKickSpot(side, zSign) };
    }
  }

  // Touchline (either side) — out once the whole ball has crossed it.
  const lineWithBallZ = halfWidth + BALL_RADIUS;
  if (Math.abs(next.position.z) >= lineWithBallZ && Math.abs(prev.position.z) < lineWithBallZ) {
    const zSide: 1 | -1 = next.position.z >= 0 ? 1 : -1;
    // Whoever didn't touch it last throws it in.
    const receivingTeam: TeamSide = lastTouch === "home" ? "away" : "home";
    return {
      type: "throwin",
      team: receivingTeam,
      position: throwInSpot(next.position.x, zSide),
    };
  }

  return null;
}

/** Human-readable label for the HUD banner. */
export function restartLabel(type: RestartType): string {
  if (type === "throwin") return "Throw-in";
  if (type === "corner") return "Corner";
  return "Goal Kick";
}

/**
 * How far the *non-taking* side must be from the restart spot before play
 * resumes — loosely modelled on real distances (corners are the strictest:
 * defenders have to retreat well clear of the arc). Without this, whoever
 * chased the ball out is often still standing right on top of the restart
 * spot, which both looks wrong and was the main reason restarts kept
 * immediately going back out — an "opponent" contesting the ball the
 * instant it's placed, right next to the boundary, tends to shove it
 * straight back over.
 */
export const RESTART_CLEARANCE: Record<RestartType, number> = {
  throwin: 3,
  corner: 8,
  goalkick: 6,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Faces `from` roughly toward `to`, in the game's heading convention. */
export function headingTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

/**
 * Pushes any body within `minDist` of the restart spot straight back out to
 * exactly that distance (radially, away from the spot), so the restart
 * isn't instantly crowded. Pure.
 */
export function clearSpaceAroundRestart(
  bodies: Kinematics[],
  spot: { x: number; z: number },
  minDist: number,
): Kinematics[] {
  return bodies.map((b) => {
    const dx = b.position.x - spot.x;
    const dz = b.position.z - spot.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= minDist) return b;
    // Arbitrary but stable fallback direction if they're exactly on the spot.
    const nx = dist < 1e-3 ? 0 : dx / dist;
    const nz = dist < 1e-3 ? 1 : dz / dist;
    const position = {
      x: clamp(spot.x + nx * minDist, -FIELD.halfLength + 1, FIELD.halfLength - 1),
      y: 0,
      z: clamp(spot.z + nz * minDist, -FIELD.halfWidth + 1, FIELD.halfWidth - 1),
    };
    return { position, velocity: { x: 0, y: 0, z: 0 }, heading: b.heading };
  });
}
