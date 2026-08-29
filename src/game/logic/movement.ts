import type { Attributes, Kinematics, MovementInput } from "../types";

/**
 * Arcade movement tuning. These five numbers are ~all of the "feel".
 * Nothing else in the codebase should hardcode movement constants.
 */
export type MovementParams = {
  /** m/s^2 while input is held */
  accel: number;
  /** m/s cap while walking/jogging */
  maxSpeed: number;
  /** multiplier applied to maxSpeed & accel while sprinting */
  sprintMult: number;
  /** exponential damping coefficient applied to velocity every second */
  friction: number;
  /** radians/sec the player can rotate their heading */
  turnRate: number;
};

/** Global feel knobs — tweak these first when movement feels wrong. */
export const MOVEMENT_TUNING = {
  baseAccel: 22,
  paceAccelRange: 14,
  baseSpeed: 7.6,
  paceSpeedRange: 5.4,
  sprintMult: 1.42,
  friction: 5.2,
  baseTurnRate: 5.0,
  dribbleTurnRange: 5.0,
} as const;

const norm = (v: number) => Math.max(0, Math.min(1, v / 99));

export function paramsFromAttributes(
  attributes: Pick<Attributes, "pace" | "dribble">,
): MovementParams {
  const pace = norm(attributes.pace);
  const dribble = norm(attributes.dribble);
  const t = MOVEMENT_TUNING;

  return {
    accel: t.baseAccel + pace * t.paceAccelRange,
    maxSpeed: t.baseSpeed + pace * t.paceSpeedRange,
    sprintMult: t.sprintMult,
    friction: t.friction,
    turnRate: t.baseTurnRate + dribble * t.dribbleTurnRange,
  };
}

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Advances one player's kinematics by dt seconds.
 * Pure: returns a new object, never mutates the input.
 *
 * Feel notes:
 *  - The player accelerates along their *heading*, not straight along input,
 *    so hard direction changes cost time (the "weight" in the brief).
 *  - Damping is frame-rate independent: v *= exp(-k * dt).
 */
export function stepMovement(
  state: Kinematics,
  input: MovementInput,
  params: MovementParams,
  dt: number,
): Kinematics {
  const mag = Math.hypot(input.x, input.z);
  const hasInput = mag > 0.05;

  let heading = state.heading;
  let vx = state.velocity.x;
  let vz = state.velocity.z;

  const speedMult = input.sprint ? params.sprintMult : 1;
  const maxSpeed = params.maxSpeed * speedMult;

  if (hasInput) {
    const target = Math.atan2(input.x / mag, -(input.z / mag));
    const delta = angleDelta(heading, target);

    // Slower turning at speed keeps sprinting from feeling like a mouse cursor.
    const speed = Math.hypot(vx, vz);
    const turnPenalty = 1 - 0.35 * Math.min(1, speed / Math.max(0.001, maxSpeed));
    const maxTurn = params.turnRate * turnPenalty * dt;
    heading += Math.max(-maxTurn, Math.min(maxTurn, delta));

    // Only drive forward once roughly pointing the right way.
    const alignment = Math.max(0, Math.cos(angleDelta(heading, target)));
    const accel = params.accel * speedMult * Math.min(1, mag) * alignment;
    vx += Math.sin(heading) * accel * dt;
    vz += -Math.cos(heading) * accel * dt;
  }

  // Friction: heavier when there's no input so the player settles quickly.
  const k = hasInput ? params.friction * 0.35 : params.friction;
  const damp = Math.exp(-k * dt);
  vx *= damp;
  vz *= damp;

  // Clamp to top speed.
  const speed = Math.hypot(vx, vz);
  if (speed > maxSpeed) {
    vx = (vx / speed) * maxSpeed;
    vz = (vz / speed) * maxSpeed;
  }
  if (speed < 0.02) {
    vx = 0;
    vz = 0;
  }

  return {
    position: {
      x: state.position.x + vx * dt,
      y: state.position.y,
      z: state.position.z + vz * dt,
    },
    velocity: { x: vx, y: 0, z: vz },
    heading,
  };
}

/** Keeps a body inside the pitch (plus a little run-off margin). */
export function clampToPitch(
  state: Kinematics,
  halfLength: number,
  halfWidth: number,
  margin = 2,
): Kinematics {
  const x = Math.max(-halfLength - margin, Math.min(halfLength + margin, state.position.x));
  const z = Math.max(-halfWidth - margin, Math.min(halfWidth + margin, state.position.z));
  const hitX = x !== state.position.x;
  const hitZ = z !== state.position.z;

  if (!hitX && !hitZ) return state;
  return {
    ...state,
    position: { ...state.position, x, z },
    velocity: {
      x: hitX ? 0 : state.velocity.x,
      y: state.velocity.y,
      z: hitZ ? 0 : state.velocity.z,
    },
  };
}
