import type { BallState, Kinematics } from "../game/types";
import type { StateSnapshot } from "./types";

/** Rounds to millimetre precision — plenty for rendering, far smaller on the wire. */
const r = (v: number) => Math.round(v * 1000) / 1000;

const packBody = (b: Kinematics): Kinematics => ({
  position: { x: r(b.position.x), y: r(b.position.y), z: r(b.position.z) },
  velocity: { x: r(b.velocity.x), y: r(b.velocity.y), z: r(b.velocity.z) },
  heading: r(b.heading),
});

const packBall = (b: BallState): BallState => ({ ...packBody(b), spin: r(b.spin) });

/**
 * Serializes one authoritative frame for the wire. Everything is copied so a
 * later mutation of the host's live store can't retro-change a queued packet.
 */
export function buildSnapshot(s: StateSnapshot): StateSnapshot {
  return {
    homeOutfield: s.homeOutfield.map(packBody),
    homeGK: packBody(s.homeGK),
    homeGKState: { ...s.homeGKState },
    awayOutfield: s.awayOutfield.map(packBody),
    awayGK: packBody(s.awayGK),
    awayGKState: { ...s.awayGKState },
    ball: packBall(s.ball),
    controlledIndex: s.controlledIndex,
    awayControlledIndex: s.awayControlledIndex,
    score: { ...s.score },
    matchTime: s.matchTime,
    period: s.period,
    matchStatus: s.matchStatus,
    statusTimer: s.statusTimer,
    lastScorer: s.lastScorer,
  };
}

/** Turns a received snapshot into a store patch the guest can apply verbatim. */
export function applySnapshot(s: StateSnapshot): StateSnapshot {
  return s;
}
