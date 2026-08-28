/**
 * Pitch geometry shared by rendering and logic.
 *
 * Regulation dimensions, in metres. The pitch is centred on the origin:
 * x runs goal-to-goal (-halfLength .. +halfLength), z runs touchline-to-
 * touchline. The human player attacks the +x goal.
 */
export const FIELD = {
  length: 105,
  width: 68,
  halfLength: 52.5,
  halfWidth: 34,

  goalWidth: 7.32,
  goalHalfWidth: 3.66,
  goalHeight: 2.44,
  goalDepth: 2,
  postRadius: 0.09,

  /** how far the penalty area extends from the goal line */
  penaltyDepth: 16.5,
  penaltyHalfWidth: 20.16,
} as const;

/** x of the goal line for a given side (1 = +x goal, -1 = -x goal). */
export const goalLineX = (side: 1 | -1) => side * FIELD.halfLength;

/** Corner-arc spot nearest a given (side, z-sign) corner. */
export function cornerSpot(xSide: 1 | -1, zSide: 1 | -1): { x: number; z: number } {
  return {
    x: xSide * (FIELD.halfLength - 0.6),
    z: zSide * (FIELD.halfWidth - 0.6),
  };
}

/** Goal-kick spot: edge of the six-yard box, on the side the ball went out. */
export function goalKickSpot(side: 1 | -1, zSign: 1 | -1): { x: number; z: number } {
  const sixYardHalfWidth = FIELD.goalHalfWidth + 5.5;
  return {
    x: side * (FIELD.halfLength - 5.5),
    z: zSign * Math.min(sixYardHalfWidth, FIELD.halfWidth - 1),
  };
}

/** Throw-in spot: on the touchline, at the z where the ball crossed it. */
export function throwInSpot(x: number, zSide: 1 | -1): { x: number; z: number } {
  return {
    x: Math.max(-FIELD.halfLength + 1, Math.min(FIELD.halfLength - 1, x)),
    z: zSide * (FIELD.halfWidth - 0.3),
  };
}
