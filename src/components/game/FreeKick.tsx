import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "../../game/store/useGameStore";
import { getClub } from "../../game/data/clubs";
import { DIFFICULTY_TUNING } from "../../game/logic/ai/difficulty";
import { playKick, playWhistle } from "../../game/logic/audio";
import { ExitConfirm } from "./ExitConfirm";
import type { PenaltyAim } from "../../game/logic/penalties";
import {
  applyFreeKick,
  buildWall,
  freeKickScore,
  FREEKICK_LEVEL_TUNING,
  FREEKICK_LEVELS,
  FREEKICK_TUNING,
  initFreeKickSet,
  keeperGuessFK,
  resolveFreeKick,
  type FreeKickLevel,
  type FreeKickOutcome,
} from "../../game/logic/freekicks";

const FLIGHT_MS = { slow: 700, fast: 380 };
const RESULT_HOLD = 1.4;

const OUTCOME_LABEL: Record<FreeKickOutcome, string> = {
  goal: "GOAL!",
  saved: "SAVED!",
  wall: "OFF THE WALL!",
  miss: "WIDE!",
};

/** Goal geometry inside the scene box, in % of the box. */
const GOAL = { left: 16, right: 84, top: 6, height: 50 } as const;
const GOAL_FLOOR = 100 - (GOAL.top + GOAL.height);
const SPOT = { x: 50, y: 5 };
/** The wall sits between the spot and the goal, so a little above the spot. */
const WALL_Y = GOAL_FLOOR - 9;

const toScene = (p: PenaltyAim) => ({
  x: 50 + p.x * ((GOAL.right - GOAL.left) / 2) * 0.92,
  y: GOAL_FLOOR + Math.max(0, Math.min(1, p.y)) * (GOAL.height - 8),
});

type BallPose = { x: number; y: number; scale: number; ms: number; curve: number };
const ballAtSpot = (): BallPose => ({ x: SPOT.x, y: SPOT.y, scale: 1, ms: 0, curve: 0 });

/**
 * Free-kick practice — an arcade aim / bend / power mini-game against a
 * defensive wall and a diving keeper. All outcome maths lives in
 * game/logic/freekicks.ts; this component only drives input and presentation.
 */
