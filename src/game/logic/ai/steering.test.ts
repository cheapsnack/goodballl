import { describe, expect, it } from "vitest";
import type { Kinematics } from "../../types";
import { jockeyTarget, seekAvoiding, separation, STEERING_TUNING } from "./steering";

const body = (x: number, z: number, vx = 0, vz = 0): Kinematics => ({
  position: { x, y: 0, z },
  velocity: { x: vx, y: 0, z: vz },
  heading: 0,
});

describe("seekAvoiding", () => {
  it("steers straight at the target when nothing's in the way", () => {
    const self = body(0, 0);
    const force = seekAvoiding(self, { x: 10, z: 0 }, []);
    expect(force.x).toBeGreaterThan(0);
    expect(Math.abs(force.z)).toBeLessThan(0.05);
  });

  it("bends the path sideways when an opponent sits in the seek line", () => {
    const self = body(0, 0);
    const opponent = body(3, 0.2); // 0.2m off the direct line to (10,0), well inside avoidRadius
    const force = seekAvoiding(self, { x: 10, z: 0 }, [opponent]);
    // Perpendicular deflection should now be measurable (not perfectly on-line).
    expect(Math.abs(force.z)).toBeGreaterThan(0.5);
  });

  it("ignores opponents behind the dribbler", () => {
    const self = body(0, 0);
    const behind = body(-3, 0);
    const straight = seekAvoiding(self, { x: 10, z: 0 }, []);
    const withBehind = seekAvoiding(self, { x: 10, z: 0 }, [behind]);
    expect(withBehind.x).toBeCloseTo(straight.x, 5);
    expect(withBehind.z).toBeCloseTo(straight.z, 5);
  });

  it("ignores opponents outside the lookahead range", () => {
    const self = body(0, 0);
    const far = body(STEERING_TUNING.avoidLookahead + 3, 0);
    const straight = seekAvoiding(self, { x: 20, z: 0 }, []);
    const withFar = seekAvoiding(self, { x: 20, z: 0 }, [far]);
    expect(withFar.z).toBeCloseTo(straight.z, 5);
  });

  it("deflects opposite the side the opponent is on", () => {
    const self = body(0, 0);
    // Opponent slightly to the +z side of the seek line
    const rightOpp = body(3, 0.5);
    const forceRight = seekAvoiding(self, { x: 10, z: 0 }, [rightOpp]);
    // Opponent slightly to the -z side of the seek line
    const leftOpp = body(3, -0.5);
    const forceLeft = seekAvoiding(self, { x: 10, z: 0 }, [leftOpp]);
    // Deflection z components should have opposite signs.
    expect(Math.sign(forceRight.z)).not.toEqual(Math.sign(forceLeft.z));
  });
});

describe("separation", () => {
  it("returns zero when no teammate is near", () => {
    const self = body(0, 0);
    const force = separation(self, [body(20, 20)]);
    expect(force.x).toBeCloseTo(0, 5);
    expect(force.z).toBeCloseTo(0, 5);
  });

  it("pushes away from a crowding teammate", () => {
    const self = body(0, 0);
    // Teammate 1m to the +x side; separation should push self toward -x.
    const teammate = body(1, 0);
    const force = separation(self, [teammate]);
    expect(force.x).toBeLessThan(0);
  });

  it("stacks pushes from multiple crowding teammates", () => {
    const self = body(0, 0);
    const one = separation(self, [body(1, 0)]);
    const two = separation(self, [body(1, 0), body(0, 1)]);
    // Adding a second crowder should not reduce the total push magnitude.
    expect(Math.hypot(two.x, two.z)).toBeGreaterThanOrEqual(Math.hypot(one.x, one.z));
  });

  it("ignores itself in the teammates list", () => {
    const self = body(0, 0);
    const force = separation(self, [self]);
    expect(force.x).toBeCloseTo(0, 5);
    expect(force.z).toBeCloseTo(0, 5);
  });
});

describe("jockeyTarget", () => {
  it("sits between the carrier and the defending goal", () => {
    const carrier = body(0, 0);
    const target = jockeyTarget(carrier, 40); // own goal at +40
    // Target should be on the goal-side (positive x) of the carrier.
    expect(target.x).toBeGreaterThan(0);
    // ...at roughly the jockey distance.
    const dist = Math.hypot(target.x - carrier.position.x, target.z - carrier.position.z);
    expect(dist).toBeCloseTo(STEERING_TUNING.jockeyDistance, 3);
  });

  it("shadows the carrier's z on the goal-side, not their exact position", () => {
    const carrier = body(20, 15); // carrier well off-centre
    const target = jockeyTarget(carrier, 40);
    // The target should be closer to the defending goal than the carrier is.
    expect(Math.hypot(40 - target.x, target.z)).toBeLessThan(
      Math.hypot(40 - carrier.position.x, carrier.position.z),
    );
  });
});
