import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useGameStore } from "../../game/store/useGameStore";

const TRAIL_TUNING = {
  /** number of stored samples */
  points: 26,
  /** ball speed (m/s) at which the trail is fully visible */
  fullSpeed: 16,
  /** below this speed the trail is hidden entirely */
  minSpeed: 6,
  /** seconds between samples — lower = tighter, denser ribbon */
  sampleInterval: 1 / 60,
} as const;

/**
 * A fading ribbon behind the ball. Kept out of MatchScene so the sim loop
 * stays readable; it only reads store state, never writes it.
 */
export function BallTrail() {
  const accum = useRef(0);

  const { line, positions } = useMemo(() => {
    const positions = new Float32Array(TRAIL_TUNING.points * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    return { line, positions };
  }, []);

  useFrame((_, delta) => {
    const { ball } = useGameStore.getState();
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z);

    accum.current += delta;
    if (accum.current >= TRAIL_TUNING.sampleInterval) {
      accum.current = 0;
      // Shift the buffer back one sample and append the current position.
      positions.copyWithin(0, 3);
      const i = (TRAIL_TUNING.points - 1) * 3;
      positions[i] = ball.position.x;
      positions[i + 1] = ball.position.y;
      positions[i + 2] = ball.position.z;
      line.geometry.attributes.position!.needsUpdate = true;
    }

    const material = line.material as THREE.LineBasicMaterial;
    const t = (speed - TRAIL_TUNING.minSpeed) / (TRAIL_TUNING.fullSpeed - TRAIL_TUNING.minSpeed);
    const target = THREE.MathUtils.clamp(t, 0, 1) * 0.55;
    // Ease so the ribbon fades rather than popping in and out.
    material.opacity = THREE.MathUtils.lerp(material.opacity, target, 0.2);
    line.visible = material.opacity > 0.01;
  });

  return <primitive object={line} />;
}
