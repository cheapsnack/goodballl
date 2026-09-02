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
  captureRadius: 1.2,
  /** how far ahead of the possessor (in facing direction) the ball sits at a standstill */
  holdDistance: 0.45,
  /** extra hold distance at full speed — pushed a touch further ahead when sprinting */
  sprintHoldBonus: 0.3,
  /** a ball above this height can't be picked up yet — it has to come down first */
  maxCaptureHeight: 1.1,
  /**
   * An opponent can steal the ball by getting within this radius of the *carrier's
   * body* (not the floating ball point). This is the key fix for "can't steal the
   * ball" — the old system only checked distance to the ball's offset position,
   * which was ~0.5m further from the opposing player's reach than it should be.
   * Setting this equal to captureRadius means "close enough to the player = stole it".
   */
  stealRadius: 1.2,
} as const;

/** Where the ball sits, glued to a possessor's body, this frame. Pure. */
export function possessionBallPosition(
  possessor: Kinematics,
  speedFrac: number,
): { x: number; z: number } {
  const dist =
    POSSESSION_TUNING.holdDistance +
    Math.max(0, Math.min(1, speedFrac)) * POSSESSION_TUNING.sprintHoldBonus;
  return {
    x: possessor.position.x + Math.sin(possessor.heading) * dist,
    z: possessor.position.z - Math.cos(possessor.heading) * dist,
  };
}

export type CaptureCandidate = { team: TeamSide; index: number; body: Kinematics };

/**
 * Finds whoever is closest to a loose ball within capture range, if anyone —
 * this is the *only* way possession changes hands for a loose ball. Pure.
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

/**
 * Checks whether any opponent can steal possession from the current carrier,
 * purely by being close enough to the carrier's *body*. This runs every frame
 * while the ball is possessed, alongside (not instead of) the loose-ball
 * tryCapture — it's the primary way you win the ball back without a tackle.
 * Returns the stealer's identity, or null if nobody's close enough. Pure.
 */
export function trySteal(
  carrier: Kinematics,
  opponents: CaptureCandidate[],
): Possession | null {
  let best: Possession | null = null;
  let bestDist: number = POSSESSION_TUNING.stealRadius;
  for (const o of opponents) {
    const dist = Math.hypot(
      carrier.position.x - o.body.position.x,
      carrier.position.z - o.body.position.z,
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = { team: o.team, index: o.index };
    }
  }
  return best;
}
