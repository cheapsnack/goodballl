import { useEffect, useState } from "react";
import { useGameStore, HOME_DEFEND_SIDE, AWAY_DEFEND_SIDE } from "../../game/store/useGameStore";
import { getClub } from "../../game/data/clubs";
import { buildOutfield } from "../../game/logic/ai/outfield";

type Row = { name: string; color: string; club: string } | null;

/**
 * On-screen names of the human-controlled players only: yours bottom-left
 * and — in a two-human match (local 1v1 or an online room) — the opponent's
 * bottom-right. Rendered as DOM rather than 3D labels so it never ghosts in
 * networked matches, where positions mutate in place without re-rendering.
 */
export function PlayerNamesPanel() {
  const [home, setHome] = useState<Row>(null);
  const [away, setAway] = useState<Row>(null);
  const netRole = useGameStore((s) => s.netRole);
  const twoHuman = netRole !== "local";

  useEffect(() => {
    const tick = () => {
      const s = useGameStore.getState();
      const homeClub = getClub(s.homeClubId);
      const awayClub = getClub(s.awayClubId);

      const homeXI = buildOutfield(homeClub, HOME_DEFEND_SIDE, s.mentality);
      const mine = homeXI[s.controlledIndex];
      setHome(
        mine
          ? { name: mine.player.name, color: homeClub.primaryColor, club: homeClub.shortName }
          : null,
      );

      if (twoHuman) {
        const awayXI = buildOutfield(awayClub, AWAY_DEFEND_SIDE, s.mentality);
        const theirs = awayXI[s.awayControlledIndex];
        setAway(
          theirs
            ? { name: theirs.player.name, color: awayClub.primaryColor, club: awayClub.shortName }
            : null,
        );
      } else {
        setAway(null);
      }
    };

    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [twoHuman]);

  return (
    <>
      {home && <NameCard row={home} side="left" tag="You" />}
      {away && <NameCard row={away} side="right" tag="P2" />}
    </>
  );
}

function NameCard({ row, side, tag }: { row: NonNullable<Row>; side: "left" | "right"; tag: string }) {
  return (
    <div
      className={`pointer-events-none fixed bottom-4 z-10 flex items-center gap-2.5 rounded-lg bg-foreground/80 px-4 py-2.5 font-sans text-background shadow-lg backdrop-blur-sm ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      <span
        aria-hidden
        className="inline-block h-4 w-4 rounded-full"
        style={{ backgroundColor: row.color, boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" }}
      />
      <div className="flex flex-col leading-tight">
        <span className="text-lg font-black text-yellow-300">{row.name}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-background/60">
          {row.club}
        </span>
      </div>
      <span className="rounded-sm bg-yellow-400/90 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground">
        {tag}
      </span>
    </div>
  );
}
