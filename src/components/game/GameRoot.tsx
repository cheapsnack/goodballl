import { useState } from "react";
import { GameCanvas } from "./GameCanvas";
import { MainMenu } from "./MainMenu";
import { useGameStore } from "../../game/store/useGameStore";

/** Gates the match behind the menu so the Canvas mounts only on kickoff. */
export function GameRoot() {
  const [started, setStarted] = useState(false);
  const resetMatch = useGameStore((s) => s.resetMatch);

  if (!started) {
    return (
      <MainMenu
        onKickoff={() => {
          resetMatch();
          setStarted(true);
        }}
      />
    );
  }
  return <GameCanvas onExit={() => setStarted(false)} />;
}
