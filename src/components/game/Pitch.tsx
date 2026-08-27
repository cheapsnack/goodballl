import { useEffect, useMemo } from "react";
import { createPitchTexture, PITCH_LENGTH, PITCH_WIDTH } from "./pitchTexture";

export function Pitch() {
  const texture = useMemo(() => createPitchTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group>
      {/* surrounding grass apron */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[PITCH_LENGTH + 30, PITCH_WIDTH + 24]} />
        <meshStandardMaterial color="#2c6b31" roughness={1} />
      </mesh>

      {/* playing surface */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[PITCH_LENGTH, PITCH_WIDTH]} />
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}
