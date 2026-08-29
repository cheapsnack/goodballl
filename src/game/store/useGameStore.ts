import { create } from "zustand";
import type { BallState, ChargeState, Kinematics, MovementInput } from "../types";
import { BALL_RADIUS } from "../logic/ballPhysics";
import { IDLE_CHARGE } from "../logic/striking";
import type { CameraMode } from "../logic/camera";
import { FIELD } from "../logic/field";
import { initialKeeperState, keeperHome, type KeeperState } from "../logic/ai/goalkeeper";
import { buildOutfield, defaultControlledIndex } from "../logic/ai/outfield";
import { MATCH_TUNING, type MatchStatus, type Score, type TeamSide } from "../logic/match";
import { DEFAULT_AWAY_CLUB_ID, DEFAULT_HOME_CLUB_ID, getClub } from "../data/clubs";
import type { Restart } from "../logic/restarts";

export const PITCH = {
  length: FIELD.length,
  width: FIELD.width,
  halfLength: FIELD.halfLength,
  halfWidth: FIELD.halfWidth,
} as const;

export const PLAYER_RADIUS = 0.55;

/** Which goal each side defends. Home attacks +x, away attacks -x. */
export const HOME_DEFEND_SIDE = -1 as const;
export const AWAY_DEFEND_SIDE = 1 as const;
/** Kept for anything that still refers to the old single-opponent naming. */
export const DEFENDING_SIDE = AWAY_DEFEND_SIDE;

/**
 * Who's driving this browser's simulation:
 *  - "local": single-player, this browser runs the whole match (vs AI).
 *  - "host": a Play-vs-Friend match this browser is authoritative for —
 *    it runs the full simulation and broadcasts state to the guest.
 *  - "guest": a Play-vs-Friend match this browser only renders — it sends
 *    its input to the host and applies whatever state the host broadcasts.
 */
export type NetRole = "local" | "host" | "guest";

