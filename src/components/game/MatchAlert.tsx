import { useEffect } from "react";
import { useGameStore } from "../../game/store/useGameStore";

/**
 * Big, short-lived flash across the middle of the screen for match-state
 * changes you must not miss: a card, a corner, a penalty. Auto-clears.
 */
export function MatchAlert() {
  const alert = useGameStore((s) => s.matchAlert);
  const clearAlert = useGameStore((s) => s.clearAlert);

  useEffect(() => {
    if (!alert) return;
    const id = alert.id;
    const t = setTimeout(() => clearAlert(id), alert.kind === "card" ? 2600 : 2000);
    return () => clearTimeout(t);
  }, [alert, clearAlert]);

  if (!alert) return null;

  return (
    <div
      key={alert.id}
      className="pointer-events-none fixed inset-x-0 top-[22%] z-20 flex animate-in fade-in zoom-in-95 flex-col items-center duration-200"
    >
      <div
        className="flex items-center gap-4 rounded-lg bg-foreground/85 px-8 py-4 text-center shadow-2xl backdrop-blur-sm"
        style={{ boxShadow: `0 0 0 3px ${alert.accent}, 0 18px 40px rgba(0,0,0,0.35)` }}
      >
        {alert.kind === "card" && (
          <span
            aria-hidden
            className="h-11 w-8 rotate-6 rounded-sm"
            style={{ backgroundColor: alert.accent, boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" }}
          />
        )}
        <div>
          <div className="font-sans text-3xl font-black uppercase tracking-[0.14em] text-background">
            {alert.title}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-background/70">
            {alert.subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}
