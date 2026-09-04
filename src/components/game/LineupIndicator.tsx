import { useGameStore } from "../../game/store/useGameStore";
import { playersOnPitch, sentOffIndices } from "../../game/logic/setpiece";
import type { TeamSide } from "../../game/logic/match";

/**
 * Compact lineup strip under the score bug: how many players each side
 * still has on the pitch, plus who has been sent off.
 */
export function LineupIndicator() {
  const bookings = useGameStore((s) => s.bookings);
  const netRole = useGameStore((s) => s.netRole);
  const awayLabel = netRole === "local" ? "AI" : "P2";

  const reds = bookings.filter((b) => b.color === "red");
  if (reds.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-[68px] z-10 -translate-x-1/2">
      <div className="flex items-center gap-4 rounded-md bg-foreground/75 px-4 py-1.5 font-sans text-[11px] text-background shadow-lg backdrop-blur-sm">
        <TeamCount team="home" label="YOU" bookings={bookings} />
        <span className="opacity-30">|</span>
        <TeamCount team="away" label={awayLabel} bookings={bookings} />
      </div>
    </div>
  );
}

function TeamCount({
  team,
  label,
  bookings,
}: {
  team: TeamSide;
  label: string;
  bookings: ReturnType<typeof useGameStore.getState>["bookings"];
}) {
  const count = playersOnPitch(bookings, team);
  const off = sentOffIndices(bookings, team);
  const names = bookings
    .filter((b) => b.team === team && b.color === "red")
    .map((b) => b.playerName);

  return (
    <div className="flex items-center gap-2">
      <span className="font-bold uppercase tracking-[0.18em] text-background/60">{label}</span>
      <span
        className={`font-mono text-sm font-bold tabular-nums ${
          count < 11 ? "text-red-400" : ""
        }`}
      >
        {count}
      </span>
      <span className="text-background/40">on pitch</span>
      {off.length > 0 && (
        <span className="flex items-center gap-1 text-background/70">
          <span aria-hidden className="inline-block h-3 w-2 rounded-sm bg-red-500" />
          {names.join(", ")}
        </span>
      )}
    </div>
  );
}
