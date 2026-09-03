import { describe, expect, it } from "vitest";
import {
  applyFreeKick,
  buildWall,
  freeKickScore,
  FREEKICK_TUNING,
  hitsWall,
  initFreeKickSet,
  keeperGuessFK,
  resolveFreeKick,
} from "./freekicks";

const wall = buildWall(-1, "normal"); // centred at x = -0.34, height 1.40

describe("hitsWall", () => {
  it("blocks a low straight ball hit at the wall", () => {
    expect(hitsWall({ x: -0.34, y: 0.2 }, 0, wall)).toBe(true);
  });

  it("blocks a high straight ball because the wall now reaches the crossbar", () => {
    expect(hitsWall({ x: -0.34, y: 1.0 }, 0, wall)).toBe(true);
  });

  it("lets a heavily bent ball curl around the wall", () => {
    expect(hitsWall({ x: -0.34, y: 0.2 }, 1, wall)).toBe(false);
  });

  it("ignores aims wide of the wall", () => {
    expect(hitsWall({ x: 0.7, y: 0.2 }, 0, wall)).toBe(false);
  });
});

describe("resolveFreeKick", () => {
  it("misses when aimed outside the frame", () => {
    expect(resolveFreeKick({ x: 1, y: 0.4 }, 1, 0, { x: 0, y: 0 }, wall)).toBe("miss");
  });

  it("reports the wall before the keeper", () => {
    expect(resolveFreeKick({ x: -0.34, y: 0.1 }, 1, 0, { x: -0.34, y: 0.1 }, wall)).toBe("wall");
  });

  it("is saved when the keeper dives on the ball", () => {
    expect(resolveFreeKick({ x: 0.2, y: 0.3 }, 0, 0, { x: 0.2, y: 0.3 }, wall)).toBe("saved");
  });

  it("is a goal into the far corner", () => {
    expect(resolveFreeKick({ x: 0.9, y: 0.8 }, 1, 0.5, { x: -0.8, y: 0.1 }, wall)).toBe("goal");
  });

  it("curve makes an otherwise saveable shot beat the keeper", () => {
    const aim = { x: 0.5, y: 0.3 };
    const guess = { x: 0.16, y: 0.3 };
    expect(resolveFreeKick(aim, 0, 0, guess, wall)).toBe("saved");
    expect(resolveFreeKick(aim, 0, -1, guess, wall)).toBe("goal");
  });
});

describe("keeperGuessFK", () => {
  it("dives exactly on the aim at full accuracy", () => {
    expect(keeperGuessFK({ x: 0.4, y: 0.5 }, 1, () => 0.5)).toEqual({ x: 0.4, y: 0.5 });
  });

  it("stays inside the goal at zero accuracy", () => {
    const g = keeperGuessFK({ x: 0.4, y: 0.5 }, 0, () => 1);
    expect(Math.abs(g.x)).toBeLessThanOrEqual(1);
    expect(g.y).toBeLessThanOrEqual(1);
  });
});

describe("free kick set", () => {
  it("closes after the configured number of attempts and scores goals", () => {
    let set = initFreeKickSet();
    for (let i = 0; i < FREEKICK_TUNING.attempts; i++) {
      set = applyFreeKick(set, i % 2 === 0 ? "goal" : "saved");
    }
    expect(set.done).toBe(true);
    expect(set.results).toHaveLength(FREEKICK_TUNING.attempts);
    expect(freeKickScore(set.results)).toBe(3);
    // further kicks are ignored once the set is done
    expect(applyFreeKick(set, "goal")).toBe(set);
  });
});
