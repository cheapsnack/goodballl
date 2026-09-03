import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const MODEL_PATH = "/models/football-player.glb";
useGLTF.preload(MODEL_PATH);

type Phase = "idle" | "runup" | "kick" | "follow";

type Props = {
  /** Kit colours of the taking player. */
  primaryColor: string;
  accentColor: string;
  /** Called when the kick animation reaches the strike frame. */
  onStrike?: (() => void) | undefined;
  /** Trigger the run-up + kick sequence. */
  trigger?: boolean | undefined;
  /** Where the ball sits relative to the camera (for a visual target). */
  ballWorldPos?: [number, number, number] | undefined;
};

/**
 * A single animated player that stands behind the ball, does a short
 * three-step run-up, and plays the Kick clip on the strike frame.
 * Used by both PenaltyShootout and FreeKick to make set-pieces feel alive.
 */
function AnimatedTaker({ primaryColor, accentColor, onStrike, trigger }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);

  const clonedScene = useRef<THREE.Group | null>(null);
  if (!clonedScene.current) {
    clonedScene.current = cloneSkeleton(scene) as THREE.Group;
    // Tint kit
    clonedScene.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mesh.name === "Player_Jersey") mat.color.set(primaryColor);
      else if (["Player_Shorts", "Player_Socks"].includes(mesh.name)) mat.color.set(accentColor);
    });
  }

  const { actions } = useAnimations(animations, groupRef);

  const phase = useRef<Phase>("idle");
  const phaseTime = useRef(0);
  const strikeDispatched = useRef(false);

  // Start Idle on mount
  useEffect(() => {
    const idle = actions["Idle"];
    if (idle) { idle.reset().play(); idle.setEffectiveWeight(1); }
    return () => Object.values(actions).forEach((a) => a?.stop());
  }, []);

  // Kick sequence on trigger
  useEffect(() => {
    if (!trigger) return;
    phase.current = "runup";
    phaseTime.current = 0;
    strikeDispatched.current = false;

    // Fade from Idle → Run
    const idle = actions["Idle"];
    const run = actions["Run"];
    if (idle) idle.fadeOut(0.12);
    if (run) { run.reset().play(); run.setEffectiveWeight(1); }
  }, [trigger]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    phaseTime.current += dt;

    if (phase.current === "runup") {
      // Three-step approach toward the ball (forward = +z, toward the goal)
      const speed = 3.5;
      g.position.z += speed * dt;

      if (phaseTime.current > 0.55) {
        // Strike — switch to Kick clip
        phase.current = "kick";
        phaseTime.current = 0;
        const run = actions["Run"];
        const kick = actions["Kick"];
        if (run) run.fadeOut(0.08);
        if (kick) {
          kick.reset().play();
          kick.setLoop(THREE.LoopOnce, 1);
          kick.clampWhenFinished = true;
          kick.setEffectiveWeight(1);
        }
        if (!strikeDispatched.current) {
          strikeDispatched.current = true;
          onStrike?.();
        }
      }
    } else if (phase.current === "kick") {
      if (phaseTime.current > 0.85) {
        // Follow-through — ease back to idle
        phase.current = "follow";
        phaseTime.current = 0;
        const kick = actions["Kick"];
        const idle = actions["Idle"];
        if (kick) kick.fadeOut(0.3);
        if (idle) { idle.reset().play(); idle.fadeIn(0.3); idle.setEffectiveWeight(1); }
      }
    } else if (phase.current === "follow") {
      // Slowly step back to starting spot
      if (g.position.z > 0) g.position.z -= 1.5 * dt;
      if (phaseTime.current > 1.2) {
        phase.current = "idle";
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, -2.5]} rotation={[0, 0, 0]}>
      <primitive object={clonedScene.current} />
    </group>
  );
}

/**
 * Renders a mini 3D set-piece scene: the taker standing behind the ball with
 * the goal in the distance. Wraps in its own Canvas so it can be embedded
 * inside the 2D FreeKick and PenaltyShootout screens without disturbing the
 * main match Canvas.
 */
export function SetPiece3DScene({
  primaryColor,
  accentColor,
  trigger,
  onStrike,
}: {
  primaryColor: string;
  accentColor: string;
  trigger?: boolean;
  onStrike?: () => void;
}) {
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
        camera={{ position: [0, 2.5, 8], fov: 38, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 3]} intensity={1.8} />
        <hemisphereLight args={["#cfe6ff", "#1a4025", 0.4]} />

        {/* Pitch surface */}
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#22562a" roughness={0.9} />
        </mesh>

        {/* Ball */}
        <mesh position={[0, 0.11, 0]}>
          <sphereGeometry args={[0.11, 16, 12]} />
          <meshStandardMaterial color="#f4f4f4" roughness={0.6} />
        </mesh>

        {/* Goal (simplified wireframe in the distance) */}
        <GoalFrame />

        <AnimatedTaker
          primaryColor={primaryColor}
          accentColor={accentColor}
          trigger={trigger}
          onStrike={onStrike}
        />
      </Canvas>
    </div>
  );
}

function GoalFrame() {
  // 7.32m wide, 2.44m tall, ~20m away
  const W = 7.32;
  const H = 2.44;
  const Z = -18;
  const R = 0.06;

  return (
    <group position={[0, 0, Z]}>
      {/* Left post */}
      <mesh position={[-W / 2, H / 2, 0]}>
        <cylinderGeometry args={[R, R, H, 8]} />
        <meshStandardMaterial color="#e8e8e8" />
      </mesh>
      {/* Right post */}
      <mesh position={[W / 2, H / 2, 0]}>
        <cylinderGeometry args={[R, R, H, 8]} />
        <meshStandardMaterial color="#e8e8e8" />
      </mesh>
      {/* Crossbar */}
      <mesh position={[0, H, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[R, R, W + R * 2, 8]} />
        <meshStandardMaterial color="#e8e8e8" />
      </mesh>
      {/* Net (simple grid) */}
      <mesh position={[0, H / 2, R * 3]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.12}
          wireframe={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
