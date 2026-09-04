import { useGameStore } from "../../game/store/useGameStore";
import { FIELD } from "../../game/logic/field";

/**
 * Toggleable developer overlay. Draws a top-down mini-pitch with the last
 * set-piece's ball spot, taker position and aim vector, plus the raw numbers,
 * so set-piece placement can be verified without instrumenting the 3D scene.
 */
export function SetPieceDebugOverlay() {
  const on = useGameStore((s) => s.debugOverlay);
  const toggle = useGameStore((s) => s.toggleDebugOverlay);
  const debug = useGameStore((s) => s.debugSetPiece);

  const W = 220;
  const H = (W * FIELD.width) / FIELD.length;
  const px = (x: number) => ((x + FIELD.halfLength) / FIELD.length) * W;
  const pz = (z: number) => ((z + FIELD.halfWidth) / FIELD.width) * H;
  const fmt = (p: { x: number; z: number }) => `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`;

  return (
    <>
      <button
        onClick={toggle}
        className={`fixed left-4 top-[68px] z-30 rounded-md px-3 py-1.5 font-sans text-[9px] font-black uppercase tracking-[0.22em] shadow-lg backdrop-blur-sm transition-colors ${
          on ? "bg-emerald-500 text-white" : "bg-foreground/70 text-background/80"
        }`}
      >
        Debug
      </button>

      {on && (
        <div className="pointer-events-none fixed bottom-24 left-4 z-30 rounded-lg bg-foreground/85 p-3 font-mono text-[10px] text-background shadow-xl backdrop-blur-sm">
          <div className="mb-2 font-sans text-[9px] font-black uppercase tracking-[0.22em] text-background/60">
            Set-piece debug
          </div>
          <svg width={W} height={H} className="rounded bg-emerald-900/60">
            <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="rgba(255,255,255,0.35)" />
            <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgba(255,255,255,0.25)" />
            {debug && (
              <>
                <line
                  x1={px(debug.spot.x)}
                  y1={pz(debug.spot.z)}
                  x2={px(debug.aimAt.x)}
                  y2={pz(debug.aimAt.z)}
                  stroke="#fbbf24"
                  strokeDasharray="4 3"
                />
                <line
                  x1={px(debug.takerPos.x)}
                  y1={pz(debug.takerPos.z)}
                  x2={px(debug.spot.x)}
                  y2={pz(debug.spot.z)}
                  stroke="#38bdf8"
                />
                <circle cx={px(debug.spot.x)} cy={pz(debug.spot.z)} r={3} fill="#ffffff" />
                <circle cx={px(debug.takerPos.x)} cy={pz(debug.takerPos.z)} r={4} fill="#38bdf8" />
                <circle cx={px(debug.aimAt.x)} cy={pz(debug.aimAt.z)} r={3} fill="#fbbf24" />
              </>
            )}
          </svg>
          {debug ? (
            <dl className="mt-2 space-y-0.5">
              <Row k="type" v={`${debug.type} (${debug.team})`} />
              <Row k="ball spot" v={fmt(debug.spot)} />
              <Row k="taker" v={`#${debug.takerIndex} @ ${fmt(debug.takerPos)}`} />
              <Row k="aim" v={fmt(debug.aimAt)} />
            </dl>
          ) : (
            <div className="mt-2 text-background/50">No set piece yet</div>
          )}
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-background/50">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
