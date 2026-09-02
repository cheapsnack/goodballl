import type { BallState } from "../types";
import { BALL_RADIUS } from "./ballPhysics";
import { FIELD, goalLineX } from "./field";

/** All match-structure numbers live here. */
export const MATCH_TUNING = {
  /** number of periods in a match */
  periods: 2,
  /** length of each period in real (wall-clock) seconds — 2 min per half = 4 min total */
  periodSeconds: 120,
  /** how long the GOAL! banner holds before the reset */
  goalCelebration: 3.2,
  /** how long the kickoff freeze lasts before play resumes */
  kickoffPause: 1.4,
  /** how long the half-time break holds */
  halfTimePause: 3,
  /** how long a throw-in/corner/goal-kick pauses before going live */
  restartPause: 0.55,
} as const;

export type MatchStatus =
  | "kickoff"
  | "playing"
  | "goal"
  | "restart"
  | "halftime"
  | "fulltime";

export type Score = { home: number; away: number };

/** "home" is the human (attacks +x); "away" is the AI (defends +x). */
export type TeamSide = "home" | "away";

/**
 * Who scores when the ball crosses a given goal line. The human attacks the
 * +x goal, so a ball over +x is a home goal.
 */
export const scorerForGoalLine = (side: 1 | -1): TeamSide => (side === 1 ? "home" : "away");

/**
 * Detects a goal from the ball's movement across one frame. Uses the previous
 * position so a fast shot can't tunnel through the plane between frames.
 * Returns null when no goal was scored.
 */
export function detectGoal(
  prev: BallState,
  next: BallState,
): { side: 1 | -1; scorer: TeamSide } | null {
  for (const side of [1, -1] as const) {
    const line = goalLineX(side);
    const before = prev.position.x * side;
    const after = next.position.x * side;

    // The whole ball must be over the line.
    const lineWithBall = line * side + BALL_RADIUS;
    if (before >= lineWithBall || after < lineWithBall) continue;

    // Interpolate the crossing point so wide/high shots aren't miscounted.
    const t = (lineWithBall - before) / (after - before || 1);
    const z = prev.position.z + (next.position.z - prev.position.z) * t;
    const y = prev.position.y + (next.position.y - prev.position.y) * t;

    if (Math.abs(z) > FIELD.goalHalfWidth - BALL_RADIUS) continue;
    if (y > FIELD.goalHeight - BALL_RADIUS) continue;

    return { side, scorer: scorerForGoalLine(side) };
  }
  return null;
}

/** Formats seconds of match clock as broadcast MM:SS. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

/** Total clock seconds elapsed across the whole match at a given period. */
export function displayClock(period: number, periodElapsed: number): number {
  return (period - 1) * MATCH_TUNING.periodSeconds + periodElapsed;
}

/** True when physics should be frozen (celebration, break, or match over). */
export const isPlayFrozen = (status: MatchStatus) =>
  status === "goal" || status === "restart" || status === "halftime" || status === "fulltime";
