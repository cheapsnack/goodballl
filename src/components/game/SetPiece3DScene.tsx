import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { FREEKICK_TUNING } from "../../game/logic/freekicks";

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
/** Where along the flight (0 = ball, 1 = goal line) the wall stands. */
const WALL_T = (CAM_Z - WALL_Z) / CAM_Z;

/**
 * The 2D mini-games express aim as x −1…1 across the goal (scaled 0.92 so the
 * posts stay reachable) and y 0…1 up to the bar. These map that same space
 * into metres so the 3D flight lands exactly where the 2D maths says it does.
 */
const aimToWorld = (p: { x: number; y: number }) => ({
  x: THREE.MathUtils.clamp(p.x, -1.6, 1.6) * (GOAL_W / 2) * 0.92,
  y: 0.12 + THREE.MathUtils.clamp(p.y, 0, 1.6) * (GOAL_H - 0.3),
});

/** Ball start: just in front of the camera, on the spot. */
const BALL_START = new THREE.Vector3(0, 0.11, CAM_Z - 0.7);

export type SetPieceKick = {
  /** Increment per kick so the scene knows to replay the flight. */
  id: number;
  aim: { x: number; y: number };
  /** −1…1 bend; 0 for penalties. */
  curve: number;
  /** 0…1 strike power — drives flight time, same as the 2D transition. */
  power: number;
  outcome: "goal" | "saved" | "wall" | "miss";
  /** Flight duration in ms, taken straight from the 2D timing. */
  flightMs: number;
  /** Keeper's guess in the same normalised goal space (null = no dive). */
  keeperTarget?: { x: number; y: number } | null | undefined;
  /** Wall centre in normalised goal x, when a wall is present. */
  wallX?: number | undefined;
};

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

/**
 * The struck ball. Its path is derived from the same numbers the 2D outcome
 * maths uses: the aim point, `bendAroundWall` for lateral curve and
 * `riseAtWall` for how high it is by the time it reaches the wall line.
 */
function Ball({ kick }: { kick: SetPieceKick | null }) {
  const ref = useRef<THREE.Mesh>(null);
  const startedAt = useRef(0);
  const activeId = useRef(-1);

  /** Precomputed flight shape for the current kick. */
  const path = useMemo(() => {
    if (!kick) return null;
    const end = aimToWorld(kick.aim);
    const missed = kick.outcome === "miss";
    const saved = kick.outcome === "saved" && kick.keeperTarget;
    const target = missed
      ? { x: end.x * 1.35, y: Math.max(end.y, 0.4 * GOAL_H) * 1.35 }
      : saved
        ? aimToWorld(kick.keeperTarget!)
        : end;

    // Stops at the wall line when the wall blocks it.
    const blocked = kick.outcome === "wall";
    const endT = blocked ? WALL_T : 1;
    const endZ = blocked ? WALL_Z : missed ? -1.4 : -0.9;

    // Vertical profile: y = target * t^k, with k chosen so the ball is at
    // `riseAtWall` of its final height exactly at the wall line.
    const k = Math.log(FREEKICK_TUNING.riseAtWall) / Math.log(WALL_T);
    // Lateral bend: a sine arc that peaks mid-flight and is scaled so the
    // offset at the wall line equals `bendAroundWall` goal half-widths.
    const bendScale =
      (kick.curve * FREEKICK_TUNING.bendAroundWall * (GOAL_W / 2)) /
      Math.sin(Math.PI * WALL_T);

    return { target, endT, endZ, k, bendScale, blocked };
  }, [kick?.id]);

  useEffect(() => {
    if (!kick) return;
    if (kick.id !== activeId.current) {
      activeId.current = kick.id;
      startedAt.current = performance.now();
      if (ref.current) ref.current.position.copy(BALL_START);
    }
  }, [kick?.id]);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    if (!kick || !path) {
      m.position.copy(BALL_START);
      m.visible = true;
      return;
    }
    const dur = Math.max(120, kick.flightMs);
    const raw = (performance.now() - startedAt.current) / dur;
    const t = THREE.MathUtils.clamp(raw, 0, 1) * path.endT;
    const eased = t; // constant flight speed, like the 2D transition

    const baseX = THREE.MathUtils.lerp(BALL_START.x, path.target.x, eased / path.endT);
    const bend = path.bendScale * Math.sin(Math.PI * eased);
    const y =
      BALL_START.y +
      (path.target.y - BALL_START.y) * Math.pow(Math.max(eased / path.endT, 0.0001), path.k);
    const z = THREE.MathUtils.lerp(BALL_START.z, path.endZ, eased / path.endT);

    m.position.set(baseX + bend, Math.max(0.09, y), z);
    // Spin scales with power and bend, so a whipped ball visibly rotates more.
    m.rotation.x -= 0.25 + kick.power * 0.4;
    m.rotation.y -= kick.curve * 0.3;
    // Shrinks with distance naturally via perspective; keep it visible.
    m.visible = true;
  });

  return (
    <mesh ref={ref} position={BALL_START.toArray()}>
      <sphereGeometry args={[0.11, 16, 12]} />
      <meshStandardMaterial color="#f6f7f2" roughness={0.5} />
    </mesh>
  );
}

