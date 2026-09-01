const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-background/30 bg-background/15 px-1.5 py-0.5 font-semibold tracking-wide">
    {children}
  </kbd>
);

const Row = ({ keys, label }: { keys: string; label: string }) => (
  <div className="flex items-center gap-2 whitespace-nowrap">
    <Key>{keys}</Key>
    <span className="opacity-80">{label}</span>
  </div>
);

export function ControlsHint() {
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 rounded-lg bg-foreground/75 px-3 py-2.5 font-mono text-xs text-background shadow-lg backdrop-blur-sm">
      <div className="mb-1.5 text-[10px] uppercase tracking-widest opacity-60">Controls</div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1">
        <Row keys="WASD / Arrows" label="move" />
        <Row keys="Shift" label="sprint" />
        <Row keys="Space" label="shoot (hold to charge)" />
        <Row keys="E" label="PASS" />
        <Row keys="Ctrl" label="loft (hold with shoot/pass)" />
        <Row keys="F" label="slide tackle" />
        <Row keys="Q" label="switch player" />
        <Row keys="C" label="camera" />
      </div>
    </div>
  );
}
