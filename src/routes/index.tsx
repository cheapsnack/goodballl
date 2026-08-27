import { createFileRoute } from "@tanstack/react-router";
import { GameRoot } from "../components/game/GameRoot";

export const Route = createFileRoute("/")({
  ssr: false, // <Canvas> must never render on the server
  head: () => ({
    meta: [
      { title: "Arcade Football — 3D Kickoff Match" },
      {
        name: "description",
        content:
          "A 3D arcade football game built with React Three Fiber: charge-up shooting, goalkeeper and defender AI, a match clock and a broadcast HUD.",
      },
      { property: "og:title", content: "Arcade Football — 3D Kickoff Match" },
      {
        property: "og:description",
        content:
          "Play a full 3D arcade football match: charge-up shots, lofted passes, keeper dives and a broadcast scoreboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GameRoot,
});
