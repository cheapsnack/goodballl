import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const MODEL_PATH = "/models/football-player.glb";
useGLTF.preload(MODEL_PATH);

// ─── geometry constants (must match the 2D GOAL constants in the mini-game) ──
const GOAL_W = 7.32;
const GOAL_H = 2.44;
const POST_R = 0.08;
// Camera is at the penalty spot — 11m from goal line, at head height.
const CAM_Z = 11;
const CAM_Y = 1.5;
// Wall sits 9.15m from the ball (i.e. ~1.85m from goal).
const WALL_Z = CAM_Z - 9.15;

// ─── sub-components ──────────────────────────────────────────────────────────

function GoalNet() {
  return (
    <group position={[0, 0, 0]}>
      {/* Left post */}
      <mesh position={[-GOAL_W / 2, GOAL_H / 2, 0]}>
        <cylinderGeometry args={[POST_R, POST_R, GOAL_H, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      {/* Right post */}
      <mesh position={[GOAL_W / 2, GOAL_H / 2, 0]}>
        <cylinderGeometry args={[POST_R, POST_R, GOAL_H, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      {/* Crossbar */}
      <mesh position={[0, GOAL_H, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[POST_R, POST_R, GOAL_W + POST_R * 2, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      {/* Net back */}
      <mesh position={[0, GOAL_H / 2, -1.2]}>
        <planeGeometry args={[GOAL_W, GOAL_H]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.18} side={THREE.DoubleSide} wireframe />
      </mesh>
      {/* Net top */}
      <mesh position={[0, GOAL_H, -0.6]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[GOAL_W, 1.2]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.18} side={THREE.DoubleSide} wireframe />
      </mesh>
    </group>
  );
}

/** Animated goalkeeper — stands on line, dives when `diveTarget` is set. */
function Keeper({
  color,
  diveTarget,
}: {
  color: string;
  diveTarget: { x: number; y: number } | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);
  const clonedRef = useRef<THREE.Group | null>(null);

  if (!clonedRef.current) {
    clonedRef.current = cloneSkeleton(scene) as THREE.Group;
    clonedRef.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(color);
    });
  }

  const { actions } = useAnimations(animations, groupRef);
  const diveRef = useRef<{ x: number; y: number } | null>(null);
  const diveStarted = useRef(false);

  useEffect(() => {
    const idle = actions["Idle"];
    if (idle) { idle.reset().play(); idle.setEffectiveWeight(1); }
    return () => Object.values(actions).forEach((a) => a?.stop());
  }, []);

  useEffect(() => {
    if (!diveTarget || diveStarted.current) return;
    diveRef.current = diveTarget;
    diveStarted.current = true;
    const idle = actions["Idle"];
    const tackle = actions["Tackle"]; // re-use tackle as dive
    if (idle) idle.fadeOut(0.08);
    if (tackle) {
      tackle.reset().play();
      tackle.setLoop(THREE.LoopOnce, 1);
      tackle.clampWhenFinished = true;
      tackle.setEffectiveWeight(1);
    }
  }, [diveTarget]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g || !diveRef.current) return;
    // Slide toward dive target
    const tx = diveRef.current.x;
    const ty = Math.max(0, diveRef.current.y * 0.6);
    g.position.x += (tx - g.position.x) * Math.min(1, dt * 6);
    g.position.y += (ty - g.position.y) * Math.min(1, dt * 4);
  });

  return (
    <group
      ref={groupRef}
      position={[0, 0, 0.3]}
      rotation={[0, Math.PI, 0]} // face toward camera
      scale={[0.9, 0.9, 0.9]}
    >
      <primitive object={clonedRef.current} />
    </group>
  );
}

/** Row of wall defenders — simple low-poly capsule shapes. */
function Wall({
  wallData,
  side,
  color,
}: {
  wallData: { x: number; halfWidth: number } | null;
  side: -1 | 1;
  color: string;
}) {
  if (!wallData) return null;
  const count = 4;
  const spacing = 0.85;
  const xs = Array.from({ length: count }, (_, i) =>
    side * (Math.abs(wallData.x) * GOAL_W * 0.5) + (i - (count - 1) / 2) * spacing
  );
  return (
    <>
      {xs.map((x, i) => (
        <group key={i} position={[x, 0, WALL_Z]}>
          {/* head */}
          <mesh position={[0, 1.72, 0]}>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color="#c8a070" />
          </mesh>
          {/* body */}
          <mesh position={[0, 1.1, 0]}>
            <capsuleGeometry args={[0.24, 0.82, 6, 10]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {/* legs */}
          <mesh position={[0, 0.26, 0]}>
            <capsuleGeometry args={[0.2, 0.4, 4, 8]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ─── main exported components ─────────────────────────────────────────────────

export type SetPiece3DSceneProps = {
  /** Kit primary colour of the defending team (keeper + wall). */
  defenderColor: string;
  /** Optional wall config — `{ x: -1..1, halfWidth: 0..1 }`. If null/undefined, no wall shown. */
  wallData?: { x: number; halfWidth: number } | null | undefined;
  /** Which side the wall leans (-1 = left, 1 = right). */
  wallSide?: -1 | 1 | undefined;
  /** When non-null, triggers the keeper dive animation toward this normalised goal position. */
  keeperDiveTarget?: { x: number; y: number } | null | undefined;
};

/**
 * POV scene for penalty and free kick: camera sits at the penalty spot
 * looking at the goal, with a 3D animated goalkeeper (and optional wall
 * for free kicks). This is what you see before and during the kick.
 */
export function SetPiece3DScene({
  defenderColor,
  wallData = null,
  wallSide = -1,
  keeperDiveTarget = null,
}: SetPiece3DSceneProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{ position: [0, CAM_Y, CAM_Z], fov: 40, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "linear-gradient(#1b3a27 0%, #22482f 45%, #2c5a3a 100%)" }}
      >
        <color attach="background" args={["#1e4a2c"]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 8, 6]} intensity={1.6} />
        <hemisphereLight args={["#c8e8ff", "#1a4025", 0.5]} />

        {/* Pitch surface */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, 3]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#245c2a" roughness={0.9} />
        </mesh>

        {/* Penalty spot */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, CAM_Z - 0.05]}>
          <circleGeometry args={[0.08, 12]} />
          <meshStandardMaterial color="#ffffff" opacity={0.7} transparent />
        </mesh>

        {/* Goal frame */}
        <GoalNet />

        {/* Wall (free kicks only) */}
        <Wall wallData={wallData} side={wallSide} color={defenderColor} />

        {/* Goalkeeper */}
        <Keeper color={defenderColor} diveTarget={keeperDiveTarget} />
      </Canvas>
    </div>
  );
}
