import { useState } from "react";
import { initAudio, isAudioEnabled, setAudioEnabled } from "../../game/logic/audio";
import { MATCH_TUNING } from "../../game/logic/match";
import { CLUBS, DEFAULT_AWAY_CLUB_ID, DEFAULT_HOME_CLUB_ID } from "../../game/data/clubs";
import { useGameStore } from "../../game/store/useGameStore";

/**
 * Pre-match screen. Rendered instead of the Canvas so nothing simulates (and
 * no WebGL context is created) until the player commits — this also gives us
 * the user gesture WebAudio needs before it will make a sound.
 */
export function MainMenu({ onKickoff }: { onKickoff: () => void }) {
  const [sound, setSound] = useState(isAudioEnabled());
  const [homeId, setHomeId] = useState(DEFAULT_HOME_CLUB_ID);
  const [awayId, setAwayId] = useState(DEFAULT_AWAY_CLUB_ID);
  const setClubs = useGameStore((s) => s.setClubs);

  const start = () => {
    if (sound) initAudio();
    setAudioEnabled(sound);
    setClubs(homeId, awayId === homeId ? DEFAULT_AWAY_CLUB_ID : awayId);
    onKickoff();
  };

  const minutes = Math.round((MATCH_TUNING.periodSeconds * MATCH_TUNING.periods) / 60);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#0d1a12] text-background">
      {/* Faint pitch stripes behind the panel keep the sports feel pre-kickoff. */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, #2f7a3f 0 60px, #256533 60px 120px)",
        }}
      />
      <div className="relative w-full max-w-md px-8 py-10 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.42em] text-background/50">
          Kickoff Mode
        </div>
        <h1 className="mt-3 font-sans text-6xl font-black uppercase leading-none tracking-tight text-background">
          Arcade
          <br />
          <span className="text-[#63d68a]">Football</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-background/60">
          {MATCH_TUNING.periods} halves · {minutes} minutes · 11 v 11 · switch players with Q.
        </p>

        <ClubPicker label="Your Club" selectedId={homeId} onSelect={setHomeId} />
        <ClubPicker label="Opponent" selectedId={awayId} onSelect={setAwayId} />

        <button
          onClick={start}
          className="mt-8 w-full rounded-md bg-[#63d68a] px-6 py-4 font-sans text-lg font-black uppercase tracking-[0.2em] text-[#0d1a12] transition-transform hover:scale-[1.02] active:scale-[0.99]"
        >
          Kick Off
        </button>

        <button
          onClick={() => setSound((s) => !s)}
          className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-background/50 transition-colors hover:text-background/80"
        >
          Sound: {sound ? "On" : "Off"}
        </button>

        <div className="mt-10 grid grid-cols-2 gap-y-2 text-left font-mono text-[11px] text-background/50">
          <span>WASD / Arrows</span>
          <span>Move</span>
          <span>Shift</span>
          <span>Sprint</span>
          <span>Space (hold)</span>
          <span>Shoot</span>
          <span>E (hold)</span>
          <span>Pass</span>
          <span>Ctrl</span>
          <span>Loft</span>
          <span>C</span>
          <span>Toggle camera</span>
          <span>Q</span>
          <span>Switch player</span>
        </div>
      </div>
    </div>
  );
}

function ClubPicker({
  label,
  selectedId,
  onSelect,
}: {
  label: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-6 text-left">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-background/40">
        {label}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {CLUBS.map((club) => {
          const active = club.id === selectedId;
          return (
            <button
              key={club.id}
              onClick={() => onSelect(club.id)}
              className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                active
                  ? "border-[#63d68a] bg-[#63d68a]/15 text-background"
                  : "border-background/15 text-background/50 hover:border-background/30"
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-background/30"
                style={{ backgroundColor: club.primaryColor }}
              />
              {club.shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
