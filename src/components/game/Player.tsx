import { forwardRef } from "react";
import * as THREE from "three";

export const PLAYER_HEIGHT = 1.85;

type Props = { color?: string; accent?: string };

/**
 * Low-poly footballer built from primitives — torso, shorts, socks and boots
 * as separate pieces so a club's two kit colours actually read as a kit.
 * Still a placeholder stand-in for a rigged GLB.
 */
export const Player = forwardRef<THREE.Group, Props>(function Player(
  { color = "#e23c46", accent = "#f4f6f8" },
  ref,
) {
  const legX = 0.17;

  return (
    <group ref={ref}>
      {/* shirt */}
      <mesh position={[0, 1.18, 0]} castShadow>
        <capsuleGeometry args={[0.34, 0.46, 6, 16]} />
        <meshStandardMaterial color={color} roughness={0.65} />
      </mesh>
      {/* shoulders / sleeves in the accent colour */}
      <mesh position={[0, 1.36, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.14, 14]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>

      {/* shorts */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.3, 0.32, 14]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>

      {/* legs + socks + boots */}
      {[-legX, legX].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.52, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.1, 0.34, 10]} />
            <meshStandardMaterial color="#c98f63" roughness={0.85} />
          </mesh>
          {/* sock */}
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.09, 0.3, 10]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          {/* boot */}
          <mesh position={[0, 0.05, -0.05]} castShadow>
            <boxGeometry args={[0.16, 0.1, 0.3]} />
            <meshStandardMaterial color="#15181c" roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* head */}
      <mesh position={[0, PLAYER_HEIGHT - 0.16, 0]} castShadow>
        <sphereGeometry args={[0.24, 20, 16]} />
        <meshStandardMaterial color="#c98f63" roughness={0.8} />
      </mesh>

      {/* facing marker so heading stays readable */}
      <mesh position={[0, 1.2, -0.34]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.1]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>

      {/* contact shadow disc for grounding */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#0b2410" transparent opacity={0.28} />
      </mesh>
    </group>
  );
});
