import { useState } from "react";
import { GameCanvas } from "./GameCanvas";
import { MainMenu } from "./MainMenu";
import { PenaltyShootout } from "./PenaltyShootout";
import { useGameStore } from "../../game/store/useGameStore";
import { endRoom } from "../../multiplayer/roomClient";

type Screen = "menu" | "match" | "penalties";

/** Gates the match behind the menu so the Canvas mounts only on kickoff. */
export function GameRoot() {
  const [screen, setScreen] = useState<Screen>("menu");
  const resetMatch = useGameStore((s) => s.resetMatch);
  const startShootout = useGameStore((s) => s.startShootout);
  const setNetRoom = useGameStore((s) => s.setNetRoom);

  if (screen === "menu") {
    return (
      <MainMenu
        onKickoff={(kind = "match") => {
          if (kind === "penalties") {
            startShootout();
            setScreen("penalties");
          } else {
            resetMatch();
            setScreen("match");
          }
        }}
      />
    );
  }

  if (screen === "penalties") {
    return <PenaltyShootout onExit={() => setScreen("menu")} />;
  }

  return (
    <GameCanvas
      onExit={() => {
        const { netRole, roomId } = useGameStore.getState();
        if (netRole !== "local" && roomId) {
          void endRoom(roomId); // best-effort; don't block leaving on it
        }
        setNetRoom("local", null, null);
        setScreen("menu");
      }}
    />
  );
}
