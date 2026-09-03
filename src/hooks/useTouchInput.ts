import { useEffect, useRef, useCallback } from "react";
import type { PlayerInput } from "../game/types";

/**
 * All the touch state needed to produce a PlayerInput each frame.
 * Written imperatively (ref, not state) so the joystick's 60fps drag
 * events don't cause React re-renders.
 */
export type TouchState = {
  /** Joystick: normalised -1..1 on each axis. */
  jx: number;
  jz: number;
  /** True when the joystick is pressed further than the sprint threshold. */
  sprint: boolean;
  /** Action buttons — set true on touchstart, false on touchend. */
  shoot: boolean;
  pass: boolean;
  tackle: boolean;
  switchPlayer: boolean;
  loft: boolean;
};

const IDLE: TouchState = {
  jx: 0, jz: 0, sprint: false,
  shoot: false, pass: false, tackle: false, switchPlayer: false, loft: false,
};

/**
 * Fraction of joystick radius that counts as a sprint (outer 35%).
 * Matches FIFA Mobile's "wide flick = sprint" feel.
 */
const SPRINT_THRESHOLD = 0.65;

/**
 * Tracks one touch point forming a virtual joystick. Accepts the
 * touch identifier so multi-touch doesn't confuse joystick with buttons.
 */
type JoystickTrack = { id: number; cx: number; cy: number; radius: number } | null;

export function useTouchInput() {
  const stateRef = useRef<TouchState>({ ...IDLE });
  const joystick = useRef<JoystickTrack>(null);

  const getInput = useCallback((): PlayerInput => {
    const s = stateRef.current;
    return {
      x: s.jx,
      z: s.jz,
      sprint: s.sprint,
      shoot: s.shoot,
      pass: s.pass,
      loft: s.loft,
      cameraToggle: false,
      switchPlayer: s.switchPlayer,
      tackle: s.tackle,
    };
  }, []);

  useEffect(() => {
    // Nothing to attach on the server.
    if (typeof window === "undefined") return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      Array.from(e.changedTouches).forEach((t) => {
        // Left half of screen → joystick
        if (t.clientX < window.innerWidth / 2) {
          joystick.current = {
            id: t.identifier,
            cx: t.clientX,
            cy: t.clientY,
            radius: Math.min(window.innerWidth, window.innerHeight) * 0.13,
          };
          stateRef.current.jx = 0;
          stateRef.current.jz = 0;
          stateRef.current.sprint = false;
        }
        // Right half → check which button region (handled by MobileControls
        // component directly via pointer events; this hook just reads the ref
        // that MobileControls writes).
      });
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const j = joystick.current;
      if (!j) return;
      Array.from(e.changedTouches).forEach((t) => {
        if (t.identifier !== j.id) return;
        const dx = (t.clientX - j.cx) / j.radius;
        const dz = (t.clientY - j.cy) / j.radius;
        const mag = Math.hypot(dx, dz);
        const norm = Math.min(1, mag);
        const nx = mag > 0 ? (dx / mag) * norm : 0;
        const nz = mag > 0 ? (dz / mag) * norm : 0;
        stateRef.current.jx = nx;
        stateRef.current.jz = nz;
        stateRef.current.sprint = mag > SPRINT_THRESHOLD;
      });
    };

    const onEnd = (e: TouchEvent) => {
      const j = joystick.current;
      if (!j) return;
      Array.from(e.changedTouches).forEach((t) => {
        if (t.identifier !== j.id) return;
        joystick.current = null;
        stateRef.current.jx = 0;
        stateRef.current.jz = 0;
        stateRef.current.sprint = false;
      });
    };

    window.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: false });
    window.addEventListener("touchcancel", onEnd, { passive: false });

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return { stateRef, getInput };
}
