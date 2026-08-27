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
import {
  applyImpulse,
  resolvePlayerBall,
  stepBall,
  STRIKE_TUNING,
} from "../../game/logic/ballPhysics";
import { canStrike, resolveStrike, stepCharge } from "../../game/logic/striking";
import { stepBroadcastCamera, type CameraFrame } from "../../game/logic/camera";
import type { MovementInput } from "../../game/types";

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
    const keys = input.current;

    // --- charge ---
    const prevCharge = store.charge;
    const charge = stepCharge(prevCharge, keys, dt);
    // Released this frame when a charge was running and the key is now up.
    const released = prevCharge.action !== null && charge.action === null;

    // --- player (movement is dampened while winding up a strike) ---
    const move: MovementInput = charge.action
      ? {
          x: keys.x * STRIKE_TUNING.chargeMoveScale,
          z: keys.z * STRIKE_TUNING.chargeMoveScale,
          sprint: false,
        }
      : keys;

    let player = stepMovement(store.player, move, params.current, dt);
    player = clampToPitch(player, PITCH.halfLength, PITCH.halfWidth);

    // --- strike ---
    let ball = store.ball;
    let cooldown = Math.max(0, store.strikeCooldown - dt);

    if (released && canStrike(player, ball)) {
      // No target passed yet — teammates arrive in step 2 and plug in here.
      const strike = resolveStrike(player, prevCharge);
      ball = applyImpulse(ball, strike.direction, strike.speed, strike.lift);
      cooldown = STRIKE_TUNING.cooldown;
    }

    // --- ball (dribble capture is suppressed right after a strike) ---
    if (cooldown <= 0) {
      ball = resolvePlayerBall(ball, player, PLAYER_RADIUS, dt);
    }
    ball = stepBall(ball, dt, { halfLength: PITCH.halfLength, halfWidth: PITCH.halfWidth });

    useGameStore.setState({ player, ball, charge, strikeCooldown: cooldown });

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
