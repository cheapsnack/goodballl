import { useState } from "react";
import { initAudio, isAudioEnabled, setAudioEnabled } from "../../game/logic/audio";
import { MATCH_TUNING } from "../../game/logic/match";

/**
 * Pre-match screen. Rendered instead of the Canvas so nothing simulates (and
 * no WebGL context is created) until the player commits — this also gives us
 * the user gesture WebAudio needs before it will make a sound.
 */
export function MainMenu({ onKickoff }: { onKickoff: () => void }) {
  const [sound, setSound] = useState(isAudioEnabled());

  const start = () => {
    if (sound) initAudio();
    setAudioEnabled(sound);
    onKickoff();
  };

  const minutes = Math.round((MATCH_TUNING.periodSeconds * MATCH_TUNING.periods) / 60);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#0d1a12] text-background">
      {/* Faint pitch stripes behind the panel keep the sports feel pre-kickoff. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, #2f7a3f 0 60px, #256533 60px 120px)",
        }}
      />
      <div className="relative w-full max-w-md px-8 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.42em] text-background/50">
          Kickoff Mode
        </div>
        <h1 className="mt-3 font-sans text-6xl font-black uppercase leading-none tracking-tight text-background">
          Arcade
          <br />
          <span className="text-[#63d68a]">Football</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-background/60">
          {MATCH_TUNING.periods} halves · {minutes} minutes · you attack the far goal against a
          keeper and two defenders.
        </p>

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
        </div>
      </div>
    </div>
  );
}
