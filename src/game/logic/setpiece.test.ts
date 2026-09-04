import { describe, it, expect } from "vitest";
import { FIELD, cornerSpot } from "./field";
import { detectOutOfBounds, isInPenaltyArea, penaltySpot, RESTART_CLEARANCE, clearSpaceAroundRestart } from "./restarts";
import { cardForFoul, isSentOff, type Booking } from "./bookings";
import { pickTakerIndex, playersOnPitch, sentOffIndices, takerPlacement } from "./setpiece";
import type { Kinematics } from "../types";

const ball = (x: number, z: number) => ({
  position: { x, y: 0.36, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
  spin: 0,
});
const body = (x: number, z: number): Kinematics => ({
  position: { x, y: 0, z },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,
});
const booking = (team: "home" | "away", playerIndex: number, color: "yellow" | "red"): Booking => ({
  team,
  playerIndex,
  playerName: `P${playerIndex}`,
  color,
  minute: 10,
});

describe("corners", () => {
  it("awards a corner at the correct flag when a defender puts it behind", () => {
    const r = detectOutOfBounds(ball(50, 10), ball(55, 12), "away")!;
    expect(r.type).toBe("corner");
    expect(r.team).toBe("home");
    expect(r.position).toEqual(cornerSpot(1, 1));
  });

  it("uses the negative flag when the ball goes out on the -z side", () => {
    const r = detectOutOfBounds(ball(50, -10), ball(55, -12), "away")!;
    expect(r.position.z).toBeLessThan(0);
  });

  it("places the corner taker inside the pitch, never on the flag", () => {
    const spot = cornerSpot(1, 1);
    const { takerPos } = takerPlacement("corner", spot, "home");
    expect(Math.abs(takerPos.x)).toBeLessThan(Math.abs(spot.x));
    expect(Math.abs(takerPos.z)).toBeLessThan(Math.abs(spot.z));
    expect(Math.abs(takerPos.x)).toBeLessThanOrEqual(FIELD.halfLength - 2);
    expect(Math.abs(takerPos.z)).toBeLessThanOrEqual(FIELD.halfWidth - 2);
  });

  it("aims the corner at the goalmouth, not the touchline", () => {
    const spot = cornerSpot(1, 1);
    const { aimAt } = takerPlacement("corner", spot, "home");
    expect(aimAt.z).toBe(0);
    expect(aimAt.x).toBeGreaterThan(0);
  });

  it("pushes defenders back out of the corner arc", () => {
    const spot = cornerSpot(1, 1);
    const cleared = clearSpaceAroundRestart([body(spot.x, spot.z)], spot, RESTART_CLEARANCE.corner);
    const d = Math.hypot(cleared[0]!.position.x - spot.x, cleared[0]!.position.z - spot.z);
    expect(d).toBeGreaterThan(RESTART_CLEARANCE.corner - 3);
  });

  it("skips sent-off players when choosing the taker", () => {
    const spot = cornerSpot(1, 1);
    const bodies = [body(spot.x, spot.z), body(spot.x - 5, spot.z)];
    expect(pickTakerIndex(bodies, new Set(), spot)).toBe(0);
    expect(pickTakerIndex(bodies, new Set([0]), spot)).toBe(1);
    expect(pickTakerIndex(bodies, new Set([0, 1]), spot)).toBe(-1);
  });
});

describe("penalty-zone fouls", () => {
  it("recognises a foul inside the defending team's box", () => {
    const spot = penaltySpot(1);
    expect(isInPenaltyArea(spot, 1)).toBe(true);
    expect(isInPenaltyArea({ x: spot.x, z: 0 }, -1)).toBe(false);
  });

  it("treats midfield and wide-deep fouls as outside the box", () => {
    expect(isInPenaltyArea({ x: 0, z: 0 }, 1)).toBe(false);
    expect(isInPenaltyArea({ x: FIELD.halfLength - 2, z: FIELD.halfWidth - 1 }, 1)).toBe(false);
  });

  it("puts the penalty spot 11m from the defended goal line, centred", () => {
    expect(penaltySpot(1)).toEqual({ x: FIELD.halfLength - 11, z: 0 });
    expect(penaltySpot(-1)).toEqual({ x: -(FIELD.halfLength - 11), z: 0 });
  });

  it("clears everyone well back from a penalty and aims the taker at goal", () => {
    expect(RESTART_CLEARANCE.penalty).toBeGreaterThan(RESTART_CLEARANCE.freekick);
    const { aimAt } = takerPlacement("penalty", penaltySpot(1), "home");
    expect(aimAt).toEqual({ x: FIELD.halfLength, z: 0 });
  });
});

describe("red-card bookkeeping", () => {
  it("shows yellow first, red on the same player's second offence", () => {
    const first = cardForFoul([], { team: "home", playerIndex: 3 });
    expect(first).toBe("yellow");
    const second = cardForFoul([booking("home", 3, "yellow")], { team: "home", playerIndex: 3 });
    expect(second).toBe("red");
  });

  it("does not carry a yellow across players or teams", () => {
    const book = [booking("home", 3, "yellow")];
    expect(cardForFoul(book, { team: "home", playerIndex: 4 })).toBe("yellow");
    expect(cardForFoul(book, { team: "away", playerIndex: 3 })).toBe("yellow");
  });

  it("marks the player sent off and lists the index", () => {
    const book = [booking("home", 3, "yellow"), booking("home", 3, "red")];
    expect(isSentOff(book, "home", 3)).toBe(true);
    expect(isSentOff(book, "home", 4)).toBe(false);
    expect(sentOffIndices(book, "home")).toEqual([3]);
    expect(sentOffIndices(book, "away")).toEqual([]);
  });

  it("drops the on-pitch count for each dismissal, per team", () => {
    expect(playersOnPitch([], "home")).toBe(11);
    const book = [booking("home", 3, "red"), booking("home", 7, "red"), booking("away", 1, "yellow")];
    expect(playersOnPitch(book, "home")).toBe(9);
    expect(playersOnPitch(book, "away")).toBe(11);
  });
});
