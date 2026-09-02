import { useGameStore } from "../../game/store/useGameStore";

const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold">{children}</span>
);

const Sep = () => <span className="mx-2 opacity-40">|</span>;

export function ControlsHint() {
  const hasBookings = useGameStore((s) => s.bookings.length > 0);
  return (
    <div
      className={`pointer-events-none fixed left-4 rounded-md bg-foreground/70 px-3 py-2 font-mono text-xs text-background backdrop-blur-sm ${
        hasBookings ? "bottom-14" : "bottom-4"
      }`}
    >
      <Key>WASD / Arrows</Key> move
      <Sep />
      <Key>Shift</Key> sprint
      <Sep />
      <Key>Space</Key> shoot
      <Sep />
      <Key>E</Key> pass
      <Sep />
      <Key>Ctrl</Key> loft
      <span className="ml-2 opacity-60">(hold to charge)</span>
      <Sep />
      <Key>C</Key> camera
      <Sep />
      <Key>Q</Key> switch player
      <Sep />
      <Key>F</Key> tackle
    </div>
  );
}