/**
 * Clones the rigged footballer and tints only the kit meshes, leaving skin,
 * hair and boots as authored — painting every mesh one colour was what made
 * the figures read as flat placeholder silhouettes.
 */
function useKitClone(scene: THREE.Object3D, jersey: string, shorts: string) {
  const clonedRef = useRef<THREE.Group | null>(null);
  if (!clonedRef.current) {
    const clone = cloneSkeleton(scene) as THREE.Group;
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (mesh.name === "Player_Jersey") mat.color.set(jersey);
      else if (mesh.name === "Player_Shorts" || mesh.name === "Player_Socks") mat.color.set(shorts);
      mesh.material = mat;
      mesh.castShadow = true;
    });
    clonedRef.current = clone;
  }
  return clonedRef.current;
}

/** Animated goalkeeper — stands on line, dives when `diveTarget` is set. */
function Keeper({
  color,
  diveTarget,
  diveMs,
  reach: reach2d,
}: {
  color: string;
  diveTarget: { x: number; y: number } | null;
  diveMs: number;
  /** Keeper reach in goal half-widths — comes from the same tuning the 2D outcome uses. */
  reach: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);
  // Keepers wear a distinct kit, never the outfield colour.
  const clonedScene = useKitClone(scene, "#e8f24a", "#1b1f24");
  const clonedRef = { current: clonedScene };
  void color;


  const { actions } = useAnimations(animations, groupRef);
  const diveRef = useRef<{ x: number; y: number } | null>(null);
  const fromRef = useRef(new THREE.Vector3(0, 0, 0.3));
  const startedAt = useRef(0);

  useEffect(() => {
    const idle = actions["Idle"];
    if (idle) { idle.reset().play(); idle.setEffectiveWeight(1); }
    return () => Object.values(actions).forEach((a) => a?.stop());
  }, []);

  useEffect(() => {
    if (!diveTarget) {
      // Reset between kicks.
      diveRef.current = null;
      const g = groupRef.current;
      if (g) g.position.set(0, 0, 0.3);
      const idle = actions["Idle"];
      if (idle && !idle.isRunning()) idle.reset().fadeIn(0.15).play();
      return;
    }
    if (diveRef.current) return;
    diveRef.current = diveTarget;
    startedAt.current = performance.now();
    if (groupRef.current) fromRef.current.copy(groupRef.current.position);
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

  useFrame(() => {
    const g = groupRef.current;
    if (!g || !diveRef.current) return;
    // The keeper commits when the ball is struck and must be fully extended
    // before it arrives — he covers his reach over ~70% of the flight time.
    const dur = Math.max(140, diveMs * 0.7);
    const t = THREE.MathUtils.clamp((performance.now() - startedAt.current) / dur, 0, 1);
    // Ease-out: explosive push off the line, then a stretch.
    const e = 1 - Math.pow(1 - t, 2.2);
    // Dive distance is capped at the keeper's reach from the 2D tuning, so a
    // dive can never cover ground the outcome maths says he can't reach.
    const reach = reach2d * (GOAL_W / 2) * 2;
    const rawX = diveRef.current.x * (GOAL_W / 2) * 0.92;
    const tx = THREE.MathUtils.clamp(rawX, -reach, reach);
    const ty = Math.max(0, Math.min(diveRef.current.y * GOAL_H * 0.55, GOAL_H * 0.55));
    g.position.x = THREE.MathUtils.lerp(fromRef.current.x, tx, e);
    g.position.y = THREE.MathUtils.lerp(fromRef.current.y, ty, e);
    // Leans into the dive as he extends.
    g.rotation.z = -Math.sign(tx) * e * Math.min(1, Math.abs(tx) / 2.2) * 0.9;
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
  /** The kick in flight — drives the 3D ball path and keeper dive timing. */
  kick?: SetPieceKick | null | undefined;
  /**
   * Render the ball in 3D. Off by default: the mini-games draw the ball as a
   * 2D overlay, whose flight reads more smoothly at this scene size.
   */
  showBall?: boolean | undefined;
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
  kick = null,
  showBall = false,
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
        <Keeper
          color={defenderColor}
          diveTarget={keeperDiveTarget ?? null}
          diveMs={kick?.flightMs ?? 500}
        />

        {/* Ball in flight (opt-in — the 2D overlay ball is the default) */}
        {showBall && <Ball kick={kick} />}
      </Canvas>
    </div>
  );
}