export function FreeKick({ onExit }: { onExit?: (() => void) | undefined }) {
  const difficulty = useGameStore((s) => s.difficulty);
  const homeClub = getClub(useGameStore((s) => s.homeClubId));
  const awayClub = getClub(useGameStore((s) => s.awayClubId));

  const [fkLevel, setFkLevel] = useState<FreeKickLevel>("normal");
  const level = FREEKICK_LEVEL_TUNING[fkLevel];

  const [set, setSet] = useState(initFreeKickSet);
  const [wallSide, setWallSide] = useState<-1 | 1>(-1);
  const wall = buildWall(wallSide, fkLevel);

  const [aim, setAim] = useState<PenaltyAim>({ x: 0.3, y: 0.5 });
  const [curve, setCurve] = useState(0);
  const [power, setPower] = useState(0);
  const [ball, setBall] = useState<BallPose>(ballAtSpot);
  const [keeper, setKeeper] = useState({ x: 50, y: GOAL_FLOOR, tilt: 0 });
  const [outcome, setOutcome] = useState<FreeKickOutcome | null>(null);
  const [netShake, setNetShake] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const held = useRef<Set<string>>(new Set());
  const aimRef = useRef(aim);
  const curveRef = useRef(curve);
  const powerRef = useRef(0);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  aimRef.current = aim;
  curveRef.current = curve;

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

  const take = useCallback(
    (kickAim: PenaltyAim, kickCurve: number, kickPower: number) => {
      if (busy.current) return;
      busy.current = true;
      const guess = keeperGuessFK(kickAim, keeperAccuracy);
      const shot = resolveFreeKick(kickAim, kickPower, kickCurve, guess, wall, level.keeperReachScale);
      const p = Math.max(0, Math.min(1, kickPower));
      const flight = Math.round(FLIGHT_MS.slow + (FLIGHT_MS.fast - FLIGHT_MS.slow) * p);

      playKick(kickPower);
      setPower(0);
      powerRef.current = 0;

      const dive = toScene(guess);
      setKeeper({ x: dive.x, y: dive.y, tilt: guess.x < -0.12 ? -70 : guess.x > 0.12 ? 70 : 0 });

      const target =
        shot === "miss"
          ? { x: 50 + kickAim.x * 60, y: GOAL_FLOOR + Math.max(kickAim.y, 0.4) * (GOAL.height + 24) }
          : shot === "wall"
            ? { x: toScene({ x: wall.x, y: 0 }).x, y: WALL_Y + 6 }
            : shot === "saved"
              ? dive
              : toScene(kickAim);
      const flightMs = shot === "wall" ? Math.round(flight * 0.5) : flight;
      setBall({ x: target.x, y: target.y, scale: 0.55, ms: flightMs, curve: kickCurve });

      after(flightMs, () => {
        setOutcome(shot);
        if (shot === "goal") {
          setNetShake(true);
          after(260, () => setNetShake(false));
          setBall((b) => ({ ...b, y: Math.max(GOAL_FLOOR + 2, b.y - 10), scale: 0.5, ms: 320 }));
        } else if (shot === "saved") {
          const side = dive.x < 50 ? -1 : 1;
          setBall({ x: 50 + side * 44, y: GOAL_FLOOR - 4, scale: 0.8, ms: 460, curve: 0 });
        } else if (shot === "wall") {
          setBall((b) => ({ ...b, y: SPOT.y + 4, scale: 0.9, ms: 420, curve: 0 }));
        }
      });

      after(flightMs + RESULT_HOLD * 1000, () => {
        const next = applyFreeKick(set, shot);
        setSet(next);
        setOutcome(null);
        setAim({ x: 0.3, y: 0.5 });
        setCurve(0);
        setBall(ballAtSpot());
        setKeeper({ x: 50, y: GOAL_FLOOR, tilt: 0 });
        setWallSide((s) => (s === -1 ? 1 : -1));
        busy.current = false;
        if (next.done) playWhistle();
      });
    },
    [keeperAccuracy, level.keeperReachScale, set, wall],
  );

  const canKick = !set.done;

  // --- input: arrows/WASD aim, Z/X bend, Space charge & release ---
  const takeRef = useRef(take);
  takeRef.current = take;
  const canKickRef = useRef(canKick);
  canKickRef.current = canKick;
  const levelRef = useRef(level);
  levelRef.current = level;

  const release = useCallback(() => {
    if (powerRef.current > 0 && !busy.current && canKickRef.current) {
      takeRef.current(aimRef.current, curveRef.current, powerRef.current);
    }
    powerRef.current = 0;
    setPower(0);
  }, []);

  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === "Space" || e.key === " " || e.key === "Spacebar";
    const down = (e: KeyboardEvent) => {
      held.current.add(e.code || e.key);
      if (isSpace(e)) {
        held.current.add("Space");
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      held.current.delete(e.code || e.key);
      if (isSpace(e)) {
        held.current.delete("Space");
        release();
      }
    };
    const blur = () => held.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [release]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const lv = levelRef.current;
      if (canKickRef.current && !busy.current) {
        const h = held.current;
        const dx =
          (h.has("ArrowRight") || h.has("KeyD") ? 1 : 0) - (h.has("ArrowLeft") || h.has("KeyA") ? 1 : 0);
        const dy =
          (h.has("ArrowUp") || h.has("KeyW") ? 1 : 0) - (h.has("ArrowDown") || h.has("KeyS") ? 1 : 0);
        if (dx !== 0 || dy !== 0) {
          setAim((a) => ({
            x: Math.max(-1, Math.min(1, a.x + dx * lv.aimSpeed.x * dt)),
            y: Math.max(0, Math.min(1, a.y + dy * lv.aimSpeed.y * dt)),
          }));
        }
        const dc = (h.has("KeyX") ? 1 : 0) - (h.has("KeyZ") ? 1 : 0);
        if (dc !== 0) {
          setCurve((c) => Math.max(-1, Math.min(1, c + dc * lv.curveSpeed * dt)));
        }
        if (h.has("Space")) {
          powerRef.current = Math.min(1, powerRef.current + dt / lv.powerTime);
          setPower(powerRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);


  const goals = freeKickScore(set.results);
  const reticle = toScene(aim);
  const wallLeft = toScene({ x: wall.x - wall.halfWidth, y: 0 }).x;
  const wallRight = toScene({ x: wall.x + wall.halfWidth, y: 0 }).x;

  const restart = () => {
    setSet(initFreeKickSet());
    setOutcome(null);
    setBall(ballAtSpot());
    setPower(0);
    powerRef.current = 0;
    busy.current = false;
  };

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
        Free Kicks
      </div>

      <div className="mt-3 flex flex-col items-center gap-1">
        <div className="flex gap-1.5">
          {FREEKICK_LEVELS.map((lv) => {
            const active = lv === fkLevel;
            return (
              <button
                key={lv}
                onClick={() => setFkLevel(lv)}
                className={`rounded-md border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                  active
                    ? "border-background/70 bg-background/15 text-background"
                    : "border-background/20 text-background/55 hover:bg-background/10"
                }`}
              >
                {FREEKICK_LEVEL_TUNING[lv].label}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-background/40">{level.blurb}</div>
      </div>

      <div className="mt-2 flex items-center gap-4 font-mono text-4xl font-black tabular-nums">
        <span style={{ color: homeClub.primaryColor }}>{homeClub.shortName}</span>
        <span>{goals}</span>
        <span className="opacity-40">/</span>
        <span>{FREEKICK_TUNING.attempts}</span>
        <span className="text-base opacity-50" style={{ color: awayClub.primaryColor }}>
          vs {awayClub.shortName}
        </span>
      </div>

      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: FREEKICK_TUNING.attempts }).map((_, i) => {
          const r = set.results[i];
          return (
            <span
              key={i}
              className="h-3 w-3 rounded-full"
              style={{
                backgroundColor:
                  r === "goal"
                    ? "#63d68a"
                    : r
                      ? "#ff7a6a"
                      : "rgba(255,255,255,0.18)",
              }}
            />
          );
        })}
      </div>

      {/* ---- the kick ---- */}
      <div
        className="relative mt-5 h-64 w-full max-w-2xl overflow-hidden rounded-lg border border-background/10"
        style={{ background: "linear-gradient(#1b3a27 0%, #22482f 45%, #2c5a3a 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0 14px, transparent 14px 28px)",
          }}
        />

        {/* Goal frame + net */}
        <div
          className="absolute rounded-t-sm border-[6px] border-b-0 border-background/90"
          style={{
            left: `${GOAL.left}%`,
            right: `${100 - GOAL.right}%`,
            top: `${GOAL.top}%`,
            height: `${GOAL.height}%`,
            background: "rgba(9,20,14,0.55)",
            transform: netShake ? "scale(1.012)" : "scale(1)",
            transition: "transform 120ms ease-out",
          }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />
        </div>

        {/* Keeper */}
        <div
          className="absolute -translate-x-1/2"
          style={{
            left: `${keeper.x}%`,
            bottom: `${keeper.y}%`,
            transform: `translateX(-50%) rotate(${keeper.tilt}deg)`,
            transition:
              "left 240ms cubic-bezier(.2,.7,.3,1), bottom 240ms cubic-bezier(.2,.7,.3,1), transform 240ms ease-out",
          }}
        >
          <div className="h-4 w-4 rounded-full bg-[#f7c948] shadow" />
          <div className="mx-auto h-10 w-7 rounded-sm bg-[#f7c948] shadow-lg" />
          <div className="mx-auto h-4 w-5 rounded-b-sm bg-[#1f2a24]" />
        </div>

        {/* Defensive wall */}
        <div
          className="absolute flex items-end gap-1"
          style={{
            left: `${wallLeft}%`,
            width: `${wallRight - wallLeft}%`,
            bottom: `${WALL_Y}%`,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1">
              <div
                className="mx-auto h-3 w-3 rounded-full"
                style={{ backgroundColor: awayClub.secondaryColor ?? "#e8e8e8" }}
              />
              <div
                className="mx-auto w-full rounded-sm shadow-lg"
                style={{
                  height: `${18 + level.wallHeight * 26}px`,
                  backgroundColor: awayClub.primaryColor,
                }}
              />
            </div>
          ))}
        </div>

        {/* Spot */}
        <div
          className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-background/60"
          style={{ left: `${SPOT.x}%`, bottom: `${SPOT.y}%` }}
        />

        {/* Aim reticle */}
        {canKick && !outcome && !busy.current && (
          <div
            className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-dashed border-[#63d68a]"
            style={{ left: `${reticle.x}%`, bottom: `${reticle.y}%` }}
          />
        )}

        {/* Ball — bend shows as a lateral skew during flight */}
        <div
          className="absolute h-5 w-5 -translate-x-1/2 translate-y-1/2 rounded-full bg-background shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
          style={{
            left: `${ball.x}%`,
            bottom: `${ball.y}%`,
            transform: `translate(-50%, 50%) scale(${ball.scale})`,
            transition: ball.ms
              ? `left ${ball.ms}ms cubic-bezier(${ball.curve > 0 ? ".8,.05,.4,1" : ball.curve < 0 ? ".2,.9,.6,1" : ".3,.1,.5,1"}), bottom ${ball.ms}ms cubic-bezier(.3,.1,.5,1), transform ${ball.ms}ms linear`
              : "none",
          }}
        />

        {outcome && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              className="rounded-md bg-[#0d1a12]/85 px-6 py-2 font-sans text-3xl font-black tracking-[0.1em]"
              style={{ color: outcome === "goal" ? "#63d68a" : "#ff7a6a" }}
            >
              {OUTCOME_LABEL[outcome]}
            </span>
          </div>
        )}
      </div>

      {/* Curve dial */}
      <div className="mt-4 w-full max-w-2xl">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-background/40">
          <span>Bend left (Z)</span>
          <span>Bend right (X)</span>
        </div>
        <div className="relative mt-1 h-2 rounded-full bg-background/15">
          <div className="absolute left-1/2 top-0 h-full w-px bg-background/40" />
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8fd8ff]"
            style={{ left: `${50 + curve * 50}%` }}
          />
        </div>
      </div>

      {/* Power meter */}
      <div className="mt-3 h-3 w-full max-w-2xl overflow-hidden rounded-full bg-background/15">
        <div
          className="h-full rounded-full bg-[#63d68a] transition-[width] duration-75"
          style={{ width: `${power * 100}%` }}
        />
      </div>

      {set.done ? (
        <div className="mt-5 text-center">
          <div className="font-sans text-4xl font-black uppercase tracking-[0.1em] text-[#63d68a]">
            {goals} of {FREEKICK_TUNING.attempts} scored
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={restart}
              className="pointer-events-auto rounded-md bg-[#63d68a] px-6 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#0d1a12]"
            >
              Take five more
            </button>
            {onExit && (
              <button
                onClick={onExit}
                className="pointer-events-auto rounded-md border border-background/30 px-6 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-background/70"
              >
                Main menu
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 max-w-md text-center text-xs leading-relaxed text-background/60">
          <span className="font-bold text-background/90">
            Kick {set.results.length + 1} of {FREEKICK_TUNING.attempts}.
          </span>{" "}
          Aim with the arrows or WASD, bend it with Z / X, hold Space for power and release to
          strike. Go over the wall or curl it round.
        </p>
      )}
    </div>
  );
}
