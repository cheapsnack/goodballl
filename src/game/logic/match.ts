import type { BallState } from "../types";
import { BALL_RADIUS } from "./ballPhysics";
import { FIELD, goalLineX } from "./field";

/** All match-structure numbers live here. */
export const MATCH_TUNING = {
  /** number of regulation periods in a match */
  periods: 2,
  /** length of each regulation period in real (wall-clock) seconds — 3 min per half */
  periodSeconds: 180,
  /** how many displayed seconds pass per real second (3 real min = 45 displayed min) */
  clockScale: 15,
  /** number of extra-time periods played when regulation ends level */
  extraPeriods: 2,
  /** length of each extra-time period in real seconds — 1 min = 15 displayed min */
  extraPeriodSeconds: 60,
  /** how long the GOAL! banner holds before the reset */
  goalCelebration: 3.2,
  /** how long the kickoff freeze lasts before play resumes */
  kickoffPause: 1.4,
  /** how long the half-time break holds */
  halfTimePause: 3,
  /** how long a throw-in/corner/goal-kick pauses before going live */
  restartPause: 0.9,
} as const;

/** Total number of periods once extra time is included. */
export const TOTAL_PERIODS = MATCH_TUNING.periods + MATCH_TUNING.extraPeriods;

export type MatchStatus =
  | "kickoff"
  | "playing"
  | "goal"
  | "restart"
  | "halftime"
  | "extratime"
  | "penalties"
  | "fulltime";

export type Score = { home: number; away: number };

/** "home" is the human (attacks +x); "away" is the AI (defends +x). */
export type TeamSide = "home" | "away";

/** Real-time length of a given 1-based period (regulation or extra time). */
export function periodLength(period: number): number {
  return period <= MATCH_TUNING.periods
    ? MATCH_TUNING.periodSeconds
    : MATCH_TUNING.extraPeriodSeconds;
}

/** Human-readable label for a period, e.g. "1st half" / "ET 1". */
export function periodLabel(period: number): string {
  if (period === 1) return "1st half";
  if (period === 2) return "2nd half";
  return `Extra time ${period - MATCH_TUNING.periods}`;
}


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

/**
 * Broadcast clock, in *displayed* seconds: real time is scaled up so a
 * 3-minute half reads as 45:00, and extra-time periods continue from 90:00.
 */
export function displayClock(period: number, periodElapsed: number): number {
  let before = 0;
  for (let p = 1; p < period; p++) before += periodLength(p);
  return (before + periodElapsed) * MATCH_TUNING.clockScale;
}

/** True when physics should be frozen (celebration, break, or match over). */
export const isPlayFrozen = (status: MatchStatus) =>
  status === "goal" ||
  status === "restart" ||
  status === "halftime" ||
  status === "extratime" ||
  status === "penalties" ||
  status === "fulltime";

