import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

/** Root-relative path — the GLB must live at `public/models/football-player.glb`. */
const MODEL_PATH = "/models/football-player.glb";
useGLTF.preload(MODEL_PATH);

// Matches the GLB's actual node names exactly (verified against the file).
const JERSEY_MESH = "Player_Jersey";
const KIT_MESHES = ["Player_Shorts", "Player_Socks"];

type ClipName = "Idle" | "Run" | "Sprint" | "Kick" | "Tackle";

/**
 * Speed (m/s) at which each locomotion clip is fully blended in. Tuned
 * against MOVEMENT_TUNING's actual speed range (~0 walking, ~13 max jog,
 * ~18.5 max sprint) so the transitions land where they visually should.
 */
const LOCOMOTION = {
  runFullAt: 5,
  sprintStartAt: 9,
  sprintFullAt: 15,
  /** how fast clip weights fade toward their target each second */
  blendSpeed: 8,
} as const;

export const PLAYER_HEIGHT = 1.85;

type Props = { color?: string; accent?: string };

/**
 * Imperative channel MatchScene writes into every frame via the forwarded
 * ref's userData, since it drives 22+ players from one central loop and
 * can't afford a React re-render per player per frame. Player reads these
 * in its own useFrame and turns them into animation blending.
 */
export type PlayerUserData = {
  /** current planar speed in m/s — drives the idle/run/sprint blend */
  speed?: number;
  /** incremented once per kick; Player plays the Kick clip on each change */
  kickCount?: number;
  /** incremented once per tackle attempt; plays the Tackle clip on each change */
  tackleCount?: number;
};

/**
 * Rigged, animated footballer (Idle/Run/Sprint/Kick/Tackle) loaded from a
 * shared GLB and cloned per instance so each of the 22+ players on the
 * pitch gets an independent skeleton and independently tintable kit.
 */
export const Player = forwardRef<THREE.Group, Props>(function Player(
  { color = "#e23c46", accent = "#f4f6f8" },
  ref,
) {
  const innerRef = useRef<THREE.Group>(null);
  useImperativeHandle(ref, () => innerRef.current as THREE.Group, []);

  const { scene, animations } = useGLTF(MODEL_PATH);

  // Clone once per mounted instance — SkeletonUtils.clone (unlike a plain
  // Object3D.clone) correctly rebinds SkinnedMesh -> Skeleton -> bones, so
  // each player can be posed independently by its own AnimationMixer.
  const clonedScene = useMemo(() => {
    const clone = cloneSkeleton(scene) as THREE.Group;
    // Materials are shared by reference after SkeletonUtils.clone, so kit
    // pieces need their own material instance before we tint them —
    // otherwise recoloring one player's jersey recolors every player's.
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name === JERSEY_MESH || KIT_MESHES.includes(mesh.name)) {
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
      }
    });
    return clone;
  }, [scene]);

  const { actions } = useAnimations(animations, innerRef);

  // Kit colors: jersey gets the primary color, shorts+socks get the accent —
  // matches the club color convention used everywhere else in the game.
  useEffect(() => {
    clonedScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mesh.name === JERSEY_MESH) mat.color.set(color);
      else if (KIT_MESHES.includes(mesh.name)) mat.color.set(accent);
    });
  }, [clonedScene, color, accent]);

  // Start every locomotion clip once so the mixer keeps them all advancing;
  // visible influence is controlled purely by weight, which avoids the pop
  // that resetting/replaying a clip on every blend change would cause.
  useEffect(() => {
    (["Idle", "Run", "Sprint"] as ClipName[]).forEach((name) => {
      const action = actions[name];
      if (!action) return;
      action.reset().play();
      action.setEffectiveWeight(name === "Idle" ? 1 : 0);
    });
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastKick = useRef(0);
  const lastTackle = useRef(0);
  const oneShotUntil = useRef(0);

  const playOneShot = (name: "Kick" | "Tackle", elapsed: number) => {
    const action = actions[name];
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.play();
    oneShotUntil.current = elapsed + action.getClip().duration;
  };

  useFrame((state, dt) => {
    const g = innerRef.current;
    if (!g || !actions["Idle"] || !actions["Run"] || !actions["Sprint"]) return;

    const data = g.userData as PlayerUserData;
    const elapsed = state.clock.elapsedTime;

    const kickCount = data.kickCount ?? 0;
    if (kickCount !== lastKick.current) {
      lastKick.current = kickCount;
      playOneShot("Kick", elapsed);
    }
    const tackleCount = data.tackleCount ?? 0;
    if (tackleCount !== lastTackle.current) {
      lastTackle.current = tackleCount;
      playOneShot("Tackle", elapsed);
    }

    const inOneShot = elapsed < oneShotUntil.current;

    const runTarget = inOneShot
      ? 0
      : THREE.MathUtils.clamp((data.speed ?? 0) / LOCOMOTION.runFullAt, 0, 1);
    const sprintTarget = inOneShot
      ? 0
      : THREE.MathUtils.clamp(
          ((data.speed ?? 0) - LOCOMOTION.sprintStartAt) /
            (LOCOMOTION.sprintFullAt - LOCOMOTION.sprintStartAt),
          0,
          1,
        );
    const idleTarget = inOneShot ? 0 : 1 - runTarget;
    const kickTackleTarget = inOneShot ? 1 : 0;

    const lerpWeight = (action: THREE.AnimationAction | null, target: number) => {
      if (!action) return;
      const current = action.getEffectiveWeight();
      const next = THREE.MathUtils.damp(current, target, LOCOMOTION.blendSpeed, dt);
      action.setEffectiveWeight(next);
    };

    lerpWeight(actions["Idle"], idleTarget);
    lerpWeight(actions["Run"], runTarget * (1 - sprintTarget));
    lerpWeight(actions["Sprint"], sprintTarget);
    const kick = actions["Kick"];
    const tackle = actions["Tackle"];
    if (kick && !kick.isRunning()) kick.setEffectiveWeight(kickTackleTarget);
    if (tackle && !tackle.isRunning()) tackle.setEffectiveWeight(kickTackleTarget);
  });

  return (
    <group ref={innerRef}>
      <primitive object={clonedScene} />
      {/* contact shadow disc for grounding, matching the pitch's shadow style */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color="#0b2410" transparent opacity={0.28} />
      </mesh>
    </group>
  );
});
