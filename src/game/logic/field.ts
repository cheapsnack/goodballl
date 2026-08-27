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
