import type { BallState, Club, Kinematics, MovementInput, Player, PlayerPosition } from "../../types";
import { FIELD } from "../field";
import { playersAt } from "../../data/clubs";

/** Outfield AI feel. Every number the AI uses lives here. */
export const OUTFIELD_TUNING = {
  /** how far ahead of the ball's motion a chasing player aims */
  interceptLead: 0.35,
  /** stop closing once inside this radius so they don't jitter on the ball */
  pressDeadZone: 0.45,
  /** sprint when the ball is further away than this */
  sprintRange: 6,
  /** how strongly a holding player's zone shifts with the ball's x */
  zonalTrackX: 0.45,
  /** ...and z */
  zonalTrackZ: 0.55,
  /** dead zone before a zonal player bothers repositioning */
  zonalDeadZone: 1.4,
  /**
   * A challenger must be closer than the current chaser by at least this
   * many metres before the role switches — without this, two players at
   * near-equal distance flip the chaser role every frame, which reads as
   * both of them twitching randomly instead of one committing.
   */
  chaserSwitchMargin: 1.6,
  /**
   * No AI player's *target* is ever set closer than this to the true
   * touchline/goal-line — they'll still contest a ball that's drifted into
   * the run-off, but they aim to receive it just inside the line rather
   * than sprinting flat-out through the corner after it. This is what stops
   * the "defender chases the ball out and shoves it further out" loop.
   */
  safeMargin: 2.5,
} as const;

/** Depth (metres from *own* goal line) each line of a formation holds. */
export const FORMATION_DEPTH = {
  DEF: 20,
  MID: 50,
  FWD: 78,
} as const;

export type OutfieldSlot = { position: "DEF" | "MID" | "FWD"; depth: number; z: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Clamps a target point to a zone safely inside the true pitch boundary.
 * Every AI movement target (chasing or zonal) goes through this, so no
 * outfield player is ever *aiming* for the corner or the sideline itself —
 * at worst they run up to the safe-zone edge and hold, letting the ball
 * (and whoever is actually meant to take the restart) settle instead of
 * repeatedly punching it back over the line on contact.
 */
function clampToSafeZone(x: number, z: number): { x: number; z: number } {
  const m = OUTFIELD_TUNING.safeMargin;
  return {
    x: clamp(x, -FIELD.halfLength + m, FIELD.halfLength - m),
    z: clamp(z, -FIELD.halfWidth + m, FIELD.halfWidth - m),
  };
}

/** Evenly spreads `n` points across the pitch width, centred on 0. */
function spreadZ(n: number, maxAbsZ = 27): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const step = (maxAbsZ * 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => -maxAbsZ + i * step);
}

/**
 * The 10 outfield slots (no GK) for a formation string like "4-3-3", in a
 * fixed DEF-then-MID-then-FWD order. Pure function of the formation, so home
 * and away can each call it independently and stay index-stable.
 */
export function formationSlots(formation: Club["formation"]): OutfieldSlot[] {
  const [def, mid, fwd] = formation.split("-").map(Number) as [number, number, number];
  return [
    ...spreadZ(def).map((z) => ({ position: "DEF" as const, depth: FORMATION_DEPTH.DEF, z })),
    ...spreadZ(mid).map((z) => ({ position: "MID" as const, depth: FORMATION_DEPTH.MID, z })),
    ...spreadZ(fwd).map((z) => ({ position: "FWD" as const, depth: FORMATION_DEPTH.FWD, z })),
  ];
}

/** World-space anchor for a slot, given which goal the team defends. */
export function slotAnchor(slot: OutfieldSlot, defendSide: 1 | -1): { x: number; z: number } {
  return { x: defendSide * (FIELD.halfLength - slot.depth), z: slot.z };
}

export type OutfieldRole = {
  id: string;
  /** which goal this player's team defends (1 = +x goal, -1 = -x goal) */
  defendSide: 1 | -1;
  slot: OutfieldSlot;
};

export type OutfieldEntity = { role: OutfieldRole; player: Player; body: Kinematics };

