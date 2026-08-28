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
  run: {
    /** height above the player */
    height: 4.2,
    /** distance behind the player, opposite their heading */
    distance: 6.5,
    /** how far above the player the camera looks */
    lookHeight: 0.9,
    /** exponential smoothing coefficient (higher = snappier) */
    smooth: 6,
    fov: 62,
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

/**
 * Run camera: close behind-player chase cam. Much more precise for aiming
 * shots/passes since the player fills more of the frame and the camera
 * always faces the way they're facing — trades overview for control.
 */
export function stepRunCamera(
  current: CameraFrame,
  playerPos: Vec3,
  heading: number,
  dt: number,
): CameraFrame {
  const t = CAMERA_TUNING.run;
  const s = smoothing(t.smooth, dt);

  // Behind the player, opposite their facing direction.
  const behindX = playerPos.x - Math.sin(heading) * t.distance;
  const behindZ = playerPos.z + Math.cos(heading) * t.distance;

  return {
    position: {
      x: lerp(current.position.x, behindX, s),
      y: lerp(current.position.y, t.height, s),
      z: lerp(current.position.z, behindZ, s),
    },
    lookAt: {
      x: lerp(current.lookAt.x, playerPos.x + Math.sin(heading) * 4, s),
      y: lerp(current.lookAt.y, t.lookHeight, s),
      z: lerp(current.lookAt.z, playerPos.z - Math.cos(heading) * 4, s),
    },
  };
}
