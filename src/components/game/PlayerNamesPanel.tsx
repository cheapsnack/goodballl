import { useEffect, useState } from "react";
import { useGameStore, HOME_DEFEND_SIDE, AWAY_DEFEND_SIDE } from "../../game/store/useGameStore";
import { getClub } from "../../game/data/clubs";
import { buildOutfield } from "../../game/logic/ai/outfield";

type Row = {
  id: string;
  name: string;
  color: string;
  team: "home" | "away";
  controlled: boolean;
  distToBall: number;
};

/**
 * Bottom-left HUD panel showing readable player names: the controlled
 * player plus the 3 players nearest the ball. Rendered as DOM (not 3D
 * labels) so it never ghosts in networked matches — positions are read
 * imperatively on a timer instead of subscribing to per-frame mutations.
 */
export function PlayerNamesPanel() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const tick = () => {
      const s = useGameStore.getState();
      const homeClub = getClub(s.homeClubId);
      const awayClub = getClub(s.awayClubId);
      const homeXI = buildOutfield(homeClub, HOME_DEFEND_SIDE, s.mentality);
      const awayXI = buildOutfield(awayClub, AWAY_DEFEND_SIDE, s.mentality);
      const ball = s.ball.position;

      const dist = (p: { x: number; z: number }) => Math.hypot(p.x - ball.x, p.z - ball.z);

      const all: Row[] = [
        ...homeXI.map((e, i) => ({
          id: e.role.id,
          name: e.player.name,
          color: homeClub.primaryColor,
          team: "home" as const,
          controlled: i === s.controlledIndex,
          distToBall: dist(s.homeOutfield[i]?.position ?? e.body.position),
        })),
        ...awayXI.map((e, i) => ({
          id: e.role.id,
          name: e.player.name,
          color: awayClub.primaryColor,
          team: "away" as const,
          controlled: i === s.awayControlledIndex,
          distToBall: dist(s.awayOutfield[i]?.position ?? e.body.position),
        })),
      ];

      const near = new Set(
        [...all].sort((a, b) => a.distToBall - b.distToBall).slice(0, 3).map((r) => r.id),
      );
      setRows(all.filter((r) => r.controlled || near.has(r.id)));
    };

    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-10 flex flex-col gap-1 rounded-md bg-foreground/80 px-3 py-2 font-sans text-background shadow-lg backdrop-blur-sm">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: r.color, boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" }}
          />
          <span
            className={`text-sm leading-tight ${
              r.controlled ? "font-black text-yellow-300" : "font-semibold text-background/90"
            }`}
          >
            {r.name}
          </span>
          {r.controlled && (
            <span className="rounded-sm bg-yellow-400/90 px-1 py-px text-[9px] font-black uppercase tracking-widest text-foreground">
              You
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
