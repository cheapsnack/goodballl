import { create } from "zustand";
import type { BallState, ChargeState, Kinematics, MovementInput } from "../types";
import { BALL_RADIUS } from "../logic/ballPhysics";
import { IDLE_CHARGE } from "../logic/striking";
import type { CameraMode } from "../logic/camera";
import { FIELD } from "../logic/field";
import { initialKeeperState, keeperHome, type KeeperState } from "../logic/ai/goalkeeper";
import { buildOutfield, defaultControlledIndex } from "../logic/ai/outfield";
import { DEFAULT_DIFFICULTY, type Difficulty } from "../logic/ai/difficulty";
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
 *  - "local": single-player vs AI, this browser runs the whole match.
 *  - "local2p": two people, one keyboard, same browser tab — still one
 *    simulation, just two local input streams instead of one.
 *  - "host": a Play-vs-Friend match this browser is authoritative for —
 *    it runs the full simulation and broadcasts state to the guest.
 *  - "guest": a Play-vs-Friend match this browser only renders — it sends
 *    its input to the host and applies whatever state the host broadcasts.
 */
export type NetRole = "local" | "local2p" | "host" | "guest";

/** Whether this role's away side is human-controlled locally (no network). */
const AWAY_HUMAN_ROLES: NetRole[] = ["local2p", "host"];

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

  /** Away side. AI-controlled unless a second human is playing it (local 2P or an online guest). */
  awayOutfield: Kinematics[];
  awayGK: Kinematics;
  awayGKState: KeeperState;
  /** Index into awayOutfield the second player controls, or null when it's fully AI. */
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
  /**
   * While set, only this team may touch the ball — cleared on their first
   * legal touch. Set whenever a restart goes live so the side awarded the
   * throw-in/corner/goal-kick actually gets to start the play, instead of
   * whoever's AI happens to be standing closest.
   */
  restartLock: TeamSide | null;

  /** --- club selection, set from the menu before kickoff --- */
  homeClubId: string;
  awayClubId: string;
  /** AI difficulty — applies to every AI-controlled player, on both sides. */
  difficulty: Difficulty;

  /** --- Play-vs-Friend networking (and local2p, which reuses the same away-side plumbing) --- */
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
  setDifficulty: (difficulty: Difficulty) => void;
  /** Sets the networking role and room identity for a Play-vs-Friend match. Call before kickoff. */
  setNetRoom: (role: NetRole, roomCode: string | null, roomId: string | null) => void;
  /** Puts bodies back to kickoff shape without touching score or clock. */
  resetPositions: () => void;
  resetMatch: () => void;
};

/** Builds fresh kickoff bodies for both full XIs, given the two clubs playing. */
const kickoffBodies = (homeClubId: string, awayClubId: string, awayHuman: boolean) => {
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
    awayControlledIndex: awayHuman ? defaultControlledIndex(awayXI) : null,
    charge: IDLE_CHARGE,
    strikeCooldown: 0,
    awayCharge: IDLE_CHARGE,
    awayStrikeCooldown: 0,
    restart: null,
    restartLock: null,
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
  difficulty: DEFAULT_DIFFICULTY,

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
  setDifficulty: (difficulty) => set({ difficulty }),
  setNetRoom: (netRole, roomCode, roomId) => set({ netRole, roomCode, roomId }),
  resetPositions: () =>
    set(kickoffBodies(get().homeClubId, get().awayClubId, AWAY_HUMAN_ROLES.includes(get().netRole))),
  resetMatch: () =>
    set({
      ...kickoffBodies(get().homeClubId, get().awayClubId, AWAY_HUMAN_ROLES.includes(get().netRole)),
      score: { home: 0, away: 0 },
      matchTime: 0,
      period: 1,
      matchStatus: "kickoff",
      statusTimer: MATCH_TUNING.kickoffPause,
      lastScorer: null,
      lastTouch: "home",
    }),
}));
