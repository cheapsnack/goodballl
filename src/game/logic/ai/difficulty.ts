export type Difficulty = "beginner" | "amateur" | "advanced" | "expert";

export type DifficultyTuning = {
  /** multiplies every AI player's accel/top speed — the main "how fast is this AI" lever */
  speedMult: number;
  /**
   * How far from the opponent's goal an in-possession AI will consider
   * shooting rather than continuing to dribble.
   */
  shootRange: number;
  /** 0..1 — how tightly a shot aims at goal; lower means a wider random spread */
  shotAccuracy: number;
  /** shot speed AI players strike with */
  shotPower: number;
  /**
   * 0..1 — how much an in-possession AI's movement is pulled toward the
   * opponent's goal vs. just following the ball directly. Low values look
   * passive/aimless; high values drive purposefully at goal.
   */
  dribbleBias: number;
  /** minimum seconds between shot attempts for the same player */
  decisionCooldown: number;
  /** seconds of delay between an AI deciding to shoot and actually striking — a cheap stand-in for reaction time */
  shotWindup: number;
};

export const DIFFICULTY_TUNING: Record<Difficulty, DifficultyTuning> = {
  beginner: {
    speedMult: 0.72,
    shootRange: 11,
    shotAccuracy: 0.35,
    shotPower: 15,
    dribbleBias: 0.35,
    decisionCooldown: 2.6,
    shotWindup: 0.55,
  },
  amateur: {
    speedMult: 0.88,
    shootRange: 15,
    shotAccuracy: 0.6,
    shotPower: 18,
    dribbleBias: 0.6,
    decisionCooldown: 1.8,
    shotWindup: 0.32,
  },
  advanced: {
    speedMult: 1.0,
    shootRange: 18,
    shotAccuracy: 0.8,
    shotPower: 20,
    dribbleBias: 0.82,
    decisionCooldown: 1.2,
    shotWindup: 0.16,
  },
  expert: {
    speedMult: 1.12,
    shootRange: 21,
    shotAccuracy: 0.94,
    shotPower: 22,
    dribbleBias: 1.0,
    decisionCooldown: 0.75,
    shotWindup: 0.05,
  },
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  amateur: "Amateur",
  advanced: "Advanced",
  expert: "Expert",
};

export const DEFAULT_DIFFICULTY: Difficulty = "amateur";
