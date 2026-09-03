import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "../../game/store/useGameStore";
import { getClub } from "../../game/data/clubs";
import { DIFFICULTY_TUNING } from "../../game/logic/ai/difficulty";
import { playKick, playWhistle } from "../../game/logic/audio";
import {
  applyPenalty,
  keeperGuess,
  PENALTY_TUNING,
  resolvePenalty,
  shootoutScore,
  type PenaltyAim,
  type PenaltyOutcome,
} from "../../game/logic/penalties";

/**
 * How fast the reticle slides across the goal, in normalized units per
 * second. Slowed down from the first pass — the reticle used to shoot past
 * the corner you were aiming for before you could release.
 */
const AIM_SPEED = { x: 0.85, y: 0.65 };
/** Seconds of holding Space to reach full power. */
const POWER_TIME = 1.1;
/** How long the result of a kick stays on screen before the next taker. */
const RESULT_HOLD = 1.4;

const OUTCOME_LABEL: Record<PenaltyOutcome, string> = {
  goal: "GOAL!",
  saved: "SAVED!",
  miss: "MISSED!",
};

/**
 * Penalty shootout overlay — an arcade aim-and-power mini-game played over
 * the top of whatever is behind it. All outcome maths lives in
 * game/logic/penalties.ts; this component only drives input and presentation.
 */
