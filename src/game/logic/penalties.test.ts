import { describe, expect, it } from "vitest";
import {
  applyPenalty,
  decideWinner,
  initShootout,
  keeperGuess,
  PENALTY_TUNING,
  resolvePenalty,
  shootoutScore,
  type PenaltyOutcome,
} from "./penalties";

const run = (state = initShootout(), outcomes: PenaltyOutcome[] = []) =>
  outcomes.reduce((s, o) => applyPenalty(s, o), state);

describe("resolvePenalty", () => {
  it("scores when the keeper dives the wrong way", () => {
    expect(resolvePenalty({ x: 0.8, y: 0.5 }, 0.8, { x: -0.8, y: 0.2 })).toBe("goal");
  });

  it("is saved when the keeper guesses close", () => {
    expect(resolvePenalty({ x: 0.2, y: 0.3 }, 0.2, { x: 0.2, y: 0.3 })).toBe("saved");
  });

  it("misses when aimed outside the frame", () => {
    expect(resolvePenalty({ x: 0.99, y: 0.5 }, 1, { x: 0, y: 0 })).toBe("miss");
    expect(resolvePenalty({ x: 0, y: 0.99 }, 1, { x: 0, y: 0 })).toBe("miss");
  });

  it("power shrinks the keeper's reach", () => {
    const aim = { x: 0.45, y: 0.3 };
    const guess = { x: 0, y: 0.3 };
    expect(resolvePenalty(aim, 0, guess)).toBe("saved");
    expect(resolvePenalty(aim, 1, guess)).toBe("goal");
  });
});

describe("keeperGuess", () => {
  it("matches the aim exactly at full accuracy", () => {
    const aim = { x: 0.6, y: 0.4 };
    expect(keeperGuess(aim, 1, () => 0.5)).toEqual(aim);
  });

  it("ignores the aim entirely at zero accuracy", () => {
    expect(keeperGuess({ x: 0.9, y: 0.9 }, 0, () => 0.5)).toEqual({ x: 0, y: 0.4 });
  });
});

describe("shootout progression", () => {
  it("alternates takers and increments the round after the away kick", () => {
    const a = applyPenalty(initShootout(), "goal");
    expect(a.turn).toBe("away");
    expect(a.round).toBe(1);
    const b = applyPenalty(a, "saved");
    expect(b.turn).toBe("home");
    expect(b.round).toBe(2);
  });

  it("counts goals only", () => {
    expect(shootoutScore(["goal", "saved", "goal", "miss"])).toBe(2);
  });

  it("ends early when the deficit can no longer be caught", () => {
    const s = run(initShootout(), ["goal", "miss", "goal", "miss", "goal", "miss"]);
    expect(s.winner).toBe("home");
  });

  it("goes to sudden death when level after five each", () => {
    const outcomes: PenaltyOutcome[] = Array.from({ length: 10 }, () => "goal");
    const s = run(initShootout(), outcomes);
    expect(s.winner).toBeNull();
    expect(s.round).toBe(PENALTY_TUNING.rounds + 1);
  });

  it("decides sudden death on a scored-vs-missed pair", () => {
    const level = run(initShootout(), Array.from({ length: 10 }, () => "goal" as PenaltyOutcome));
    const s = run(level, ["goal", "saved"]);
    expect(s.winner).toBe("home");
  });

  it("ignores kicks after a winner is decided", () => {
    const done = run(initShootout(), ["goal", "miss", "goal", "miss", "goal", "miss"]);
    expect(applyPenalty(done, "goal")).toBe(done);
  });

  it("decideWinner is null on a fresh shootout", () => {
    expect(decideWinner(initShootout())).toBeNull();
  });
});
