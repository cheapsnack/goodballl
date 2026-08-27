import { describe, expect, it } from "vitest";
import type { BallState, Kinematics } from "../../types";
import { BALL_RADIUS } from "../ballPhysics";
import { FIELD, goalLineX } from "../field";
import {
  initialKeeperState,
  keeperHome,
  KEEPER_TUNING,
  predictCrossing,
  stepGoalkeeper,
  tryKeeperSave,
  type KeeperState,
} from "./goalkeeper";
import {
  DEFENDER_TUNING,
  nearestDefenderIndex,
  stepDefender,
  zonalAnchor,
  type DefenderRole,
} from "./defender";

const SIDE = 1 as const;

const body = (x: number, z: number): Kinematics => ({
  position: { x, y: 0, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
});

const ballAt = (
  x: number,
  z: number,
  vx = 0,
  vz = 0,
  y = BALL_RADIUS,
  vy = 0,
): BallState => ({
  position: { x, y, z },
  velocity: { x: vx, y: vy, z: vz },
  heading: 0,
  spin: 0,
});

describe("predictCrossing", () => {
  it("returns null when the ball is moving away from the goal", () => {
    expect(predictCrossing(ballAt(30, 0, -20), SIDE)).toBeNull();
  });

  it("returns null for a stationary ball", () => {
    expect(predictCrossing(ballAt(30, 0, 0), SIDE)).toBeNull();
  });

  it("projects the crossing point and time of a straight shot", () => {
    // 22.5m out, 25 m/s, drifting 4 m/s toward +z.
    const c = predictCrossing(ballAt(30, 0, 25, 4), SIDE);
    expect(c).not.toBeNull();
    expect(c!.time).toBeCloseTo(0.9, 2);
    expect(c!.z).toBeCloseTo(3.6, 2);
  });

  it("accounts for gravity so a ball sailing over is predicted high", () => {
    const c = predictCrossing(ballAt(30, 0, 25, 0, 1, 14), SIDE);
    expect(c!.y).toBeGreaterThan(FIELD.goalHeight);
  });
});

describe("goalkeeper positioning", () => {
  const st = initialKeeperState();

  it("rests near the goal line and idles when the ball is miles away", () => {
    const home = keeperHome(SIDE);
    expect(Math.abs(goalLineX(SIDE) - home.x)).toBeCloseTo(KEEPER_TUNING.restOffset, 5);

    const d = stepGoalkeeper(body(home.x, home.z), st, ballAt(-40, 0), SIDE, 1 / 60);
    expect(d.state.phase).toBe("idle");
    expect(d.diveVelocity).toBeNull();
  });

  it("tracks the ball's z when the ball is in range", () => {
    const d = stepGoalkeeper(body(51.8, 0), st, ballAt(35, 10), SIDE, 1 / 60);
    expect(d.state.phase).toBe("tracking");
    expect(d.input.z).toBeGreaterThan(0); // shuffles toward +z
  });

  it("never strays further than a post-width and a bit off centre", () => {
    // Ball out wide by the touchline: keeper must stay by the posts.
    let keeper = body(51.8, 0);
    for (let i = 0; i < 400; i++) {
      const d = stepGoalkeeper(keeper, st, ballAt(30, 30), SIDE, 1 / 60);
      keeper = {
        ...keeper,
        position: {
          ...keeper.position,
          x: keeper.position.x + d.input.x * 0.06,
          z: keeper.position.z + d.input.z * 0.06,
        },
      };
    }
    expect(keeper.position.z).toBeLessThanOrEqual(KEEPER_TUNING.maxLateral + 0.1);
  });

  it("advances off the line as the ball gets closer", () => {
    const far = stepGoalkeeper(body(51.8, 0), st, ballAt(25, 0), SIDE, 1 / 60);
    const near = stepGoalkeeper(body(51.8, 0), st, ballAt(45, 0), SIDE, 1 / 60);
    // Both want to come forward (-x), but the near one wants it more.
    expect(near.input.x).toBeLessThan(far.input.x);
  });
});

describe("goalkeeper dive", () => {
  const st = initialKeeperState();

  it("dives toward a fast shot heading for the corner", () => {
    // 12m out, 28 m/s -> ~0.43s, drifting to +z.
    const d = stepGoalkeeper(body(51.8, 0), st, ballAt(40, 0, 28, 6), SIDE, 1 / 60);
    expect(d.state.phase).toBe("diving");
    expect(d.state.diveDir).toBe(1);
    expect(d.diveVelocity!.z).toBeGreaterThan(0);
    // Closes the angle as well as going sideways.
    expect(d.diveVelocity!.x).toBeLessThan(0);
  });

  it("does not dive at a shot arriving straight at them", () => {
    const d = stepGoalkeeper(body(51.8, 0), st, ballAt(40, 0, 28, 0), SIDE, 1 / 60);
    expect(d.state.phase).not.toBe("diving");
  });

  it("does not dive at a slow rolling ball", () => {
    const d = stepGoalkeeper(body(51.8, 0), st, ballAt(50, 0, 3, 4), SIDE, 1 / 60);
    expect(d.state.phase).not.toBe("diving");
  });

  it("does not dive at a shot flying wide of the post", () => {
    // Crossing z ends up ~ +12m: well outside the frame.
    const d = stepGoalkeeper(body(51.8, 0), st, ballAt(40, 0, 28, 28), SIDE, 1 / 60);
    expect(d.state.phase).not.toBe("diving");
  });

  it("runs diving -> recovering -> tracking and cannot re-dive mid-recovery", () => {
    let state: KeeperState = { phase: "diving", timer: 0.05, diveDir: 1 };
    const shot = ballAt(40, 0, 28, 6);

    // Dive finishes.
    state = stepGoalkeeper(body(51.8, 0), state, shot, SIDE, 0.1).state;
    expect(state.phase).toBe("recovering");

    // Beaten while getting up, even with another shot incoming.
    const mid = stepGoalkeeper(body(51.8, 2), state, shot, SIDE, 0.1);
    expect(mid.state.phase).toBe("recovering");
    expect(mid.diveVelocity).toBeNull();

    // Recovery expires -> back to reading the game.
    state = { phase: "recovering", timer: 0.01, diveDir: 0 };
    const done = stepGoalkeeper(body(51.8, 2), state, ballAt(20, 0), SIDE, 0.1);
    expect(done.state.phase).toBe("idle");
  });
});

describe("keeper saves", () => {
  const tracking: KeeperState = { phase: "tracking", timer: 0, diveDir: 0 };

  it("parries a shot that reaches them, away from goal", () => {
    const out = tryKeeperSave(ballAt(51.5, 0.8, 24, 0), body(51.8, 0), tracking, SIDE);
    expect(out).not.toBeNull();
    expect(out!.velocity.x).toBeLessThan(0); // pushed back up the pitch
    expect(Math.abs(out!.velocity.z)).toBeGreaterThan(0);
  });

  it("misses a shot outside reach", () => {
    expect(tryKeeperSave(ballAt(51.5, 3.2, 24, 0), body(51.8, 0), tracking, SIDE)).toBeNull();
  });

  it("reaches further while diving", () => {
    const diving: KeeperState = { phase: "diving", timer: 0.2, diveDir: 1 };
    const ball = ballAt(51.5, 1.9, 24, 0);
    expect(tryKeeperSave(ball, body(51.8, 0), tracking, SIDE)).toBeNull();
    expect(tryKeeperSave(ball, body(51.8, 0), diving, SIDE)).not.toBeNull();
  });

  it("cannot claim a ball above head height", () => {
    const high = ballAt(51.5, 0, 24, 0, 3.2);
    expect(tryKeeperSave(high, body(51.8, 0), tracking, SIDE)).toBeNull();
  });

  it("ignores a ball already travelling away from goal", () => {
    expect(tryKeeperSave(ballAt(51.5, 0, -24, 0), body(51.8, 0), tracking, SIDE)).toBeNull();
  });

  it("is beaten while recovering", () => {
    const rec: KeeperState = { phase: "recovering", timer: 0.3, diveDir: 0 };
    expect(tryKeeperSave(ballAt(51.5, 0, 24, 0), body(51.8, 0), rec, SIDE)).toBeNull();
  });
});

describe("defenders", () => {
  const roles: [DefenderRole, DefenderRole] = [
    { id: "l", side: SIDE, laneZ: -8.5 },
    { id: "r", side: SIDE, laneZ: 8.5 },
  ];

  it("picks the closest defender as the chaser", () => {
    const ds = [body(20, -12), body(20, 10)];
    expect(nearestDefenderIndex(ds, ballAt(20, 9))).toBe(1);
    expect(nearestDefenderIndex(ds, ballAt(20, -13))).toBe(0);
  });

  it("chaser steers toward the ball", () => {
    const input = stepDefender(body(20, 0), roles[0], ballAt(30, 6), true);
    expect(input.x).toBeGreaterThan(0);
    expect(input.z).toBeGreaterThan(0);
    expect(input.sprint).toBe(true);
  });

  it("chaser leads a moving ball rather than aiming at it", () => {
    const still = stepDefender(body(20, 0), roles[0], ballAt(30, 0), true);
    const moving = stepDefender(body(20, 0), roles[0], ballAt(30, 0, 0, 20), true);
    expect(still.z).toBeCloseTo(0, 5);
    expect(moving.z).toBeGreaterThan(0);
  });

  it("holds position when already on the ball", () => {
    const input = stepDefender(body(20, 0), roles[0], ballAt(20.1, 0), true);
    expect(input.x).toBe(0);
    expect(input.z).toBe(0);
  });

  it("zonal anchor stays goal-side of the ball", () => {
    const anchor = zonalAnchor(roles[0], ballAt(10, 0));
    expect(anchor.x).toBeGreaterThan(10);
    expect(anchor.x).toBeLessThanOrEqual(DEFENDER_TUNING.maxDepth);
  });

  it("zonal anchor shifts with the ball but keeps its lane", () => {
    const left = zonalAnchor(roles[0], ballAt(10, 20));
    const right = zonalAnchor(roles[1], ballAt(10, 20));
    expect(left.z).toBeLessThan(right.z);
    expect(Math.abs(left.z)).toBeLessThan(FIELD.halfWidth);
    expect(Math.abs(right.z)).toBeLessThan(FIELD.halfWidth);
  });

  it("non-chaser drifts to its zone, not the ball", () => {
    const input = stepDefender(body(20, 8.5), roles[1], ballAt(-30, 0), false);
    // Ball is far behind; the zonal defender should not sprint at it.
    expect(input.x).toBeLessThanOrEqual(0.01);
  });

  it("all inputs stay within the normalized range", () => {
    const cases = [ballAt(0, 0), ballAt(50, 30, 20, -10), ballAt(-50, -30, -8, 4)];
    for (const b of cases) {
      for (const chaser of [true, false]) {
        const i = stepDefender(body(5, 5), roles[0], b, chaser);
        expect(Math.hypot(i.x, i.z)).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});
