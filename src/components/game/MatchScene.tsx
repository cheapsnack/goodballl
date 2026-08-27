import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { Pitch } from "./Pitch";
import { Goal } from "./Goal";
import { Player } from "./Player";
import { Ball } from "./Ball";
import { PITCH_LENGTH } from "./pitchTexture";

import { useKeyboardInput } from "../../hooks/useKeyboardInput";
import { PITCH, PLAYER_RADIUS, useGameStore } from "../../game/store/useGameStore";
import { clampToPitch, paramsFromAttributes, stepMovement } from "../../game/logic/movement";
import { resolvePlayerBall, stepBall } from "../../game/logic/ballPhysics";
import { stepBroadcastCamera, type CameraFrame } from "../../game/logic/camera";

// Placeholder attributes until club data is wired in (Phase 9).
const CONTROLLED_ATTRS = { pace: 74, dribble: 72 };

export function MatchScene() {
  const input = useKeyboardInput();
  const { camera } = useThree();

  const playerRef = useRef<THREE.Group>(null);
  const ballRef = useRef<THREE.Group>(null);
  const params = useRef(paramsFromAttributes(CONTROLLED_ATTRS));
  const camFrame = useRef<CameraFrame>({
    position: { x: 0, y: 26, z: 30 },
    lookAt: { x: 0, y: 0, z: 0 },
  });

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const store = useGameStore.getState();

    // --- player ---
    let player = stepMovement(store.player, input.current, params.current, dt);
    player = clampToPitch(player, PITCH.halfLength, PITCH.halfWidth);

    // --- ball ---
    let ball = resolvePlayerBall(store.ball, player, PLAYER_RADIUS, dt);
    ball = stepBall(ball, dt, { halfLength: PITCH.halfLength, halfWidth: PITCH.halfWidth });

    useGameStore.setState({ player, ball });

    // --- meshes ---
    if (playerRef.current) {
      playerRef.current.position.set(player.position.x, 0, player.position.z);
      playerRef.current.rotation.y = player.heading;
    }
    if (ballRef.current) {
      ballRef.current.position.set(ball.position.x, ball.position.y, ball.position.z);
      const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
      if (speed > 0.01) {
        const axis = new THREE.Vector3(ball.velocity.z, 0, -ball.velocity.x).normalize();
        ballRef.current.rotateOnWorldAxis(axis, (speed / 0.36) * dt);
      }
    }

    // --- camera (broadcast follow, smoothed) ---
    camFrame.current = stepBroadcastCamera(camFrame.current, ball.position, ball.velocity, dt);
    const f = camFrame.current;
    camera.position.set(f.position.x, f.position.y, f.position.z);
    camera.lookAt(f.lookAt.x, f.lookAt.y, f.lookAt.z);
  });

  return (
    <>
      <Pitch />
      <Goal x={-PITCH_LENGTH / 2} side={-1} />
      <Goal x={PITCH_LENGTH / 2} side={1} />
      <Player ref={playerRef} />
      <Ball ref={ballRef} />
    </>
  );
}
