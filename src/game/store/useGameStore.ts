import { create } from "zustand";
import type { BallState, Kinematics, MovementInput } from "../types";
import { BALL_RADIUS } from "../logic/ballPhysics";
import type { CameraMode } from "../logic/camera";

export const PITCH = {
  length: 105,
  width: 68,
  halfLength: 52.5,
  halfWidth: 34,
} as const;

export const PLAYER_RADIUS = 0.55;

const initialPlayer = (): Kinematics => ({
  position: { x: -3, y: 0, z: 4 },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
});

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

  setPlayer: (p: Kinematics) => void;
  setBall: (b: BallState) => void;
  setInput: (i: MovementInput) => void;
  setCameraMode: (m: CameraMode) => void;
  resetMatch: () => void;
};

export const useGameStore = create<GameState>((set) => ({
  player: initialPlayer(),
  ball: initialBall(),
  input: { x: 0, z: 0, sprint: false },
  cameraMode: "broadcast",

  setPlayer: (player) => set({ player }),
  setBall: (ball) => set({ ball }),
  setInput: (input) => set({ input }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  resetMatch: () => set({ player: initialPlayer(), ball: initialBall() }),
}));