const body = (x: number, z: number, heading = 0): Kinematics => ({
  position: { x, y: 0, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading,
});

const initialGK = (side: 1 | -1): Kinematics => {
  const home = keeperHome(side);
  // Faces back down the pitch, toward the incoming play.
  return body(home.x, home.z, side === 1 ? -Math.PI / 2 : Math.PI / 2);
};

const initialBall = (): BallState => ({
  position: { x: 0, y: BALL_RADIUS, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
  spin: 0,
});

type GameState = {
  /**
   * Simulation bodies. These are written every frame from useFrame, so read
   * them with `useGameStore.getState()` inside the loop rather than
   * subscribing — subscribing would re-render React 60x a second.
   */
  ball: BallState;
  input: MovementInput;
  cameraMode: CameraMode;

  /** Home side: 10 outfield players (formation order: DEF, MID, FWD) + GK. */
  homeOutfield: Kinematics[];
  homeGK: Kinematics;
  homeGKState: KeeperState;
  /** Index into homeOutfield the local human (or, in a networked match, the host) controls. */
  controlledIndex: number;

  /** Away side. AI-controlled unless a guest is connected in a networked match. */
  awayOutfield: Kinematics[];
  awayGK: Kinematics;
  awayGKState: KeeperState;
  /** Index into awayOutfield the guest controls, or null when it's fully AI. */
  awayControlledIndex: number | null;

  /**
   * Strike state, one per controllable side. `charge` keeps a stable
   * reference while idle so the power bar only re-renders during an actual
   * charge.
   */
  charge: ChargeState;
  strikeCooldown: number;
  awayCharge: ChargeState;
  awayStrikeCooldown: number;

  /** --- match state (HUD-facing, updated at most a few times a second) --- */
  score: Score;
  /** seconds elapsed in the current period */
  matchTime: number;
  /** 1-based period index */
  period: number;
  matchStatus: MatchStatus;
  /** seconds remaining before the current non-playing status */
  statusTimer: number;
  /** who scored the goal currently being celebrated */
  lastScorer: TeamSide | null;
  /** which team last made contact with the ball — decides throw-in/corner/goal-kick awards */
  lastTouch: TeamSide;
  /** the dead-ball restart currently being taken, if any */
  restart: Restart | null;

  /** --- club selection, set from the menu before kickoff --- */
  homeClubId: string;
  awayClubId: string;

  /** --- Play-vs-Friend networking --- */
  netRole: NetRole;
  roomCode: string | null;
  roomId: string | null;

  setInput: (i: MovementInput) => void;
  setCameraMode: (m: CameraMode) => void;
  setControlledIndex: (i: number) => void;

  setMatchStatus: (status: MatchStatus, statusTimer?: number) => void;
  setMatchTime: (matchTime: number) => void;
  recordGoal: (scorer: TeamSide) => void;
  /** Sets which clubs are playing. Call before kickoff, from the menu. */
  setClubs: (homeClubId: string, awayClubId: string) => void;
  /** Sets the networking role and room identity for a Play-vs-Friend match. Call before kickoff. */
  setNetRoom: (role: NetRole, roomCode: string | null, roomId: string | null) => void;
  /** Puts bodies back to kickoff shape without touching score or clock. */
  resetPositions: () => void;
  resetMatch: () => void;
};

/** Builds fresh kickoff bodies for both full XIs, given the two clubs playing. */
const kickoffBodies = (homeClubId: string, awayClubId: string, networked: boolean) => {
  const homeClub = getClub(homeClubId);
  const awayClub = getClub(awayClubId);

  const homeXI = buildOutfield(homeClub, HOME_DEFEND_SIDE);
  const awayXI = buildOutfield(awayClub, AWAY_DEFEND_SIDE);

  return {
    ball: initialBall(),
    homeOutfield: homeXI.map((e) => e.body),
    homeGK: initialGK(HOME_DEFEND_SIDE),
    homeGKState: initialKeeperState(),
    controlledIndex: defaultControlledIndex(homeXI),
    awayOutfield: awayXI.map((e) => e.body),
    awayGK: initialGK(AWAY_DEFEND_SIDE),
    awayGKState: initialKeeperState(),
    awayControlledIndex: networked ? defaultControlledIndex(awayXI) : null,
    charge: IDLE_CHARGE,
    strikeCooldown: 0,
    awayCharge: IDLE_CHARGE,
    awayStrikeCooldown: 0,
    restart: null,
  };
};

export const useGameStore = create<GameState>((set, get) => ({
  ...kickoffBodies(DEFAULT_HOME_CLUB_ID, DEFAULT_AWAY_CLUB_ID, false),
  input: { x: 0, z: 0, sprint: false },
  cameraMode: "broadcast",

  score: { home: 0, away: 0 },
  matchTime: 0,
  period: 1,
  matchStatus: "kickoff",
  statusTimer: MATCH_TUNING.kickoffPause,
  lastScorer: null,
  lastTouch: "home",

  homeClubId: DEFAULT_HOME_CLUB_ID,
  awayClubId: DEFAULT_AWAY_CLUB_ID,

  netRole: "local",
  roomCode: null,
  roomId: null,

  setInput: (input) => set({ input }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setControlledIndex: (controlledIndex) => set({ controlledIndex }),

  setMatchStatus: (matchStatus, statusTimer = 0) => set({ matchStatus, statusTimer }),
  setMatchTime: (matchTime) => set({ matchTime }),
  recordGoal: (scorer) =>
    set((s) => ({
      score: { ...s.score, [scorer]: s.score[scorer] + 1 },
      matchStatus: "goal",
      statusTimer: MATCH_TUNING.goalCelebration,
      lastScorer: scorer,
    })),
  setClubs: (homeClubId, awayClubId) => set({ homeClubId, awayClubId }),
  setNetRoom: (netRole, roomCode, roomId) => set({ netRole, roomCode, roomId }),
  resetPositions: () =>
    set(kickoffBodies(get().homeClubId, get().awayClubId, get().netRole !== "local")),
  resetMatch: () =>
    set({
      ...kickoffBodies(get().homeClubId, get().awayClubId, get().netRole !== "local"),
      score: { home: 0, away: 0 },
      matchTime: 0,
      period: 1,
      matchStatus: "kickoff",
      statusTimer: MATCH_TUNING.kickoffPause,
      lastScorer: null,
      lastTouch: "home",
    }),
}));
