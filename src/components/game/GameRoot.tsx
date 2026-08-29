import { useState } from "react";
import { GameCanvas } from "./GameCanvas";
import { MainMenu } from "./MainMenu";
import { useGameStore } from "../../game/store/useGameStore";
import { endRoom } from "../../multiplayer/roomClient";

/** Gates the match behind the menu so the Canvas mounts only on kickoff. */
export function GameRoot() {
  const [started, setStarted] = useState(false);
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setNetRoom = useGameStore((s) => s.setNetRoom);

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

  return (
    <GameCanvas
      onExit={() => {
        const { netRole, roomId } = useGameStore.getState();
        if (netRole !== "local" && roomId) {
          void endRoom(roomId); // best-effort; don't block leaving on it
        }
        setNetRoom("local", null, null);
        setStarted(false);
      }}
    />
  );
}
