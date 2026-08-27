import type { BallState, Kinematics, MovementInput } from "../../types";
import { BALL_RADIUS } from "../ballPhysics";
import { FIELD, goalLineX } from "../field";

/**
 * Goalkeeper feel. Every number the keeper uses lives here — nothing in the
 * state machine below hardcodes a distance, a speed, or a duration.
 */
export const KEEPER_TUNING = {
  /** how far in front of the goal line the keeper stands at rest */
  restOffset: 0.7,
  /** furthest the keeper will advance off the line when the ball is close */
  maxAdvance: 4.2,
  /** ball must be within this x-distance of the goal before the keeper advances */
  engageRange: 30,
  /** lateral shuffle is capped just outside the posts */
  maxLateral: FIELD.goalHalfWidth + 1.1,
  /** blend between the ball's current z and its predicted crossing z */
  predictionWeight: 0.75,
  /** dead zone (m) before the keeper bothers shuffling */
  positionDeadZone: 0.35,

  /** a shot must arrive within this many seconds to trigger a dive */
  diveLeadTime: 0.75,
  /** ...and be at least this far from the keeper laterally */
  diveMinOffset: 0.75,
  /** ...and be heading goalwards at least this fast */
  diveMinSpeed: 7,
  /** lateral dive speed, m/s */
  diveSpeed: 11,
  diveDuration: 0.45,
  recoverDuration: 0.6,
  /** small forward component so the dive closes the angle too */
  diveForwardRatio: 0.25,

  /** ball inside this radius of the keeper is caught/parried */
  saveRadius: 1.35,
  /** extra reach while airborne mid-dive */
  diveSaveBonus: 0.85,
  /** keeper can't claim a ball above this height */
  maxReachHeight: 2.3,
  /** speed the ball is punched away at on a parry */
  parrySpeed: 13,
  /** seconds the keeper is beaten for after making a save */
  saveRecovery: 0.8,
} as const;

export type KeeperPhase = "idle" | "tracking" | "diving" | "recovering";

export type KeeperState = {
  phase: KeeperPhase;
  /** seconds remaining in the current timed phase (diving/recovering) */
  timer: number;
  /** -1 dives toward -z, +1 toward +z, 0 when not diving */
  diveDir: -1 | 0 | 1;
};

export const initialKeeperState = (): KeeperState => ({
  phase: "idle",
  timer: 0,
  diveDir: 0,
});

