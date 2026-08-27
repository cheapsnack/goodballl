import { describe, expect, it } from "vitest";
import { detectGoal, formatClock, displayClock, MATCH_TUNING } from "./match";
import { BALL_RADIUS } from "./ballPhysics";
import type { BallState } from "../types";

const ball = (x: number, z = 0, y = BALL_RADIUS): BallState => ({
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
  spin: 0,
});

describe("detectGoal", () => {
  it("scores for home when the ball fully crosses the +x line", () => {
    expect(detectGoal(ball(52), ball(54))).toEqual({ side: 1, scorer: "home" });
  });
  it("scores for away over the -x line", () => {
    expect(detectGoal(ball(-52), ball(-54))?.scorer).toBe("away");
  });
  it("ignores a ball not fully over the line", () => {
    expect(detectGoal(ball(52), ball(52.6))).toBeNull();
  });
  it("ignores a wide ball", () => {
    expect(detectGoal(ball(52, 6), ball(54, 6))).toBeNull();
  });
  it("ignores a ball over the bar", () => {
    expect(detectGoal(ball(52, 0, 4), ball(54, 0, 4))).toBeNull();
  });
  it("catches a fast shot that tunnels past the line in one frame", () => {
    expect(detectGoal(ball(48), ball(60))?.scorer).toBe("home");
  });
  it("does not re-score once the ball is already behind the line", () => {
    expect(detectGoal(ball(54), ball(56))).toBeNull();
  });
});

describe("clock", () => {
  it("formats mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
  });
  it("continues into the second half", () => {
    expect(displayClock(2, 10)).toBe(MATCH_TUNING.periodSeconds + 10);
  });
});
