import type { TeamSide } from "./match";

/**
 * Penalty shootout — pure logic only. The UI (PenaltyShootout.tsx) owns the
 * aim reticle and power meter; everything that decides an outcome lives
 * here so it can be unit tested and stays deterministic with an injected rng.
 */
export const PENALTY_TUNING = {
  /** kicks each side takes before sudden death */
  rounds: 5,
  /**
   * How far (in normalized goal units) a keeper can still reach from where
   * they guessed. 1 unit = half the goal width.
   */
  keeperReach: 0.55,
  /** how much of the keeper's reach a full-power strike takes away */
  powerPenalty: 0.3,
  /** aiming beyond this (either axis) puts the ball off target */
  missThreshold: 0.94,
} as const;

/** Aim inside the goal mouth: x -1 (left post) … 1 (right post), y 0 (ground) … 1 (crossbar). */
export type PenaltyAim = { x: number; y: number };

export type PenaltyOutcome = "goal" | "saved" | "miss";

export type ShootoutState = {
  /** 1-based round; rounds above PENALTY_TUNING.rounds are sudden death */
  round: number;
  /** which side takes the next kick — home always goes first in a round */
  turn: TeamSide;
  home: PenaltyOutcome[];
  away: PenaltyOutcome[];
  winner: TeamSide | null;
};

export const initShootout = (): ShootoutState => ({
  round: 1,
  turn: "home",
  home: [],
  away: [],
  winner: null,
});

/** Goals scored so far by one side. */
export const shootoutScore = (results: PenaltyOutcome[]): number =>
  results.filter((r) => r === "goal").length;

/**
 * Where the keeper commits. `accuracy` (0..1, from the difficulty tier)
 * biases the guess toward the actual aim; at 0 it's a blind guess.
 */
export function keeperGuess(
  aim: PenaltyAim,
  accuracy: number,
  rng: () => number = Math.random,
): PenaltyAim {
  const blindX = (rng() - 0.5) * 2;
  const blindY = rng() * 0.8;
  const a = Math.max(0, Math.min(1, accuracy));
  return {
    x: blindX + (aim.x - blindX) * a,
    y: blindY + (aim.y - blindY) * a,
  };
}

/**
 * Resolves one penalty. Harder, better-placed strikes beat the keeper:
 * power shrinks the keeper's effective reach, and aiming into the very
 * corner risks missing the target entirely.
 */
export function resolvePenalty(
  aim: PenaltyAim,
  power: number,
  guess: PenaltyAim,
): PenaltyOutcome {
  if (Math.abs(aim.x) > PENALTY_TUNING.missThreshold || aim.y > PENALTY_TUNING.missThreshold) {
    return "miss";
  }
  const reach =
    PENALTY_TUNING.keeperReach * (1 - PENALTY_TUNING.powerPenalty * Math.max(0, Math.min(1, power)));
  const dist = Math.abs(aim.x - guess.x) + 0.6 * Math.abs(aim.y - guess.y);
  return dist <= reach ? "saved" : "goal";
}

/**
 * Whether the shootout is already decided: one side can no longer be caught
 * with the kicks each has left in the first `rounds` rounds, or — in sudden
 * death — both took a kick in the round and one scored while the other missed.
 */
export function decideWinner(state: ShootoutState): TeamSide | null {
  const { rounds } = PENALTY_TUNING;
  const homeGoals = shootoutScore(state.home);
  const awayGoals = shootoutScore(state.away);
  const homeTaken = state.home.length;
  const awayTaken = state.away.length;

  if (homeTaken >= rounds && awayTaken >= rounds && homeTaken === awayTaken) {
    if (homeGoals !== awayGoals) return homeGoals > awayGoals ? "home" : "away";
    return null;
  }

  const homeLeft = Math.max(0, rounds - homeTaken);
  const awayLeft = Math.max(0, rounds - awayTaken);
  if (homeGoals > awayGoals + awayLeft) return "home";
  if (awayGoals > homeGoals + homeLeft) return "away";
  return null;
}

/** Records one kick's outcome and advances the turn / round. Pure. */
export function applyPenalty(state: ShootoutState, outcome: PenaltyOutcome): ShootoutState {
  if (state.winner) return state;
  const next: ShootoutState =
    state.turn === "home"
      ? { ...state, home: [...state.home, outcome], turn: "away" }
      : { ...state, away: [...state.away, outcome], turn: "home", round: state.round + 1 };
  return { ...next, winner: decideWinner(next) };
}