/** Keeper's resting spot: on the line, mirroring the ball's angle. */
export function keeperHome(side: 1 | -1): { x: number; z: number } {
  return { x: goalLineX(side) - side * KEEPER_TUNING.restOffset, z: 0 };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Where the ball will cross the goal line, and how long until it does.
 * Returns null when the ball isn't travelling toward this goal.
 */
export function predictCrossing(
  ball: BallState,
  side: 1 | -1,
): { z: number; y: number; time: number } | null {
  const lineX = goalLineX(side);
  const vx = ball.velocity.x;
  // Moving toward the goal means closing the gap in x.
  const toGoal = (lineX - ball.position.x) * side > 0;
  if (!toGoal || Math.abs(vx) < 1e-3) return null;

  const time = (lineX - ball.position.x) / vx;
  if (time <= 0 || time > 4) return null;

  return {
    z: ball.position.z + ball.velocity.z * time,
    // Rough ballistic height; good enough to reject balls sailing over.
    y: ball.position.y + ball.velocity.y * time - 10.5 * time * time,
    time,
  };
}

export type KeeperDecision = {
  state: KeeperState;
  /** feeds straight into stepMovement, exactly like the human player's input */
  input: MovementInput;
  /** when set, the scene drives the keeper directly instead of via stepMovement */
  diveVelocity: { x: number; z: number } | null;
};

/**
 * Reactive keeper state machine. Pure: takes state, returns the next state
 * plus a MovementInput, so the keeper moves through the same stepMovement
 * physics as every other player.
 *
 *   idle -> tracking  (ball enters engage range)
 *   tracking -> diving (a shot is on target and out of shuffling reach)
 *   diving -> recovering -> tracking
 */
export function stepGoalkeeper(
  keeper: Kinematics,
  state: KeeperState,
  ball: BallState,
  side: 1 | -1,
  dt: number,
): KeeperDecision {
  const t = KEEPER_TUNING;
  const lineX = goalLineX(side);
  const timer = Math.max(0, state.timer - dt);

  // --- timed phases run to completion before anything else is considered ---
  if (state.phase === "diving") {
    if (timer > 0) {
      return {
        state: { ...state, timer },
        input: { x: 0, z: 0, sprint: false },
        diveVelocity: {
          x: -side * t.diveSpeed * t.diveForwardRatio,
          z: state.diveDir * t.diveSpeed,
        },
      };
    }
    return {
      state: { phase: "recovering", timer: t.recoverDuration, diveDir: 0 },
      input: { x: 0, z: 0, sprint: false },
      diveVelocity: null,
    };
  }

  if (state.phase === "recovering") {
    if (timer > 0) {
      return {
        state: { ...state, timer },
        input: { x: 0, z: 0, sprint: false },
        diveVelocity: null,
      };
    }
    return stepGoalkeeper(keeper, { phase: "tracking", timer: 0, diveDir: 0 }, ball, side, dt);
  }

  // --- should we dive? ---
  const cross = predictCrossing(ball, side);
  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  if (
    cross &&
    cross.time <= t.diveLeadTime &&
    ballSpeed >= t.diveMinSpeed &&
    Math.abs(cross.z) <= t.maxLateral &&
    cross.y <= t.maxReachHeight &&
    Math.abs(cross.z - keeper.position.z) > t.diveMinOffset
  ) {
    const dir: -1 | 1 = cross.z > keeper.position.z ? 1 : -1;
    return {
      state: { phase: "diving", timer: t.diveDuration, diveDir: dir },
      input: { x: 0, z: 0, sprint: false },
      diveVelocity: {
        x: -side * t.diveSpeed * t.diveForwardRatio,
        z: dir * t.diveSpeed,
      },
    };
  }

  // --- positioning ---
  const distToGoal = Math.abs(lineX - ball.position.x);
  const engaged = distToGoal < t.engageRange;
  const phase: KeeperPhase = engaged ? "tracking" : "idle";

  // Narrow the angle: the closer the ball, the further off the line.
  const closeness = clamp(1 - distToGoal / t.engageRange, 0, 1);
  const targetX = lineX - side * (t.restOffset + t.maxAdvance * closeness * closeness);

  // Track the ball, weighted toward where a moving ball is actually going.
  const trackZ = cross ? ball.position.z + (cross.z - ball.position.z) * t.predictionWeight : ball.position.z;
  // Shade toward the near post rather than mirroring the ball 1:1.
  const targetZ = clamp(trackZ * 0.85, -t.maxLateral, t.maxLateral);

  const dx = targetX - keeper.position.x;
  const dz = targetZ - keeper.position.z;
  const dist = Math.hypot(dx, dz);

  if (dist < t.positionDeadZone) {
    return {
      state: { phase, timer: 0, diveDir: 0 },
      input: { x: 0, z: 0, sprint: false },
      diveVelocity: null,
    };
  }

  // Ease off near the target so the keeper settles instead of oscillating.
  const gain = clamp(dist / 1.5, 0.35, 1);
  return {
    state: { phase, timer: 0, diveDir: 0 },
    input: {
      x: (dx / dist) * gain,
      z: (dz / dist) * gain,
      sprint: engaged && dist > 3,
    },
    diveVelocity: null,
  };
}

/**
 * Claim/parry check. Returns the deflected ball when the keeper gets a hand
 * to it, or null when the shot beats them. Pure.
 */
export function tryKeeperSave(
  ball: BallState,
  keeper: Kinematics,
  state: KeeperState,
  side: 1 | -1,
): BallState | null {
  if (state.phase === "recovering") return null;
  if (ball.position.y > KEEPER_TUNING.maxReachHeight) return null;

  const reach =
    KEEPER_TUNING.saveRadius + (state.phase === "diving" ? KEEPER_TUNING.diveSaveBonus : 0);
  const dx = ball.position.x - keeper.position.x;
  const dz = ball.position.z - keeper.position.z;
  if (Math.hypot(dx, dz) > reach) return null;

  // Only claim balls actually coming at the goal, so the keeper doesn't
  // vacuum up a ball that's already rolling harmlessly away.
  const towardGoal = ball.velocity.x * side > 0;
  if (!towardGoal) return null;

  // Parry out and away from goal, to whichever side the ball arrived on.
  const outZ = dz === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dz);
  const nx = -side * 0.72;
  const nz = outZ * 0.7;

  return {
    ...ball,
    position: { ...ball.position, y: Math.max(ball.position.y, BALL_RADIUS) },
    velocity: {
      x: nx * KEEPER_TUNING.parrySpeed,
      y: 2.4,
      z: nz * KEEPER_TUNING.parrySpeed,
    },
  };
}
