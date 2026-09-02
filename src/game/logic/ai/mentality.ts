export type Mentality = "defensive" | "balanced" | "attacking";

export type MentalityTuning = {
  /**
   * Shifts every player's *slot depth* (metres from own goal line) by this
   * amount. Positive pushes the whole team higher up the pitch, negative
   * drops them deeper. Attacking teams press higher, defensive teams sit
   * deeper — this is the core of how mentality actually reshapes play.
   */
  lineOffset: number;
  /**
   * How much the whole team shifts with the ball's x-position (0..1). Higher
   * values mean the block moves as one, closing space compactly (attacking);
   * lower values keep the shape wider (defensive).
   */
  ballShift: number;
  /**
   * When an AI has possession, how strongly the *rest* of their team pushes
   * up to support. High = attacking team piles forward; low = defensive
   * team keeps their shape.
   */
  supportPushMult: number;
};

export const MENTALITY_TUNING: Record<Mentality, MentalityTuning> = {
  defensive: {
    lineOffset: -8,
    ballShift: 0.35,
    supportPushMult: 0.6,
  },
  balanced: {
    lineOffset: 0,
    ballShift: 0.5,
    supportPushMult: 1.0,
  },
  attacking: {
    lineOffset: 8,
    ballShift: 0.7,
    supportPushMult: 1.4,
  },
};

export const MENTALITY_LABEL: Record<Mentality, string> = {
  defensive: "Defensive",
  balanced: "Balanced",
  attacking: "Attacking",
};

export const DEFAULT_MENTALITY: Mentality = "balanced";
