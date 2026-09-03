import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "../../game/store/useGameStore";
import { getClub } from "../../game/data/clubs";
import { DIFFICULTY_TUNING } from "../../game/logic/ai/difficulty";
import { playKick, playWhistle } from "../../game/logic/audio";
import { ExitConfirm } from "./ExitConfirm";
import { SetPiece3DScene } from "./SetPiece3DScene";
import {
  applyPenalty,
  keeperGuess,
  PENALTY_LEVEL_TUNING,
  PENALTY_LEVELS,
  PENALTY_TUNING,
  resolvePenalty,
  shootoutScore,
  type PenaltyAim,
  type PenaltyLevel,
  type PenaltyOutcome,
} from "../../game/logic/penalties";

/**
 * How fast the reticle slides across the goal, in normalized units per
 * second. Slowed down from the first pass — the reticle used to shoot past
 * the corner you were aiming for before you could release.
 */
/** Ball flight, in ms, at zero power — a hard strike arrives quicker. */
const FLIGHT_MS = { slow: 620, fast: 320 };
/** How long the finished kick stays on screen before the next taker. */
const RESULT_HOLD = 1.5;

const OUTCOME_LABEL: Record<PenaltyOutcome, string> = {
  goal: "GOAL!",
  saved: "SAVED!",
  miss: "MISSED!",
};

/** Geometry of the goal inside the scene box, in % of the box. */
const GOAL = { left: 14, right: 86, top: 6, height: 52 } as const;
const GOAL_FLOOR = 100 - (GOAL.top + GOAL.height); // bottom% of the goal line
const SPOT = { x: 50, y: 7 }; // penalty spot, bottom%

/** Where an in-goal aim/dive point sits in scene coordinates. */
const toScene = (p: PenaltyAim) => ({
  x: 50 + p.x * ((GOAL.right - GOAL.left) / 2) * 0.92,
  y: GOAL_FLOOR + Math.max(0, Math.min(1, p.y)) * (GOAL.height - 8),
});

type BallPose = { x: number; y: number; scale: number; ms: number };

const ballAtSpot = (): BallPose => ({ x: SPOT.x, y: SPOT.y, scale: 1, ms: 0 });

/**
 * Penalty shootout overlay — an arcade aim-and-power mini-game with a real
 * shot: the ball flies at the goal, the keeper dives at their guess, and
 * saves are punched clear. All outcome maths lives in
 * game/logic/penalties.ts; this component only drives input and presentation.
 */
