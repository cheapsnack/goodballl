import type { Vec3 } from "../types";

export type CameraMode = "broadcast" | "run";

export const CAMERA_TUNING = {
  broadcast: {
    /** height above the pitch */
    height: 33,
    /** distance back from the target along +z */
    distance: 38,
    /** how far the cam drifts horizontally with play (0..1 of target x) */
    trackX: 0.55,
    /** clamp on horizontal drift so the cam stays broadcast-ish */
    maxTrackX: 26,
    /** exponential smoothing coefficient (higher = snappier) */
    smooth: 2.4,
    lookAhead: 0.35,
    fov: 45,
  },
} as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent smoothing factor. */
export function smoothing(coeff: number, dt: number): number {
  return 1 - Math.exp(-coeff * dt);
}

export type CameraFrame = { position: Vec3; lookAt: Vec3 };

/**
 * Broadcast camera: elevated, behind one goal-line side, drifting with play.
 * Pure — returns the new smoothed frame given the previous one.
 */
export function stepBroadcastCamera(
  current: CameraFrame,
  target: Vec3,
  targetVelocity: Vec3,
  dt: number,
): CameraFrame {
  const t = CAMERA_TUNING.broadcast;
  const lead = t.lookAhead;

  const focusX = target.x + targetVelocity.x * lead;
  const focusZ = target.z + targetVelocity.z * lead;

  const desiredX = Math.max(-t.maxTrackX, Math.min(t.maxTrackX, focusX * t.trackX));
  const desiredZ = focusZ * 0.25 + t.distance;

  const s = smoothing(t.smooth, dt);

  return {
    position: {
      x: lerp(current.position.x, desiredX, s),
      y: lerp(current.position.y, t.height, s),
      z: lerp(current.position.z, desiredZ, s),
    },
    lookAt: {
      x: lerp(current.lookAt.x, focusX * 0.85, s),
      y: 0,
      z: lerp(current.lookAt.z, focusZ * 0.8, s),
    },
  };
}
