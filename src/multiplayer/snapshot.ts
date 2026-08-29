import type { Kinematics, BallState } from "../game/types";
import type { KeeperState } from "../game/logic/ai/goalkeeper";
import type { MatchStatus, Score, TeamSide } from "../game/logic/match";
import type { MatchSnapshot } from "./types";

type FrameForSnapshot = {
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

const bodySnap = (k: Kinematics) => ({ x: k.position.x, z: k.position.z, heading: k.heading });
const gkSnap = (k: Kinematics, s: KeeperState) => ({ ...bodySnap(k), phase: s.phase, diveDir: s.diveDir });

/** Host-side: compresses the current frame down to what the guest needs to render. */
export function buildSnapshot(f: FrameForSnapshot): MatchSnapshot {
  return {
    homeOutfield: f.homeOutfield.map(bodySnap),
    homeGK: gkSnap(f.homeGK, f.homeGKState),
    awayOutfield: f.awayOutfield.map(bodySnap),
    awayGK: gkSnap(f.awayGK, f.awayGKState),
    ball: {
      x: f.ball.position.x,
      y: f.ball.position.y,
      z: f.ball.position.z,
      vx: f.ball.velocity.x,
      vz: f.ball.velocity.z,
    },
    controlledIndex: f.controlledIndex,
    awayControlledIndex: f.awayControlledIndex,
    score: f.score,
    matchTime: f.matchTime,
    period: f.period,
    matchStatus: f.matchStatus,
    statusTimer: f.statusTimer,
    lastScorer: f.lastScorer,
  };
}

const bodyFromSnap = (b: { x: number; z: number; heading: number }): Kinematics => ({
  position: { x: b.x, y: 0, z: b.z },
  velocity: { x: 0, y: 0, z: 0 },
  heading: b.heading,
});

const keeperStateFromSnap = (g: { phase: string; diveDir: -1 | 0 | 1 }): KeeperState => ({
  phase: g.phase as KeeperState["phase"],
  timer: 0,
  diveDir: g.diveDir,
});

/** Guest-side: expands a received snapshot back into store-shaped fields. */
export function applySnapshot(snapshot: MatchSnapshot) {
  return {
    homeOutfield: snapshot.homeOutfield.map(bodyFromSnap),
    homeGK: bodyFromSnap(snapshot.homeGK),
    homeGKState: keeperStateFromSnap(snapshot.homeGK),
    awayOutfield: snapshot.awayOutfield.map(bodyFromSnap),
    awayGK: bodyFromSnap(snapshot.awayGK),
    awayGKState: keeperStateFromSnap(snapshot.awayGK),
    ball: {
      position: { x: snapshot.ball.x, y: snapshot.ball.y, z: snapshot.ball.z },
      velocity: { x: snapshot.ball.vx, y: 0, z: snapshot.ball.vz },
      heading: 0,
      spin: 0,
    } as BallState,
    controlledIndex: snapshot.controlledIndex,
    awayControlledIndex: snapshot.awayControlledIndex,
    score: snapshot.score,
    matchTime: snapshot.matchTime,
    period: snapshot.period,
    matchStatus: snapshot.matchStatus as MatchStatus,
    statusTimer: snapshot.statusTimer,
    lastScorer: snapshot.lastScorer,
  };
}
