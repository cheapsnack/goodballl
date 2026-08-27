import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Pitch } from "./Pitch";
import { Goal } from "./Goal";
import { PITCH_LENGTH } from "./pitchTexture";

const SKY = "#8fc3e8";

export function GameCanvas() {
  return (
    <div className="fixed inset-0">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 42, 62], fov: 45 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, 120, 320]} />

        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#cfe6ff", "#2e6b33", 0.5]} />
        <directionalLight
          position={[45, 70, 30]}
          intensity={2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-70}
          shadow-camera-right={70}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
          shadow-camera-far={200}
        />

        <Environment>
          <Lightformer intensity={2} position={[0, 20, 0]} scale={[40, 40, 1]} />
          <Lightformer
            intensity={1}
            color="#bcd8f5"
            position={[-30, 6, -10]}
            rotation-y={Math.PI / 2}
            scale={[60, 6, 1]}
          />
        </Environment>

        <Pitch />
        <Goal x={-PITCH_LENGTH / 2} side={-1} />
        <Goal x={PITCH_LENGTH / 2} side={1} />
      </Canvas>
    </div>
  );
}
