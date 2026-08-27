import { forwardRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { BALL_RADIUS } from "../../game/logic/ballPhysics";

function createBallTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f6f7f9";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#1e2430";
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const cx = (col + (row % 2 ? 0.5 : 0)) * (size / 6);
      const cy = (row + 0.5) * (size / 4);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const r = size / 17;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const Ball = forwardRef<THREE.Group>(function Ball(_props, ref) {
  const texture = useMemo(() => createBallTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group ref={ref}>
      <mesh castShadow>
        <sphereGeometry args={[BALL_RADIUS, 24, 20]} />
        <meshStandardMaterial map={texture} roughness={0.45} metalness={0.02} />
      </mesh>
    </group>
  );
});
