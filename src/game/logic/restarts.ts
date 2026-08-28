import type { BallState } from "../types";
import { BALL_RADIUS } from "./ballPhysics";
import { FIELD, cornerSpot, goalKickSpot, throwInSpot } from "./field";
import { scorerForGoalLine, type TeamSide } from "./match";

export type RestartType = "throwin" | "corner" | "goalkick";

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