/**
 * Builds a full 10-player outfield XI for a club in its own formation,
 * anchored to the goal it defends, with spawn positions at each player's
 * formation slot. Pure — call once per kickoff, not per frame.
 */
export function buildOutfield(club: Club, defendSide: 1 | -1): OutfieldEntity[] {
  const slots = formationSlots(club.formation);
  const used: Partial<Record<PlayerPosition, number>> = {};

  return slots.map((slot, i) => {
    const pool = playersAt(club, slot.position, 99);
    const idx = used[slot.position] ?? 0;
    used[slot.position] = idx + 1;
    const player = pool[idx] ?? pool[0]!;

    const anchor = slotAnchor(slot, defendSide);
    // Face up the pitch toward the goal they attack.
    const heading = defendSide === 1 ? Math.PI : 0;

    return {
      role: { id: `${club.id}-${slot.position}-${i}`, defendSide, slot },
      player,
      body: {
        position: { x: anchor.x, y: 0, z: anchor.z },
        velocity: { x: 0, y: 0, z: 0 },
        heading,
      },
    };
  });
}

/** Squared-free planar distance to the ball — used for "who's nearest". */
export function distanceToBall(body: Kinematics, ball: BallState): number {
  return Math.hypot(ball.position.x - body.position.x, ball.position.z - body.position.z);
}

/** The formation index a human controls by default: the first forward. */
export function defaultControlledIndex(xi: OutfieldEntity[]): number {
  const idx = xi.findIndex((e) => e.role.slot.position === "FWD");
  return idx >= 0 ? idx : 0;
}
/**
 * Index of whoever should press the ball out of a group. Sticky: keeps the
 * current chaser unless someone else is closer by more than the switch
 * margin. Pass `currentChaser: -1` when there's no incumbent yet.
 */
export function nearestChaserIndex(
  players: Kinematics[],
  ball: BallState,
  currentChaser = -1,
): number {
  let best = -1;
  let bestDist = Infinity;
  players.forEach((p, i) => {
    const dist = distanceToBall(p, ball);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });

  if (currentChaser >= 0 && currentChaser < players.length && best !== currentChaser) {
    const incumbentDist = distanceToBall(players[currentChaser]!, ball);
    if (incumbentDist - bestDist < OUTFIELD_TUNING.chaserSwitchMargin) {
      return currentChaser;
    }
  }

  return best;
}

/** Index of whoever is nearest the ball — used for player-switching (no hysteresis; a deliberate press should always pick truly nearest). */
export function nearestToBallIndex(players: Kinematics[], ball: BallState): number {
  let best = 0;
  let bestDist = Infinity;
  players.forEach((p, i) => {
    const dist = distanceToBall(p, ball);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

/** The spot a zonal (non-chasing) player wants to occupy, given the ball. */
export function zonalAnchor(role: OutfieldRole, ball: BallState): { x: number; z: number } {
  const t = OUTFIELD_TUNING;
  const anchor = slotAnchor(role.slot, role.defendSide);
  const x = anchor.x + (ball.position.x - anchor.x) * t.zonalTrackX;
  const z = anchor.z + (ball.position.z - anchor.z) * t.zonalTrackZ;
  return clampToSafeZone(x, z);
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
 * One outfield player's decision for this frame.
 *  - the chaser presses the ball (aiming slightly ahead of it)
 *  - everyone else holds a loose zone anchored to their formation slot,
 *    drifting with the ball
 *
 * Pure: returns a MovementInput that goes straight into stepMovement, so AI
 * players obey exactly the same physics as the human.
 */
export function stepOutfield(
  self: Kinematics,
  role: OutfieldRole,
  ball: BallState,
  isChaser: boolean,
): MovementInput {
  const t = OUTFIELD_TUNING;

  if (isChaser) {
    const target = clampToSafeZone(
      ball.position.x + ball.velocity.x * t.interceptLead,
      ball.position.z + ball.velocity.z * t.interceptLead,
    );
    return seek(self, target, { deadZone: t.pressDeadZone, sprintRange: t.sprintRange });
  }

  return seek(self, zonalAnchor(role, ball), {
    deadZone: t.zonalDeadZone,
    sprintRange: t.sprintRange * 2,
  });
}
