import type { BallState } from "../types";
import { BALL_RADIUS } from "./ballPhysics";

/**
 * Slide tackle. A committed one-shot dash rather than a held state: pressing
 * the key adds a forward lunge to the player's velocity and opens a short
 * window during which touching the ball knocks it loose, whoever "had" it.
 * All tackle feel lives here — nothing downstream hardcodes these numbers.
 */
export const TACKLE_TUNING = {
  /** seconds before another tackle can be attempted */
  cooldown: 1.0,
  /** seconds the lunge can connect with the ball */
  activeWindow: 0.32,
  /** m/s added along the player's facing on the lunge */
  dashSpeed: 9.5,
  /** how close the ball must be for the tackle to connect */
  reach: 1.9,
  /** ball can't be tackled above this height */
  maxHeight: 1.2,
  /** m/s the ball is knocked away at */
  knockSpeed: 9,
  /** small pop so the loose ball reads as a real challenge */
  knockLift: 1.6,
} as const;

/** Forward lunge velocity for a player facing `heading`. */
export function tackleDash(heading: number): { x: number; z: number } {
  return {
    x: Math.sin(heading) * TACKLE_TUNING.dashSpeed,
    z: -Math.cos(heading) * TACKLE_TUNING.dashSpeed,
  };
}

/**
 * Resolves a connecting tackle. Returns the knocked-loose ball, or null when
 * the lunge didn't reach it. Pure.
 */
export function attemptTackleImpulse(
  ball: BallState,
  from: { x: number; z: number },
): BallState | null {
  if (ball.position.y > TACKLE_TUNING.maxHeight) return null;

  const dx = ball.position.x - from.x;
  const dz = ball.position.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist > TACKLE_TUNING.reach) return null;

  // Degenerate case: ball exactly underfoot — poke it straight ahead of it.
  const len = dist || 1e-4;
  const nx = dx / len;
  const nz = dz / len;

  return {
    ...ball,
    position: { ...ball.position, y: Math.max(ball.position.y, BALL_RADIUS) },
    velocity: {
      x: nx * TACKLE_TUNING.knockSpeed,
      y: TACKLE_TUNING.knockLift,
      z: nz * TACKLE_TUNING.knockSpeed,
    },
    heading: Math.atan2(nx, nz),
  };
}
