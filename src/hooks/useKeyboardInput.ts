import { useEffect, useRef } from "react";
import type { PlayerInput } from "../game/types";

const KEYS: Record<string, string> = {
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
 * Returns a ref holding the current movement + action input.
 * A ref (not state) so holding a key doesn't re-render every frame.
 */
export function useKeyboardInput() {
  const input = useRef<PlayerInput>({
    x: 0,
    z: 0,
    sprint: false,
    shoot: false,
    pass: false,
    loft: false,
    cameraToggle: false,
    switchPlayer: false,
  });
  const held = useRef<Set<string>>(new Set());

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
      };
    };

    const down = (e: KeyboardEvent) => {
      const action = KEYS[e.code];
      if (!action) return;
      // Space would scroll the page, Ctrl combos are browser shortcuts.
      e.preventDefault();
      held.current.add(action);
      apply();
    };
    const up = (e: KeyboardEvent) => {
      const action = KEYS[e.code];
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
