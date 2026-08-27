import * as THREE from "three";

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

/**
 * Draws the turf (mown stripes + noise) and all white line markings into a
 * single canvas texture, so the whole pitch is one draw call.
 */
export function createPitchTexture(): THREE.CanvasTexture {
  const scale = 20; // px per pitch unit
  const canvas = document.createElement("canvas");
  canvas.width = PITCH_LENGTH * scale;
  canvas.height = PITCH_WIDTH * scale;
  const ctx = canvas.getContext("2d")!;

  // helpers: pitch coords (origin at centre) -> canvas px
  const px = (x: number) => (x + PITCH_LENGTH / 2) * scale;
  const py = (z: number) => (z + PITCH_WIDTH / 2) * scale;

  // --- turf base + mown stripes ---
  const stripes = 14;
  const stripeW = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#3f8f43" : "#37803b";
    ctx.fillRect(i * stripeW, 0, stripeW + 1, canvas.height);
  }

  // subtle grass noise
  const noise = 26000;
  for (let i = 0; i < noise; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.045)";
    ctx.fillRect(x, y, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }

  // --- markings ---
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 0.22 * scale;
  ctx.lineCap = "butt";

  const rect = (x1: number, z1: number, x2: number, z2: number) =>
    ctx.strokeRect(px(x1), py(z1), (x2 - x1) * scale, (z2 - z1) * scale);

  const half = { x: PITCH_LENGTH / 2, z: PITCH_WIDTH / 2 };

  // touchlines / goal lines
  rect(-half.x, -half.z, half.x, half.z);

  // halfway line
  ctx.beginPath();
  ctx.moveTo(px(0), py(-half.z));
  ctx.lineTo(px(0), py(half.z));
  ctx.stroke();

  // centre circle + spot
  ctx.beginPath();
  ctx.arc(px(0), py(0), 9.15 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), py(0), 0.25 * scale, 0, Math.PI * 2);
  ctx.fill();

  for (const side of [-1, 1] as const) {
    const goalLine = side * half.x;

    // penalty area (16.5m deep, 40.32m wide)
    rect(
      Math.min(goalLine, goalLine - side * 16.5),
      -20.16,
      Math.max(goalLine, goalLine - side * 16.5),
      20.16,
    );

    // six-yard box (5.5m deep, 18.32m wide)
    rect(
      Math.min(goalLine, goalLine - side * 5.5),
      -9.16,
      Math.max(goalLine, goalLine - side * 5.5),
      9.16,
    );

    // penalty spot
    const spotX = goalLine - side * 11;
    ctx.beginPath();
    ctx.arc(px(spotX), py(0), 0.25 * scale, 0, Math.PI * 2);
    ctx.fill();

    // penalty arc (outside the box only)
    ctx.beginPath();
    const start = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    ctx.arc(px(spotX), py(0), 9.15 * scale, start, start + Math.PI, side === 1);
    ctx.stroke();

    // corner arcs
    for (const zs of [-1, 1] as const) {
      ctx.beginPath();
      ctx.arc(px(goalLine), py(zs * half.z), 1 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
