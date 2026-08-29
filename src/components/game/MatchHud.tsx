import { useGameStore } from "../../game/store/useGameStore";
import { displayClock, formatClock, MATCH_TUNING } from "../../game/logic/match";

const TEAMS = {
  home: { short: "YOU", color: "#e2542c" },
  away: { short: "AI", color: "#2f6fd0" },
} as const;

export function MatchHud({ onExit }: { onExit?: (() => void) | undefined }) {
  const resetMatch = useGameStore((s) => s.resetMatch);
  const score = useGameStore((s) => s.score);
  const matchTime = useGameStore((s) => s.matchTime);
  const period = useGameStore((s) => s.period);
  const status = useGameStore((s) => s.matchStatus);
  const lastScorer = useGameStore((s) => s.lastScorer);
  const netRole = useGameStore((s) => s.netRole);
  const awayLabel = netRole === "local" ? "AI" : "P2";

  const clock = formatClock(displayClock(period, matchTime));

  return (
    <>
      {/* Broadcast score bug */}
      <div className="pointer-events-none fixed left-1/2 top-5 z-10 -translate-x-1/2">
        <div className="flex items-stretch overflow-hidden rounded-md bg-foreground/80 font-sans text-background shadow-lg backdrop-blur-sm">
          <Badge team="home" />
          <div className="flex items-center gap-2 px-4 py-2 font-mono text-lg font-bold tabular-nums tracking-widest">
            <span>{score.home}</span>
            <span className="opacity-40">-</span>
            <span>{score.away}</span>
          </div>
          <Badge team="away" label={awayLabel} />
          <div className="flex flex-col items-center justify-center border-l border-background/20 px-3 py-1">
            <span className="font-mono text-sm font-semibold tabular-nums leading-tight">
              {clock}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-60">
              {period === 1 ? "1st half" : "2nd half"}
            </span>
          </div>
        </div>
      </div>

      {/* Status overlays */}
      {status === "goal" && lastScorer && (
        <Banner
          title="GOAL!"
          subtitle={lastScorer === "home" ? "You score" : "Conceded"}
          accent={TEAMS[lastScorer].color}
        />
      )}
      {status === "kickoff" && (
        <Banner title="KICK OFF" subtitle={period === 1 ? "First half" : "Second half"} />
      )}
      {status === "halftime" && <Banner title="HALF TIME" subtitle={`${score.home} - ${score.away}`} />}
      {status === "fulltime" && (
        <Banner
          title="FULL TIME"
          subtitle={`${score.home} - ${score.away} · ${MATCH_TUNING.periods} halves played`}
        >
          <div className="pointer-events-auto mt-5 flex justify-center gap-3">
            {netRole !== "guest" && (
              <button
                onClick={() => resetMatch()}
                className="rounded-md bg-background px-5 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-foreground transition-transform hover:scale-[1.03]"
              >
                Rematch
              </button>
            )}
            {onExit && (
              <button
                onClick={onExit}
                className="rounded-md border border-background/40 px-5 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-background/80 transition-colors hover:bg-background/10"
              >
                Main menu
              </button>
            )}
          </div>
        </Banner>
      )}
    </>
  );
}

function Badge({ team, label }: { team: "home" | "away"; label?: string }) {
  const t = TEAMS[team];
  return (
    <div
      className="flex items-center px-3 py-2 text-[11px] font-bold tracking-[0.16em]"
      style={{ backgroundColor: t.color }}
    >
      {label ?? t.short}
    </div>
  );
}

function Banner({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/3 z-10 flex flex-col items-center">
      <div
        className="rounded-lg bg-foreground/80 px-10 py-5 text-center backdrop-blur-sm"
        style={accent ? { boxShadow: `0 0 0 3px ${accent}` } : undefined}
      >
        <div className="font-sans text-5xl font-black tracking-[0.1em] text-background">
          {title}
        </div>
        {subtitle && (
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-background/70">
            {subtitle}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
