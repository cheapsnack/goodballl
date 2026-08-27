import { create } from "zustand";
import type { BallState, ChargeState, Kinematics, MovementInput } from "../types";
import { BALL_RADIUS } from "../logic/ballPhysics";
import { IDLE_CHARGE } from "../logic/striking";
import type { CameraMode } from "../logic/camera";
import { FIELD } from "../logic/field";
import { initialKeeperState, keeperHome, type KeeperState } from "../logic/ai/goalkeeper";
import type { DefenderRole } from "../logic/ai/defender";
import { MATCH_TUNING, type MatchStatus, type Score, type TeamSide } from "../logic/match";

export const PITCH = {
  length: FIELD.length,
  width: FIELD.width,
  halfLength: FIELD.halfLength,
  halfWidth: FIELD.halfWidth,
} as const;

export const PLAYER_RADIUS = 0.55;

/** The human attacks the +x goal, so the AI defends that side. */
export const DEFENDING_SIDE = 1 as const;

export const DEFENDER_ROLES: DefenderRole[] = [
  { id: "def-left", side: DEFENDING_SIDE, laneZ: -8.5 },
  { id: "def-right", side: DEFENDING_SIDE, laneZ: 8.5 },
];

const body = (x: number, z: number, heading = 0): Kinematics => ({
  position: { x, y: 0, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading,
});

const initialPlayer = (): Kinematics => body(-3, 4);

const initialKeeper = (): Kinematics => {
  const home = keeperHome(DEFENDING_SIDE);
  // Faces back down the pitch, toward the incoming play.
  return body(home.x, home.z, -Math.PI / 2);
};

const initialDefenders = (): Kinematics[] =>
  DEFENDER_ROLES.map((r) => body(DEFENDING_SIDE * 18, r.laneZ, -Math.PI / 2));

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
  player: Kinematics;
  ball: BallState;
  input: MovementInput;
  cameraMode: CameraMode;

  /** AI opponents. */
  keeper: Kinematics;
  keeperState: KeeperState;
  defenders: Kinematics[];

  /**
   * Strike state. `charge` keeps a stable reference while idle so the power
   * bar only re-renders during an actual charge.
   */
  charge: ChargeState;
  /** seconds remaining before the player can re-capture the ball */
  strikeCooldown: number;

  /** --- match state (HUD-facing, updated at most a few times a second) --- */
  score: Score;
  /** seconds elapsed in the current period */
  matchTime: number;
  /** 1-based period index */
  period: number;
  matchStatus: MatchStatus;
  /** seconds remaining in the current non-playing status */
  statusTimer: number;
  /** who scored the goal currently being celebrated */
  lastScorer: TeamSide | null;

  setPlayer: (p: Kinematics) => void;
  setBall: (b: BallState) => void;
  setInput: (i: MovementInput) => void;
  setCameraMode: (m: CameraMode) => void;

  setMatchStatus: (status: MatchStatus, statusTimer?: number) => void;
  setMatchTime: (matchTime: number) => void;
  recordGoal: (scorer: TeamSide) => void;
  /** Puts bodies back to kickoff shape without touching score or clock. */
  resetPositions: () => void;
  resetMatch: () => void;
};

const kickoffBodies = () => ({
  player: initialPlayer(),
  ball: initialBall(),
  keeper: initialKeeper(),
  keeperState: initialKeeperState(),
  defenders: initialDefenders(),
  charge: IDLE_CHARGE,
  strikeCooldown: 0,
});

export const useGameStore = create<GameState>((set) => ({
  ...kickoffBodies(),
  input: { x: 0, z: 0, sprint: false },
  cameraMode: "broadcast",

  score: { home: 0, away: 0 },
  matchTime: 0,
  period: 1,
  matchStatus: "kickoff",
  statusTimer: MATCH_TUNING.kickoffPause,
  lastScorer: null,

  setPlayer: (player) => set({ player }),
  setBall: (ball) => set({ ball }),
  setInput: (input) => set({ input }),
  setCameraMode: (cameraMode) => set({ cameraMode }),

  setMatchStatus: (matchStatus, statusTimer = 0) => set({ matchStatus, statusTimer }),
  setMatchTime: (matchTime) => set({ matchTime }),
  recordGoal: (scorer) =>
    set((s) => ({
      score: { ...s.score, [scorer]: s.score[scorer] + 1 },
      matchStatus: "goal",
      statusTimer: MATCH_TUNING.goalCelebration,
      lastScorer: scorer,
    })),
  resetPositions: () => set(kickoffBodies()),
  resetMatch: () =>
    set({
      ...kickoffBodies(),
      score: { home: 0, away: 0 },
      matchTime: 0,
      period: 1,
      matchStatus: "kickoff",
      statusTimer: MATCH_TUNING.kickoffPause,
      lastScorer: null,
    }),
}));

