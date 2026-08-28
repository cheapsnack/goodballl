import type { BallState } from "../types";
import { BALL_RADIUS } from "./ballPhysics";
import { cornerSpot, FIELD, goalKickSpot, goalLineX, throwInSpot } from "./field";
import type { TeamSide } from "./match";

export type RestartType = "throw-in" | "corner" | "goal-kick";

export type RestartAward = {
  type: RestartType;
  /** where the ball is placed */
  position: { x: number; z: number };
  /** which team gets the restart */
  team: TeamSide;
};

const other = (team: TeamSide): TeamSide => (team === "home" ? "away" : "home");

/** Which team attacks the goal on a given side (home attacks +x). */
const attackerOfGoal = (side: 1 | -1): TeamSide => (side === 1 ? "home" : "away");

/**
 * Detects the ball leaving the field of play across one frame and returns the
 * restart it produces. Returns null while the ball is in play.
 *
 * Call this *after* goal detection — a ball in the net is not out of play.
 */
export function detectOutOfBounds(
  prev: BallState,
  next: BallState,
  lastTouch: TeamSide,
): RestartAward | null {
  // --- touchlines (z) -> throw-in to the team that didn't touch it last ---
  const zLine = FIELD.halfWidth + BALL_RADIUS;
  if (Math.abs(next.position.z) > zLine && Math.abs(prev.position.z) <= zLine) {
    const zSide: 1 | -1 = next.position.z > 0 ? 1 : -1;
    const t = (zSide * zLine - prev.position.z) / (next.position.z - prev.position.z || 1);
    const x = prev.position.x + (next.position.x - prev.position.x) * t;
    return { type: "throw-in", position: throwInSpot(x, zSide), team: other(lastTouch) };
  }

  // --- goal lines (x) -> corner or goal kick ---
  for (const side of [1, -1] as const) {
    const line = goalLineX(side) * side + BALL_RADIUS;
    const before = prev.position.x * side;
    const after = next.position.x * side;
    if (before >= line || after < line) continue;

    const t = (line - before) / (after - before || 1);
    const z = prev.position.z + (next.position.z - prev.position.z) * t;
    const zSign: 1 | -1 = z >= 0 ? 1 : -1;

    const attacker = attackerOfGoal(side);
    if (lastTouch === attacker) {
      // Attacker put it behind: goal kick to the defending side.
      return { type: "goal-kick", position: goalKickSpot(side, zSign), team: other(attacker) };
    }
    // Defender put it behind their own line: corner to the attackers.
    return { type: "corner", position: cornerSpot(side, zSign), team: attacker };
  }

  return null;
}
