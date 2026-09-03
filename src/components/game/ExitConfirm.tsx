import { useEffect } from "react";

export function ExitConfirm({
  open,
  onResume,
  onExit,
}: {
  open: boolean;
  onResume: () => void;
  onExit: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onResume();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onResume]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1410]/90 px-4">
      <div className="w-full max-w-sm rounded-lg bg-background p-6 text-foreground shadow-2xl">
        <h2 className="text-center font-sans text-2xl font-black uppercase tracking-[0.12em]">
          Leave match?
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-foreground/70">
          Your current progress will be lost.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={onResume}
            className="rounded-md border border-foreground/30 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] text-foreground/80 transition-colors hover:bg-foreground/10"
          >
            Resume match
          </button>
          <button
            onClick={onExit}
            className="rounded-md bg-foreground px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] text-background transition-colors hover:bg-foreground/90"
          >
            Go to main menu
          </button>
        </div>
      </div>
    </div>
  );
}
