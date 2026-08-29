import { useEffect, useRef } from "react";
import type { PlayerInput } from "../game/types";

/**
 * Single local player scheme (single-player vs AI, and the host/guest sides
 * of an online match) — WASD and arrow keys both work, matching the
 * original single-keyboard controls.
 */
export const SOLO_KEYS: Record<string, string> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  Space: "shoot",
  KeyE: "pass",
  ControlLeft: "loft",
  ControlRight: "loft",
  KeyC: "cameraToggle",
  KeyQ: "switchPlayer",
  KeyF: "tackle",
};

/**
 * Local 2P, player 1 — WASD only (arrows are reserved for player 2 on the
 * same keyboard).
 */
export const LOCAL_P1_KEYS: Record<string, string> = {
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  ShiftLeft: "sprint",
  Space: "shoot",
  KeyE: "pass",
  ControlLeft: "loft",
  KeyC: "cameraToggle",
  KeyQ: "switchPlayer",
  KeyF: "tackle",
};

/**
 * Local 2P, player 2 — arrow cluster plus the punctuation keys immediately
 * around it, so it never overlaps player 1's keys on the same physical
 * keyboard. No camera-toggle binding: with two people sharing one screen,
 * the run-camera (which follows only one player) isn't useful for both, so
 * local 2P always stays on the shared broadcast camera, controlled by P1.
 */
export const LOCAL_P2_KEYS: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ShiftRight: "sprint",
  Enter: "shoot",
  NumpadEnter: "shoot",
  Quote: "pass",
  Slash: "loft",
  Period: "tackle",
  Semicolon: "switchPlayer",
};

const IDLE_INPUT: PlayerInput = {
  x: 0,
  z: 0,
  sprint: false,
  shoot: false,
  pass: false,
  loft: false,
  cameraToggle: false,
  switchPlayer: false,
  tackle: false,
};

/**
 * Returns a ref holding the current movement + action input for one key
 * scheme. A ref (not state) so holding a key doesn't re-render every frame.
 * Mount two of these with different schemes (LOCAL_P1_KEYS / LOCAL_P2_KEYS)
 * to run two independent input streams off the same keyboard for local 2P —
 * each only reacts to its own key codes, so they never interfere.
 */
export function useKeyboardInput(keys: Record<string, string> = SOLO_KEYS) {
  const input = useRef<PlayerInput>({ ...IDLE_INPUT });
  const held = useRef<Set<string>>(new Set());
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    const apply = () => {
      const h = held.current;
      let x = (h.has("right") ? 1 : 0) - (h.has("left") ? 1 : 0);
      let z = (h.has("down") ? 1 : 0) - (h.has("up") ? 1 : 0);
      const mag = Math.hypot(x, z);
      if (mag > 1) {
        x /= mag;
        z /= mag;
      }
      input.current = {
        x,
        z,
        sprint: h.has("sprint"),
        shoot: h.has("shoot"),
        pass: h.has("pass"),
        loft: h.has("loft"),
        cameraToggle: h.has("cameraToggle"),
        switchPlayer: h.has("switchPlayer"),
        tackle: h.has("tackle"),
      };
    };

    const down = (e: KeyboardEvent) => {
      const action = keysRef.current[e.code];
      if (!action) return;
      // Space would scroll the page, Ctrl combos are browser shortcuts.
      e.preventDefault();
      held.current.add(action);
      apply();
    };
    const up = (e: KeyboardEvent) => {
      const action = keysRef.current[e.code];
      if (!action) return;
      held.current.delete(action);
      apply();
    };
    const blur = () => {
      held.current.clear();
      apply();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return input;
}
