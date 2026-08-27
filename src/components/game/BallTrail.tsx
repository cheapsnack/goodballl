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
  const lineRef = useRef<THREE.Line>(null);
  const matRef = useRef<THREE.LineBasicMaterial>(null);
  const accum = useRef(0);

  const { geometry, positions } = useMemo(() => {
    const positions = new Float32Array(TRAIL_TUNING.points * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry, positions };
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
      geometry.attributes.position!.needsUpdate = true;
      geometry.computeBoundingSphere();
    }

    if (matRef.current) {
      const t =
        (speed - TRAIL_TUNING.minSpeed) / (TRAIL_TUNING.fullSpeed - TRAIL_TUNING.minSpeed);
      const target = THREE.MathUtils.clamp(t, 0, 1) * 0.55;
      // Ease so the ribbon fades rather than popping in and out.
      matRef.current.opacity = THREE.MathUtils.lerp(matRef.current.opacity, target, 0.2);
    }
    if (lineRef.current) lineRef.current.visible = (matRef.current?.opacity ?? 0) > 0.01;
  });

  return (
    // @ts-expect-error three's Line element is valid in r3f but not in the JSX intrinsics map
    <line ref={lineRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial ref={matRef} color="#ffffff" transparent opacity={0} depthWrite={false} />
      {/* @ts-expect-error see above */}
    </line>
  );
}
