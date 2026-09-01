import type { BallState, Kinematics } from "../types";
import type { TeamSide } from "./match";

export type Possession = { team: TeamSide; index: number };

/**
 * FIFA/PES-style close control: while a player possesses the ball, its
 * position is *computed directly* from that player's body — not simulated
 * as a separate physics object being pulled and pushed by competing forces.
 * That's what makes the ball actually stay at your feet instead of skating
 * off on every touch. The ball only becomes a free physics object (see
 * ballPhysics.ts) when nobody possesses it.
 */
export const POSSESSION_TUNING = {
  /** distance at which a loose, reachable ball gets captured */
  captureRadius: 1.0,
  /** how far ahead of the possessor (in facing direction) the ball sits at a standstill */
  holdDistance: 0.5,
  /** extra hold distance at full speed — pushed a touch further ahead when sprinting, like a real running touch */
  sprintHoldBonus: 0.4,
  /** a ball above this height can't be picked up yet — it has to come down first (no catching a lob out of the air) */
  maxCaptureHeight: 1.1,
} as const;

/** Where the ball sits, glued to a possessor's body, this frame. Pure. */
export function possessionBallPosition(
  possessor: Kinematics,
  speedFrac: number,
): { x: number; z: number } {
  const dist =
    POSSESSION_TUNING.holdDistance + Math.max(0, Math.min(1, speedFrac)) * POSSESSION_TUNING.sprintHoldBonus;
  return {
    x: possessor.position.x + Math.sin(possessor.heading) * dist,
    z: possessor.position.z - Math.cos(possessor.heading) * dist,
  };
}

export type CaptureCandidate = { team: TeamSide; index: number; body: Kinematics };

/**
 * Finds whoever is closest to a loose ball within capture range, if anyone —
 * this is the *only* way possession changes hands for a loose ball (no more
 * partial pushes/deflections that leave it in an ambiguous state). Pure.
 */
export function tryCapture(ball: BallState, candidates: CaptureCandidate[]): Possession | null {
  if (ball.position.y > POSSESSION_TUNING.maxCaptureHeight) return null;

  let best: Possession | null = null;
  let bestDist: number = POSSESSION_TUNING.captureRadius;
  for (const c of candidates) {
    const dist = Math.hypot(ball.position.x - c.body.position.x, ball.position.z - c.body.position.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = { team: c.team, index: c.index };
    }
  }
  return best;
}
