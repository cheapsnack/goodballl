import { createFileRoute } from "@tanstack/react-router";
import { GameCanvas } from "../components/game/GameCanvas";

export const Route = createFileRoute("/")({
  ssr: false, // <Canvas> must never render on the server
  head: () => ({
    meta: [
      { title: "Arcade Football — 3D Pitch" },
      {
        name: "description",
        content:
          "A 3D arcade football game built with React Three Fiber. Broadcast-angle stadium pitch scaffold, ready for match logic.",
      },
      { property: "og:title", content: "Arcade Football — 3D Pitch" },
      {
        property: "og:description",
        content:
          "A 3D arcade football game built with React Three Fiber. Broadcast-angle stadium pitch scaffold, ready for match logic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GameCanvas,
});