export function PenaltyShootout({ onExit }: { onExit?: (() => void) | undefined }) {
  const shootout = useGameStore((s) => s.shootout);
  const setShootout = useGameStore((s) => s.setShootout);
  const difficulty = useGameStore((s) => s.difficulty);
  const penaltyLevel = useGameStore((s) => s.penaltyLevel);
  const setPenaltyLevel = useGameStore((s) => s.setPenaltyLevel);
  const level = PENALTY_LEVEL_TUNING[penaltyLevel];
  const homeClub = getClub(useGameStore((s) => s.homeClubId));
  const awayClub = getClub(useGameStore((s) => s.awayClubId));

  const [aim, setAim] = useState<PenaltyAim>({ x: 0, y: 0.45 });
  const [power, setPower] = useState(0);
  const [ball, setBall] = useState<BallPose>(ballAtSpot);
  const [keeper, setKeeper] = useState<{ x: number; y: number; tilt: number }>({
    x: 50,
    y: GOAL_FLOOR,
    tilt: 0,
  });
  const [outcome, setOutcome] = useState<PenaltyOutcome | null>(null);
  const [netShake, setNetShake] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  /** Flipped to trigger the 3D run-up animation each kick. */
  const [kickTrigger, setKickTrigger] = useState(false);

  const held = useRef<Set<string>>(new Set());
  const aimRef = useRef(aim);
  const powerRef = useRef(0);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  aimRef.current = aim;

  const isHomeTurn = shootout.turn === "home" && !shootout.winner;
  const takerSide = shootout.turn;
  // Keeper reads your aim far less well than an outfield AI reads a shot —
  // the shootout is meant to be winnable, not a coin flip against a wall.
  const keeperAccuracy = DIFFICULTY_TUNING[difficulty].shotAccuracy * level.keeperAccuracy;

  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  /** Resolves one kick, plays it out on screen, then hands over to the next taker. */
  const take = useCallback(
    (kickAim: PenaltyAim, kickPower: number) => {
      if (busy.current) return;
      busy.current = true;
      // Fire the 3D run-up animation — alternates true/false so it re-triggers.
      setKickTrigger((t) => !t);
      const guess = keeperGuess(kickAim, keeperAccuracy);
      const shot = resolvePenalty(kickAim, kickPower, guess, level.keeperReachScale);
      const p = Math.max(0, Math.min(1, kickPower));
      const flight = Math.round(FLIGHT_MS.slow + (FLIGHT_MS.fast - FLIGHT_MS.slow) * p);

      playKick(kickPower);
      setPower(0);
      powerRef.current = 0;

      // Keeper commits the instant the ball is struck.
      const dive = toScene(guess);
      setKeeper({ x: dive.x, y: dive.y, tilt: guess.x < -0.12 ? -70 : guess.x > 0.12 ? 70 : 0 });

      // Ball flight: the target depends on what actually happens to it.
      const target =
        shot === "miss"
          ? {
              x: 50 + kickAim.x * 62,
              y: GOAL_FLOOR + Math.max(kickAim.y, 0.4) * (GOAL.height + 26),
            }
          : shot === "saved"
            ? dive
            : toScene(kickAim);
      setBall({ x: target.x, y: target.y, scale: 0.55, ms: flight });
      // Hand the same numbers to the 3D scene so its ball flies the identical
      // path (no bend on a penalty) and the keeper dives within the flight.
      setKick3d({
        id: kickSeq.current++,
        aim: kickAim,
        curve: 0,
        power: p,
        outcome: shot,
        flightMs: flight,
        keeperTarget: guess,
      });


      after(flight, () => {
        setOutcome(shot);
        if (shot === "goal") {
          setNetShake(true);
          after(260, () => setNetShake(false));
          // Ball drops into the back of the net.
          setBall((b) => ({ ...b, y: Math.max(GOAL_FLOOR + 2, b.y - 12), scale: 0.5, ms: 320 }));
        } else if (shot === "saved") {
          // Punched clear — away to the side the keeper dived from.
          const side = dive.x < 50 ? -1 : 1;
          setBall({ x: 50 + side * 46, y: GOAL_FLOOR - 6, scale: 0.8, ms: 460 });
        }
      });

      after(flight + RESULT_HOLD * 1000, () => {
        const next = applyPenalty(useGameStore.getState().shootout, shot);
        setShootout(next);
        setOutcome(null);
        setAim({ x: 0, y: 0.45 });
        setBall(ballAtSpot());
        setKick3d(null);

        setKeeper({ x: 50, y: GOAL_FLOOR, tilt: 0 });
        busy.current = false;
        if (next.winner) playWhistle();
      });
    },
    [keeperAccuracy, level.keeperReachScale, setShootout],
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
            x: Math.max(-1, Math.min(1, a.x + dx * level.aimSpeed.x * dt)),
            y: Math.max(0, Math.min(1, a.y + dy * level.aimSpeed.y * dt)),
          }));
        }
        if (h.has("Space")) {
          powerRef.current = Math.min(1, powerRef.current + dt / level.powerTime);
          setPower(powerRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isHomeTurn, level]);

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
      setAim(aiAim);
      take(aiAim, 0.5 + Math.random() * 0.5);
    }, 900);
    return () => window.clearTimeout(t);
  }, [shootout.turn, shootout.round, shootout.winner, difficulty, take]);

  const homeGoals = shootoutScore(shootout.home);
  const awayGoals = shootoutScore(shootout.away);
  const takerClub = takerSide === "home" ? homeClub : awayClub;
  const reticle = toScene(aim);

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-[#0b1410]/97 px-4 py-6 text-background">
      {onExit && (
        <button
          onClick={() => setShowExitConfirm(true)}
          className="absolute right-4 top-4 rounded-md border border-background/30 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-background/70 transition-colors hover:bg-background/10"
        >
          End game
        </button>
      )}

      <ExitConfirm
        open={showExitConfirm}
        onResume={() => setShowExitConfirm(false)}
        onExit={() => {
          setShowExitConfirm(false);
          onExit?.();
        }}
      />

      <div className="text-[11px] font-bold uppercase tracking-[0.42em] text-background/50">
        Penalty Shootout
      </div>

      {/* Shootout difficulty: keeper reading and power-window width */}
      <div className="mt-3 flex flex-col items-center gap-1">
        <div className="flex gap-1.5">
          {PENALTY_LEVELS.map((lv) => {
            const active = lv === penaltyLevel;
            return (
              <button
                key={lv}
                onClick={() => setPenaltyLevel(lv)}
                className={`rounded-md border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                  active
                    ? "border-background/70 bg-background/15 text-background"
                    : "border-background/20 text-background/55 hover:bg-background/10"
                }`}
              >
                {PENALTY_LEVEL_TUNING[lv].label}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-background/40">{level.blurb}</div>
      </div>

      {/* Score line */}
      <div className="mt-2 flex items-center gap-4 font-mono text-4xl font-black tabular-nums">
        <span style={{ color: homeClub.primaryColor }}>{homeClub.shortName}</span>
        <span>{homeGoals}</span>
        <span className="opacity-40">-</span>
        <span>{awayGoals}</span>
        <span style={{ color: awayClub.primaryColor }}>{awayClub.shortName}</span>
      </div>

      {/* Round dots */}
      <div className="mt-3 space-y-1.5">
        <KickRow label={homeClub.shortName} results={shootout.home} active={takerSide === "home" && !shootout.winner} />
        <KickRow label={awayClub.shortName} results={shootout.away} active={takerSide === "away" && !shootout.winner} />
      </div>

      {/* ---- the shot itself ---- */}
      <div
        className="relative mt-5 h-64 w-full max-w-2xl overflow-hidden rounded-lg border border-background/10"
        style={{
          background:
            "linear-gradient(#1b3a27 0%, #22482f 45%, #2c5a3a 100%)",
        }}
      >
        {/* 3D POV scene — goal with animated keeper */}
        <SetPiece3DScene
          defenderColor={awayClub.primaryColor}
          keeperDiveTarget={
            keeper.tilt !== 0 || keeper.x !== 50
              ? {
                  x: (keeper.x - 50) / 36,
                  y: Math.max(0, (keeper.y - GOAL_FLOOR) / (GOAL.height - 8)),
                }
              : null
          }
        />

        {/* Mown stripes overlay — purely cosmetic, sits above the 3D scene */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0 14px, transparent 14px 28px)",
            zIndex: 1,
          }}
        />

        {/* Aim reticle (human taker only, before the strike) */}
        {isHomeTurn && !outcome && !busy.current && (
          <div
            className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-dashed border-[#63d68a]"
            style={{ left: `${reticle.x}%`, bottom: `${reticle.y}%`, zIndex: 2, boxShadow: "0 0 8px rgba(99,214,138,0.5)" }}
          />
        )}

        {/* Ball is rendered in 3D by SetPiece3DScene */}


        {/* Outcome stamp */}
        {outcome && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
            <span
              className="rounded-md bg-[#0d1a12]/85 px-6 py-2 font-sans text-3xl font-black tracking-[0.1em]"
              style={{ color: outcome === "goal" ? "#63d68a" : "#ff7a6a" }}
            >
              {OUTCOME_LABEL[outcome]}
            </span>
          </div>
        )}
      </div>

      {/* Power meter — prominent, always visible before and during a kick */}
      <div className="mt-4 w-full max-w-2xl">
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-background/50">
          <span>Power — hold Space / button</span>
          <span className="tabular-nums text-background/80">{Math.round(power * 100)}%</span>
        </div>
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-background/15">
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${power * 100}%`,
              background: power < 0.5 ? "#63d68a" : power < 0.8 ? "#f5c518" : "#e83a3a",
            }}
          />
        </div>
      </div>

      {shootout.winner ? (
        <div className="mt-5 text-center">
          <div className="font-sans text-4xl font-black uppercase tracking-[0.1em] text-[#63d68a]">
            {shootout.winner === "home" ? homeClub.name : awayClub.name} win
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-background/60">
            {homeGoals} - {awayGoals} on penalties
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="pointer-events-auto mt-5 rounded-md bg-[#63d68a] px-6 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#0d1a12]"
            >
              Main menu
            </button>
          )}
        </div>
      ) : (
        <p className="mt-4 max-w-md text-center text-xs leading-relaxed text-background/60">
          <span className="font-bold text-background/90">
            {takerClub.shortName} to take{" "}
            {shootout.round > PENALTY_TUNING.rounds
              ? "(sudden death)"
              : `— kick ${shootout.round} of ${PENALTY_TUNING.rounds}`}
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

function KickRow({
  label,
  results,
  active,
}: {
  label: string;
  results: PenaltyOutcome[];
  active: boolean;
}) {
  const slots = Math.max(PENALTY_TUNING.rounds, results.length);
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-14 text-right font-mono text-[10px] uppercase tracking-widest ${
          active ? "text-[#63d68a]" : "text-background/50"
        }`}
      >
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
