import { describe, expect, it } from "vitest";
import type { BallState, Kinematics } from "../types";
import { BALL_RADIUS } from "./ballPhysics";
import { possessionBallPosition, tryCapture, trySteal, POSSESSION_TUNING } from "./possession";

const body = (x: number, z: number, heading = 0, vx = 0, vz = 0): Kinematics => ({
  position: { x, y: 0, z },
  velocity: { x: vx, y: 0, z: vz },
  heading,
});

const ballAt = (x: number, z: number, y = BALL_RADIUS): BallState => ({
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
  spin: 0,
});

describe("possessionBallPosition", () => {
  it("sits directly ahead of a stationary possessor's facing direction", () => {
    const p = body(0, 0, 0); // heading 0 -> facing +x per game convention (sin(0)=0... check axis)
    const pos = possessionBallPosition(p, 0);
    const dist = Math.hypot(pos.x - p.position.x, pos.z - p.position.z);
    expect(dist).toBeCloseTo(POSSESSION_TUNING.holdDistance, 5);
  });

  it("holds further ahead at higher speed fractions", () => {
    const p = body(0, 0, Math.PI / 4);
    const still = possessionBallPosition(p, 0);
    const sprinting = possessionBallPosition(p, 1);
    const dStill = Math.hypot(still.x - p.position.x, still.z - p.position.z);
    const dSprint = Math.hypot(sprinting.x - p.position.x, sprinting.z - p.position.z);
    expect(dSprint).toBeGreaterThan(dStill);
  });

  it("rotates with heading — the ball stays in front, not fixed in world space", () => {
    const forward = possessionBallPosition(body(0, 0, 0), 0);
    const sideways = possessionBallPosition(body(0, 0, Math.PI / 2), 0);
    expect(forward.x).not.toBeCloseTo(sideways.x, 3);
  });
});

describe("tryCapture", () => {
  it("returns null when nobody is within capture range", () => {
    const ball = ballAt(0, 0);
    const candidates = [{ team: "home" as const, index: 0, body: body(10, 10) }];
    expect(tryCapture(ball, candidates)).toBeNull();
  });

  it("captures for whoever is closest within range", () => {
    const ball = ballAt(0, 0);
    const candidates = [
      { team: "home" as const, index: 0, body: body(0.9, 0) },
      { team: "away" as const, index: 3, body: body(0.3, 0) },
    ];
    const result = tryCapture(ball, candidates);
    expect(result).toEqual({ team: "away", index: 3 });
  });

  it("does not capture a ball that's still high in the air", () => {
    const ball = ballAt(0, 0, POSSESSION_TUNING.maxCaptureHeight + 0.5);
    const candidates = [{ team: "home" as const, index: 0, body: body(0, 0) }];
    expect(tryCapture(ball, candidates)).toBeNull();
  });

  it("ignores candidates filtered out by the caller (e.g. a restart lock)", () => {
    const ball = ballAt(0, 0);
    // Simulates the caller only passing the locked team's players.
    const candidates = [{ team: "home" as const, index: 2, body: body(0.2, 0) }];
    const result = tryCapture(ball, candidates);
    expect(result?.team).toBe("home");
  });
});

describe("trySteal", () => {
  const carrier = body(10, 5);

  it("grants possession to an opponent within steal radius", () => {
    const opp = [{ team: "away" as const, index: 2, body: body(10.5, 5) }];
    const result = trySteal(carrier, opp);
    expect(result).toEqual({ team: "away", index: 2 });
  });

  it("returns null when no opponent is close enough", () => {
    const opp = [{ team: "away" as const, index: 0, body: body(15, 5) }];
    expect(trySteal(carrier, opp)).toBeNull();
  });

  it("picks the closest opponent", () => {
    const opp = [
      { team: "away" as const, index: 0, body: body(10.8, 5) },
      { team: "away" as const, index: 3, body: body(10.3, 5) },
    ];
    const result = trySteal(carrier, opp);
    expect(result?.index).toBe(3);
  });
});
