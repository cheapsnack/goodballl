/**
 * Direct free kicks — pure logic only. The UI (FreeKick.tsx) owns the aim
 * reticle, curve dial and power meter; everything that decides an outcome
 * lives here so it can be unit tested and stays deterministic.
 *
 * Coordinates match the penalty module: aim.x is -1 (left post) … 1 (right
 * post), aim.y is 0 (ground) … 1 (crossbar).
 */
import type { PenaltyAim } from "./penalties";

export type FreeKickOutcome = "goal" | "saved" | "wall" | "miss";

/** A defensive wall, expressed in the same normalized goal units as the aim. */
export type Wall = {
  /** centre of the wall across the goal mouth */
  x: number;
  /** half-width of the wall */
  halfWidth: number;
  /** how high the wall's jump reaches, in goal-height units */
  height: number;
};

export const FREEKICK_TUNING = {
  /** attempts in one practice set */
  attempts: 5,
  /** keeper reach from where he guessed, in goal half-widths */
  keeperReach: 0.44,
  /** how much of the keeper's reach a full-power strike takes away */
  powerPenalty: 0.5,
  /** how much full bend takes away from the keeper's reach (he's deceived) */
  curveDeception: 0.35,
  /** aiming beyond this on either axis puts the ball off target */
  missThreshold: 0.97,
  /**
   * Bend, in goal half-widths, that a full curve input shifts the ball's path
   * at the wall line. Partial curve shifts it proportionally.
   */
  bendAroundWall: 0.55,
  /** fraction of the final aim height the ball has reached at the wall line */
  riseAtWall: 0.72,
} as const;

export type FreeKickLevel = "easy" | "normal" | "hard";
export const FREEKICK_LEVELS: FreeKickLevel[] = ["easy", "normal", "hard"];
export const DEFAULT_FREEKICK_LEVEL: FreeKickLevel = "normal";

export const FREEKICK_LEVEL_TUNING: Record<
  FreeKickLevel,
  {
    keeperAccuracy: number;
    keeperReachScale: number;
    wallHeight: number;
    powerTime: number;
    aimSpeed: { x: number; y: number };
    curveSpeed: number;
    label: string;
    blurb: string;
  }
> = {
  easy: {
    keeperAccuracy: 0.08,
    keeperReachScale: 0.75,
    wallHeight: 0.34,
    powerTime: 1.7,
    aimSpeed: { x: 0.55, y: 0.42 },
    curveSpeed: 0.85,
    label: "Easy",
    blurb: "Short wall · keeper guesses blind · slow power",
  },
  normal: {
    keeperAccuracy: 0.26,
    keeperReachScale: 1,
    wallHeight: 0.45,
    powerTime: 1.25,
    aimSpeed: { x: 0.75, y: 0.58 },
    curveSpeed: 1,
    label: "Normal",
    blurb: "Balanced wall, dive and power window",
  },
  hard: {
    keeperAccuracy: 0.5,
    keeperReachScale: 1.18,
    wallHeight: 0.56,
    powerTime: 0.85,
    aimSpeed: { x: 1, y: 0.75 },
    curveSpeed: 1.25,
    label: "Hard",
    blurb: "Tall wall · keeper reads you · snappy power",
  },
};


const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A wall placed to cover the near-post side of the taker's position. */
export function buildWall(side: -1 | 1, level: FreeKickLevel): Wall {
  const t = FREEKICK_LEVEL_TUNING[level];
  return { x: side * 0.34, halfWidth: 0.3, height: t.wallHeight };
}

/**
 * Whether the strike is blocked. A ball bent hard enough travels around the
 * wall; a flat low ball straight at it does not.
 */
export function hitsWall(aim: PenaltyAim, curve: number, wall: Wall): boolean {
  if (Math.abs(curve) >= FREEKICK_TUNING.bendAroundWall) return false;
  if (aim.y > wall.height) return false;
  return Math.abs(aim.x - wall.x) <= wall.halfWidth;
}

/** Where the keeper dives: biased toward the aim by `accuracy` (0…1). */
export function keeperGuessFK(
  aim: PenaltyAim,
  accuracy: number,
  rng: () => number = Math.random,
): PenaltyAim {
  const a = clamp(accuracy, 0, 1);
  return {
    x: clamp(aim.x * a + (rng() * 2 - 1) * (1 - a), -1, 1),
    y: clamp(aim.y * a + rng() * (1 - a), 0, 1),
  };
}

/** Resolves one free kick. Pure. */
export function resolveFreeKick(
  aim: PenaltyAim,
  power: number,
  curve: number,
  guess: PenaltyAim,
  wall: Wall,
  reachScale = 1,
): FreeKickOutcome {
  if (Math.abs(aim.x) > FREEKICK_TUNING.missThreshold || aim.y > FREEKICK_TUNING.missThreshold) {
    return "miss";
  }
  if (hitsWall(aim, curve, wall)) return "wall";

  const p = clamp(power, 0, 1);
  const c = Math.abs(clamp(curve, -1, 1));
  const reach =
    FREEKICK_TUNING.keeperReach *
    reachScale *
    (1 - FREEKICK_TUNING.powerPenalty * p) *
    (1 - FREEKICK_TUNING.curveDeception * c);
  const dist = Math.abs(aim.x - guess.x) + 0.6 * Math.abs(aim.y - guess.y);
  return dist <= reach ? "saved" : "goal";
}

export type FreeKickSet = {
  results: FreeKickOutcome[];
  /** null until the set is finished */
  done: boolean;
};

export const initFreeKickSet = (): FreeKickSet => ({ results: [], done: false });

export const freeKickScore = (r: FreeKickOutcome[]) => r.filter((o) => o === "goal").length;

/** Records one attempt and closes the set once every attempt is taken. Pure. */
export function applyFreeKick(set: FreeKickSet, outcome: FreeKickOutcome): FreeKickSet {
  if (set.done) return set;
  const results = [...set.results, outcome];
  return { results, done: results.length >= FREEKICK_TUNING.attempts };
}
