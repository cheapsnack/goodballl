import { describe, expect, it } from "vitest";
import type { BallState } from "../../types";
import { BALL_RADIUS } from "../ballPhysics";
import { FIELD } from "../field";
import { slotAnchor, zonalAnchor, type OutfieldRole } from "./outfield";
import { MENTALITY_TUNING } from "./mentality";

const midfieldSlot = { position: "MID" as const, depth: 34, z: 0 };
const ballAt = (x: number, z: number): BallState => ({
  position: { x, y: BALL_RADIUS, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
  spin: 0,
});

describe("mentality: formation depth", () => {
  it("attacking pushes the line higher up the pitch than balanced", () => {
    const balanced = slotAnchor(midfieldSlot, 1, "balanced");
    const attacking = slotAnchor(midfieldSlot, 1, "attacking");
    // side=1 means "attacks the -x goal", so pushing higher = smaller x for a mid line still in own half...
    // simpler check: attacking should be closer to the opponent's goal than balanced.
    const oppGoalX = -FIELD.halfLength;
    expect(Math.abs(attacking.x - oppGoalX)).toBeLessThan(Math.abs(balanced.x - oppGoalX));
  });

  it("defensive drops the line deeper than balanced", () => {
    const balanced = slotAnchor(midfieldSlot, 1, "balanced");
    const defensive = slotAnchor(midfieldSlot, 1, "defensive");
    const ownGoalX = FIELD.halfLength;
    // Defensive should be closer to own goal than balanced.
    expect(Math.abs(defensive.x - ownGoalX)).toBeLessThan(Math.abs(balanced.x - ownGoalX));
  });

  it("balanced is the default when no mentality passed", () => {
    const explicit = slotAnchor(midfieldSlot, 1, "balanced");
    const defaulted = slotAnchor(midfieldSlot, 1);
    expect(defaulted.x).toBeCloseTo(explicit.x, 6);
  });
});

describe("mentality: ball-follow shift", () => {
  const role: OutfieldRole = { id: "test", defendSide: 1, slot: midfieldSlot };

  it("attacking teams shift more aggressively with the ball's x-position", () => {
    const ball = ballAt(-20, 0);
    const balanced = zonalAnchor(role, ball, "balanced");
    const attacking = zonalAnchor(role, ball, "attacking");
    // Attacking should track further toward the ball than balanced.
    expect(Math.abs(attacking.x - ball.position.x)).toBeLessThan(
      Math.abs(balanced.x - ball.position.x),
    );
  });

  it("defensive teams shift less than balanced (stay compact deeper)", () => {
    const ball = ballAt(-20, 0);
    const balanced = zonalAnchor(role, ball, "balanced");
    const defensive = zonalAnchor(role, ball, "defensive");
    expect(Math.abs(defensive.x - ball.position.x)).toBeGreaterThan(
      Math.abs(balanced.x - ball.position.x),
    );
  });

  it("mentality tuning presets differ in the expected direction", () => {
    expect(MENTALITY_TUNING.attacking.lineOffset).toBeGreaterThan(MENTALITY_TUNING.balanced.lineOffset);
    expect(MENTALITY_TUNING.defensive.lineOffset).toBeLessThan(MENTALITY_TUNING.balanced.lineOffset);
    expect(MENTALITY_TUNING.attacking.ballShift).toBeGreaterThan(MENTALITY_TUNING.defensive.ballShift);
  });
});

describe("kickoff shape", () => {
  it("all outfield players spawn in their own half at balanced mentality", () => {
    const slots = [
      { position: "DEF" as const, depth: 18, z: -15 },
      { position: "MID" as const, depth: 34, z: 0 },
      { position: "FWD" as const, depth: 48, z: 10 },
    ];
    // side=1 defends +x, so own half is x > 0 for these players.
    for (const s of slots) {
      const a = slotAnchor(s, 1, "balanced");
      expect(a.x).toBeGreaterThan(0);
    }
  });
});
