import type { TeamSide } from "./match";

export type CardColor = "yellow" | "red";

/**
 * A recorded booking in the current match. `team` + `playerIndex` identify
 * which outfield player (in that team's XI ordering) was carded; a red is
 * either a direct red or a second-yellow-turns-red. The HUD renders this
 * list at the bottom of the screen so you can see who's on a warning and
 * who's been sent off.
 */
export type Booking = {
  team: TeamSide;
  playerIndex: number;
  playerName: string;
  color: CardColor;
  /** match minute (clock, not wall) when the card was shown */
  minute: number;
};

/**
 * Decides what card (if any) to show for a foul, given the current book
 * of previous bookings. First foul by a player = yellow; second yellow =
 * red (sent off); no support yet for "straight red" offences — everything
 * is yellow unless it's the offender's second.
 */
export function cardForFoul(
  bookings: Booking[],
  offender: { team: TeamSide; playerIndex: number },
): CardColor {
  const priorYellow = bookings.some(
    (b) =>
      b.team === offender.team &&
      b.playerIndex === offender.playerIndex &&
      b.color === "yellow",
  );
  return priorYellow ? "red" : "yellow";
}

/** True once this player has been sent off (has a red on the ledger). */
export function isSentOff(
  bookings: Booking[],
  team: TeamSide,
  playerIndex: number,
): boolean {
  return bookings.some(
    (b) => b.team === team && b.playerIndex === playerIndex && b.color === "red",
  );
}
