import { useGameStore } from "../../game/store/useGameStore";

const LABEL: Record<string, string> = { shoot: "SHOT", pass: "PASS" };

export function PowerBar() {
  // Selector-scoped: IDLE_CHARGE is a stable reference, so this component
  // only re-renders while a strike is actually being charged.
  const charge = useGameStore((s) => s.charge);
  if (!charge.action) return null;

  const isShot = charge.action === "shoot";
  const pct = Math.round(charge.power * 100);

  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-10 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full bg-foreground/75 px-4 py-2 backdrop-blur-sm">
        <span className="w-10 font-mono text-[11px] font-bold tracking-widest text-background">
          {LABEL[charge.action]}
        </span>

        <div className="h-2 w-56 overflow-hidden rounded-full bg-background/25">
          <div
            className="h-full rounded-full transition-[width] duration-75 ease-linear"
            style={{
              width: `${pct}%`,
              background: isShot
                ? "linear-gradient(90deg,#f4c04a,#e2542c)"
                : "linear-gradient(90deg,#7fd3f2,#2f8fd8)",
            }}
          />
        </div>

        <span className="w-9 text-right font-mono text-[11px] tabular-nums text-background/80">
          {pct}%
        </span>

        {charge.loft && (
          <span className="rounded-sm bg-background/20 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-background">
            LOB
          </span>
        )}
      </div>
    </div>
  );
}
