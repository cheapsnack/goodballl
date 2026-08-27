export function ControlsHint() {
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 rounded-md bg-foreground/70 px-3 py-2 font-mono text-xs text-background backdrop-blur-sm">
      <span className="font-semibold">WASD / Arrows</span> move
      <span className="mx-2 opacity-50">|</span>
      <span className="font-semibold">Shift</span> sprint
    </div>
  );
}
