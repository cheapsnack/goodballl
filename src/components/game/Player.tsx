import { forwardRef } from "react";
import * as THREE from "three";

export const PLAYER_HEIGHT = 1.85;

type Props = { color?: string; accent?: string };

/**
 * Capsule stand-in for a footballer, dressed with a few cheap extra
 * primitives (shorts, socks, boots) so kit colours actually read as a kit
 * rather than a single-color pill — a placeholder for a real rigged model
 * later, not an attempt to fake one.
 */
export const Player = forwardRef<THREE.Group, Props>(function Player(
  { color = "#e23c46", accent = "#f4f6f8" },
  ref,
) {
  const bodyH = PLAYER_HEIGHT - 0.9;
  const hipY = 0.62;

  return (
    <group ref={ref}>
      {/* torso + legs */}
      <mesh position={[0, bodyH / 2 + 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.42, bodyH * 0.75, 6, 16]} />
        <meshStandardMaterial color={color} roughness={0.65} />
      </mesh>
      {/* shorts band */}
      <mesh position={[0, hipY, 0]} castShadow>
        <cylinderGeometry args={[0.44, 0.4, 0.32, 14]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
      {/* socks */}
      <mesh position={[-0.16, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.34, 10]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
      <mesh position={[0.16, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.34, 10]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
      {/* boots */}
      <mesh position={[-0.16, 0.07, 0.05]} castShadow>
        <boxGeometry args={[0.22, 0.14, 0.34]} />
        <meshStandardMaterial color="#1b1d22" roughness={0.5} />
      </mesh>
      <mesh position={[0.16, 0.07, 0.05]} castShadow>
        <boxGeometry args={[0.22, 0.14, 0.34]} />
        <meshStandardMaterial color="#1b1d22" roughness={0.5} />
      </mesh>
      {/* head */}
      <mesh position={[0, PLAYER_HEIGHT - 0.16, 0]} castShadow>
        <sphereGeometry args={[0.26, 20, 16]} />
        <meshStandardMaterial color="#c98f63" roughness={0.8} />
      </mesh>
      {/* facing marker so heading is readable while tuning */}
      <mesh position={[0, 0.9, -0.44]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.1]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
      {/* contact shadow disc for grounding */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color="#0b2410" transparent opacity={0.28} />
      </mesh>
    </group>
  );
});

