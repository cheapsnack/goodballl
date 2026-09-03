import { useEffect, useState } from "react";
import { useGameStore } from "../../game/store/useGameStore";

const CONTROLS: Array<[string, string]> = [
  ["WASD / Arrows", "Move"],
  ["Shift", "Sprint"],
  ["Space", "Shoot (hold to charge)"],
  ["E", "Pass"],
  ["Ctrl", "Loft modifier"],
  ["F", "Slide tackle"],
  ["Q", "Switch player"],
  ["C", "Camera view"],
  ["Esc", "Close options"],
];

/**
 * Top-left Options button. Opening it pauses the match simulation
 * (MatchScene's frame loop bails out while `paused` is true).
 */
export function OptionsPanel() {
  const paused = useGameStore((s) => s.paused);
  const setPaused = useGameStore((s) => s.setPaused);
  const [open, setOpen] = useState(false);

  const close = () => {
    setOpen(false);
    setPaused(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setPaused(true);
        }}
        className="fixed left-4 top-5 z-30 rounded-md bg-foreground/80 px-4 py-2 font-sans text-[10px] font-black uppercase tracking-[0.22em] text-background/80 shadow-lg backdrop-blur-sm transition-colors hover:text-background"
      >
        Options
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-2xl">
            <div className="flex items-baseline justify-between">
              <h2 className="font-sans text-sm font-black uppercase tracking-[0.22em] text-foreground">
                Controls
              </h2>
              {paused && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Paused
                </span>
              )}
            </div>

            <dl className="mt-5 space-y-2">
              {CONTROLS.map(([key, action]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <dt className="rounded bg-muted px-2 py-1 font-mono text-xs font-semibold text-foreground">
                    {key}
                  </dt>
                  <dd className="text-right text-sm text-muted-foreground">{action}</dd>
                </div>
              ))}
            </dl>

            <button
              onClick={close}
              className="mt-6 w-full rounded-md bg-primary px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.22em] text-primary-foreground transition-opacity hover:opacity-90"
            >
              Resume match
            </button>
          </div>
        </div>
      )}
    </>
  );
}
