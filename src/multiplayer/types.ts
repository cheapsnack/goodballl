import type { ActionInput, MovementInput } from "../game/types";

export type GuestJoinedPayload = { guestClubId: string };

/** Everything the guest's local input hook produces, sent to the host every frame. */
export type GuestInputPayload = MovementInput & ActionInput;

type BodySnapshot = { x: number; z: number; heading: number };
type GKSnapshot = BodySnapshot & { phase: string; diveDir: -1 | 0 | 1 };

/**
 * A compact, serializable slice of match state — just enough for the guest
 * to render the same match, not the full simulation types (velocities,
 * timers, etc. the guest never needs since it never steps physics itself).
 */
export type MatchSnapshot = {
  homeOutfield: BodySnapshot[];
  homeGK: GKSnapshot;
  awayOutfield: BodySnapshot[];
  awayGK: GKSnapshot;
  ball: { x: number; y: number; z: number; vx: number; vz: number };
  controlledIndex: number;
  awayControlledIndex: number | null;
  score: { home: number; away: number };
  matchTime: number;
  period: number;
  matchStatus: string;
  statusTimer: number;
  lastScorer: "home" | "away" | null;
};
