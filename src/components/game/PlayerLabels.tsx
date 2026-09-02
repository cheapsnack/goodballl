import { useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { PLAYER_HEIGHT } from "./Player";

type LabelEntry = {
  id: string;
  position: { x: number; z: number };
  name: string;
  color: string;
  controlled?: boolean;
};

type Props = {
  players: LabelEntry[];
};

/**
 * Renders a name label above each outfield player using drei's <Html>,
 * which projects 3D world coords into DOM space each frame — no canvas
 * drawing required. The controlled player gets a slightly brighter badge
 * to match the arrow indicator above them.
 */
export function PlayerLabels({ players }: Props) {
  return (
    <>
      {players.map((p) => (
        <Html
          key={p.id}
          position={[p.position.x, PLAYER_HEIGHT + 0.15, p.position.z]}
          center
          distanceFactor={18}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: p.controlled ? "rgba(255,244,92,0.92)" : "rgba(0,0,0,0.65)",
              color: p.controlled ? "#1a1a1a" : "#fff",
              fontSize: "9px",
              fontFamily: "monospace",
              fontWeight: p.controlled ? 800 : 600,
              letterSpacing: "0.04em",
              padding: "1px 5px",
              borderRadius: "3px",
              whiteSpace: "nowrap",
              border: `1px solid ${p.controlled ? "#fff45c" : p.color}`,
              userSelect: "none",
              lineHeight: 1.4,
            }}
          >
            {p.name}
          </div>
        </Html>
      ))}
    </>
  );
}
