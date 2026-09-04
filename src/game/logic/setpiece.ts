import type { Kinematics } from "../types";
import { FIELD } from "./field";
import { headingTo, type RestartType } from "./restarts";
import type { Booking } from "./bookings";
import type { TeamSide } from "./match";

/** Which goal line a team attacks. Home attacks +x, away attacks -x. */
export const attackGoalX = (team: TeamSide): number =>
  team === "home" ? FIELD.halfLength : -FIELD.halfLength;

/**
 * How far inside the pitch the taker stands relative to the ball spot.
 * Corners are positive (taker stands *inside* the ball, toward the goal) so
 * the glued ball never sits on top of two boundaries; every other restart is
 * negative (taker stands behind the ball, facing their target).
 */
export const TAKER_INSET: Record<RestartType, number> = {
  corner: 1.6,
  throwin: -1.1,
  freekick: -1.1,
  penalty: -1.1,
  goalkick: -1.1,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type TakerPlacement = {
  /** Where the taker aims — the point their heading points at. */
  aimAt: { x: number; z: number };
  /** Where the taker's body is placed. */
  takerPos: { x: number; z: number };
  /** Heading in the game's convention. */
  heading: number;
};

/**
 * Where the taker stands and what they face for a dead-ball restart.
 * Pure — the scene renders and the debug overlay both read this.
 */
export function takerPlacement(
  type: RestartType,
  spot: { x: number; z: number },
  team: TeamSide,
): TakerPlacement {
  const goalX = attackGoalX(team);
  const aimAt =
    type === "corner"
      ? { x: goalX * 0.86, z: 0 }
      : type === "penalty" || type === "freekick"
        ? { x: goalX, z: 0 }
        : { x: 0, z: 0 };

  const dx = aimAt.x - spot.x;
  const dz = aimAt.z - spot.z;
  const len = Math.hypot(dx, dz) || 1;
  const inset = TAKER_INSET[type];
  const takerPos = {
    x: clamp(spot.x + (dx / len) * inset, -FIELD.halfLength + 2, FIELD.halfLength - 2),
    z: clamp(spot.z + (dz / len) * inset, -FIELD.halfWidth + 2, FIELD.halfWidth - 2),
  };
  return { aimAt, takerPos, heading: headingTo(takerPos, aimAt) };
}

/**
 * Nearest available (not sent off) outfield player to the restart spot, or
 * -1 when the whole side is somehow unavailable.
 */
export function pickTakerIndex(
  bodies: Kinematics[],
  sentOff: ReadonlySet<number>,
  spot: { x: number; z: number },
): number {
  let best = -1;
  let bestD = Infinity;
  bodies.forEach((b, i) => {
    if (sentOff.has(i)) return;
    const d = Math.hypot(b.position.x - spot.x, b.position.z - spot.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Outfield indices this team has had sent off, in booking order. */
export function sentOffIndices(bookings: Booking[], team: TeamSide): number[] {
  return bookings
    .filter((b) => b.team === team && b.color === "red")
    .map((b) => b.playerIndex);
}

/** Full XI size: 10 outfield + 1 goalkeeper. */
export const SQUAD_ON_PITCH = 11;

/** How many players this team currently has on the pitch (keeper included). */
export function playersOnPitch(bookings: Booking[], team: TeamSide): number {
  return SQUAD_ON_PITCH - new Set(sentOffIndices(bookings, team)).size;
}