export function PenaltyShootout({ onExit }: { onExit?: (() => void) | undefined }) {
  const shootout = useGameStore((s) => s.shootout);
  const setShootout = useGameStore((s) => s.setShootout);
  const difficulty = useGameStore((s) => s.difficulty);
  const homeClub = getClub(useGameStore((s) => s.homeClubId));
  const awayClub = getClub(useGameStore((s) => s.awayClubId));

  const [aim, setAim] = useState<PenaltyAim>({ x: 0, y: 0.45 });
  const [power, setPower] = useState(0);
  const [result, setResult] = useState<{ outcome: PenaltyOutcome; aim: PenaltyAim; guess: PenaltyAim } | null>(null);

  const held = useRef<Set<string>>(new Set());
  const aimRef = useRef(aim);
  const powerRef = useRef(0);
  const busy = useRef(false);
  aimRef.current = aim;

  const isHomeTurn = shootout.turn === "home" && !shootout.winner;
  const keeperAccuracy = DIFFICULTY_TUNING[difficulty].shotAccuracy * 0.55;

  /** Resolves one kick and, after a beat, hands over to the next taker. */
  const take = useCallback(
    (kickAim: PenaltyAim, kickPower: number) => {
      if (busy.current) return;
      busy.current = true;
      const guess = keeperGuess(kickAim, keeperAccuracy);
      const outcome = resolvePenalty(kickAim, kickPower, guess);
      playKick(kickPower);
      setResult({ outcome, aim: kickAim, guess });
      setPower(0);
      powerRef.current = 0;
      window.setTimeout(() => {
        const next = applyPenalty(useGameStore.getState().shootout, outcome);
        setShootout(next);
        setResult(null);
        setAim({ x: 0, y: 0.45 });
        busy.current = false;
        if (next.winner) playWhistle();
      }, RESULT_HOLD * 1000);
    },
    [keeperAccuracy, setShootout],
  );

  // --- human input: arrows/WASD aim, Space charges and releases ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      held.current.add(e.code);
      if (e.code === "Space") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      if (e.code === "Space" && powerRef.current > 0 && !busy.current && isHomeTurn) {
        take(aimRef.current, powerRef.current);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isHomeTurn, take]);

  // --- per-frame aim + power ramp for the human taker ---
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (isHomeTurn && !busy.current) {
        const h = held.current;
        const dx = (h.has("ArrowRight") || h.has("KeyD") ? 1 : 0) - (h.has("ArrowLeft") || h.has("KeyA") ? 1 : 0);
        const dy = (h.has("ArrowUp") || h.has("KeyW") ? 1 : 0) - (h.has("ArrowDown") || h.has("KeyS") ? 1 : 0);
        if (dx !== 0 || dy !== 0) {
          setAim((a) => ({
            x: Math.max(-1, Math.min(1, a.x + dx * AIM_SPEED.x * dt)),
            y: Math.max(0, Math.min(1, a.y + dy * AIM_SPEED.y * dt)),
          }));
        }
        if (h.has("Space")) {
          powerRef.current = Math.min(1, powerRef.current + dt / POWER_TIME);
          setPower(powerRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isHomeTurn]);

  // --- AI taker ---
  useEffect(() => {
    if (shootout.turn !== "away" || shootout.winner || busy.current) return;
    const t = window.setTimeout(() => {
      const skill = DIFFICULTY_TUNING[difficulty].shotAccuracy;
      const side = Math.random() < 0.5 ? -1 : 1;
      const aiAim: PenaltyAim = {
        x: side * (0.35 + Math.random() * 0.55 * (0.5 + skill / 2)),
        y: 0.15 + Math.random() * 0.7,
      };
      take(aiAim, 0.5 + Math.random() * 0.5);
    }, 900);
    return () => window.clearTimeout(t);
  }, [shootout.turn, shootout.round, shootout.winner, difficulty, take]);

  const homeGoals = shootoutScore(shootout.home);
  const awayGoals = shootoutScore(shootout.away);
  const takerName = shootout.turn === "home" ? homeClub.shortName : awayClub.shortName;

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#0b1410]/95 px-4 text-background">
      <div className="text-[11px] font-bold uppercase tracking-[0.42em] text-background/50">
        Penalty Shootout
      </div>

      {/* Score line */}
      <div className="mt-3 flex items-center gap-4 font-mono text-4xl font-black tabular-nums">
        <span style={{ color: homeClub.primaryColor }}>{homeClub.shortName}</span>
        <span>{homeGoals}</span>
        <span className="opacity-40">-</span>
        <span>{awayGoals}</span>
        <span style={{ color: awayClub.primaryColor }}>{awayClub.shortName}</span>
      </div>

      {/* Round dots */}
      <div className="mt-4 space-y-1.5">
        <KickRow label={homeClub.shortName} results={shootout.home} />
        <KickRow label={awayClub.shortName} results={shootout.away} />
      </div>

      {/* Goal mouth */}
      <div className="relative mt-6 h-48 w-full max-w-lg rounded-md border-4 border-background/80 bg-[#12241b]">
        {/* Net grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        {/* Keeper (only revealed with the result) */}
        {result && (
          <div
            className="absolute h-14 w-10 -translate-x-1/2 translate-y-1/2 rounded-sm bg-[#f7c948] shadow-lg transition-all duration-200"
            style={{
              left: `${((result.guess.x + 1) / 2) * 100}%`,
              bottom: `${Math.max(0, Math.min(1, result.guess.y)) * 78}%`,
            }}
          />
        )}
        {/* Ball / reticle */}
        <div
          className="absolute h-6 w-6 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-[#0d1a12] bg-background shadow-lg"
          style={{
            left: `${(((result ? result.aim.x : aim.x) + 1) / 2) * 100}%`,
            bottom: `${(result ? result.aim.y : aim.y) * 78}%`,
          }}
        />
        {result && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="rounded-md bg-[#0d1a12]/80 px-5 py-2 font-sans text-3xl font-black tracking-[0.1em]"
              style={{ color: result.outcome === "goal" ? "#63d68a" : "#ff7a6a" }}
            >
              {OUTCOME_LABEL[result.outcome]}
            </span>
          </div>
        )}
      </div>

      {/* Power meter */}
      <div className="mt-4 h-3 w-full max-w-lg overflow-hidden rounded-full bg-background/15">
        <div
          className="h-full rounded-full bg-[#63d68a] transition-[width] duration-75"
          style={{ width: `${power * 100}%` }}
        />
      </div>

      {shootout.winner ? (
        <div className="mt-6 text-center">
          <div className="font-sans text-4xl font-black uppercase tracking-[0.1em] text-[#63d68a]">
            {shootout.winner === "home" ? homeClub.name : awayClub.name} win
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-background/60">
            {homeGoals} - {awayGoals} on penalties
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="pointer-events-auto mt-6 rounded-md bg-[#63d68a] px-6 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#0d1a12]"
            >
              Main menu
            </button>
          )}
        </div>
      ) : (
        <p className="mt-5 max-w-md text-center text-xs leading-relaxed text-background/60">
          <span className="font-bold text-background/90">
            {takerName} to take {shootout.round > PENALTY_TUNING.rounds ? "(sudden death)" : `— kick ${shootout.round} of ${PENALTY_TUNING.rounds}`}
          </span>
          <br />
          {isHomeTurn
            ? "Arrows / WASD aim · hold Space for power · release to strike"
            : "Waiting for the opponent…"}
        </p>
      )}
    </div>
  );
}

function KickRow({ label, results }: { label: string; results: PenaltyOutcome[] }) {
  const slots = Math.max(PENALTY_TUNING.rounds, results.length);
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right font-mono text-[10px] uppercase tracking-widest text-background/50">
        {label}
      </span>
      {Array.from({ length: slots }, (_, i) => {
        const r = results[i];
        return (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border ${
              r === "goal"
                ? "border-[#63d68a] bg-[#63d68a]"
                : r
                  ? "border-[#ff7a6a] bg-[#ff7a6a]/30"
                  : "border-background/25"
            }`}
          />
        );
      })}
    </div>
  );
}
