import { useState } from "react";
import { initAudio, isAudioEnabled, setAudioEnabled } from "../../game/logic/audio";

/** In-match mute button, top-right of the broadcast overlay. */
export function SoundToggle() {
  const [on, setOn] = useState(isAudioEnabled());

  const toggle = () => {
    const next = !on;
    if (next) initAudio();
    setAudioEnabled(next);
    setOn(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={on ? "Mute stadium sound" : "Unmute stadium sound"}
      className="fixed right-4 top-5 z-10 rounded-md bg-foreground/70 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-background backdrop-blur-sm transition-opacity hover:opacity-90"
    >
      {on ? "Sound on" : "Muted"}
    </button>
  );
}
