import type { BallState, Kinematics } from "../game/types";
import type { KeeperState } from "../game/logic/ai/goalkeeper";
import type { MatchStatus, Score, TeamSide } from "../game/logic/match";

/** Who this browser is in the current match. */
export type NetRole = "local" | "host" | "guest";

/** Broadcast event names on the `room:{code}` channel. */
export const ROOM_EVENTS = {
  guestJoined: "guest-joined",
  input: "guest-input",
  state: "host-state",
} as const;

/** Sent once by the guest, right after they claim the room. */
export type GuestJoinedPayload = { guestClubId: string };

/** The guest's raw keys, relayed to the host every frame. */
export type GuestInputPayload = {
  x: number;
  z: number;
  sprint: boolean;
  shoot: boolean;
  pass: boolean;
  loft: boolean;
  cameraToggle: boolean;
  switchPlayer: boolean;
};

/**
 * A full authoritative frame from the host. The guest simulates nothing, so
 * this carries everything its renderer and HUD need.
 */
export type StateSnapshot = {
  homeOutfield: Kinematics[];
  homeGK: Kinematics;
  homeGKState: KeeperState;
  awayOutfield: Kinematics[];
  awayGK: Kinematics;
  awayGKState: KeeperState;
  ball: BallState;
  controlledIndex: number;
  awayControlledIndex: number | null;
  score: Score;
  matchTime: number;
  period: number;
  matchStatus: MatchStatus;
  statusTimer: number;
  lastScorer: TeamSide | null;
};
