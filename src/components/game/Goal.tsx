const GOAL_WIDTH = 7.32;
const GOAL_HEIGHT = 2.44;
const GOAL_DEPTH = 2;
const POST_R = 0.09;

/** side = 1 -> goal at +x end, side = -1 -> goal at -x end */
export function Goal({ x, side }: { x: number; side: 1 | -1 }) {
  const halfW = GOAL_WIDTH / 2;

  return (
    <group position={[x, 0, 0]}>
      {/* posts */}
      {[-halfW, halfW].map((z) => (
        <mesh key={z} position={[0, GOAL_HEIGHT / 2, z]} castShadow>
          <cylinderGeometry args={[POST_R, POST_R, GOAL_HEIGHT, 12]} />
          <meshStandardMaterial color="#f2f4f6" roughness={0.4} metalness={0.1} />
        </mesh>
      ))}

      {/* crossbar */}
      <mesh position={[0, GOAL_HEIGHT, 0]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[POST_R, POST_R, GOAL_WIDTH, 12]} />
        <meshStandardMaterial color="#f2f4f6" roughness={0.4} metalness={0.1} />
      </mesh>

      {/* back net */}
      <mesh position={[side * GOAL_DEPTH, GOAL_HEIGHT / 2, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[GOAL_WIDTH, GOAL_HEIGHT]} />
        <meshStandardMaterial color="#e8eef2" transparent opacity={0.28} side={2} />
      </mesh>

      {/* side nets */}
      {[-halfW, halfW].map((z) => (
        <mesh key={z} position={[(side * GOAL_DEPTH) / 2, GOAL_HEIGHT / 2, z]}>
          <planeGeometry args={[GOAL_DEPTH, GOAL_HEIGHT]} />
          <meshStandardMaterial color="#e8eef2" transparent opacity={0.2} side={2} />
        </mesh>
      ))}

      {/* net roof */}
      <mesh position={[(side * GOAL_DEPTH) / 2, GOAL_HEIGHT, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[GOAL_WIDTH, GOAL_DEPTH]} />
        <meshStandardMaterial color="#e8eef2" transparent opacity={0.18} side={2} />
      </mesh>
    </group>
  );
}
