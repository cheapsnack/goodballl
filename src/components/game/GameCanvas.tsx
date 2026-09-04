import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { MatchScene } from "./MatchScene";
import { BallTrail } from "./BallTrail";
import { ControlsHint } from "./ControlsHint";
import { PowerBar } from "./PowerBar";
import { MatchHud } from "./MatchHud";
import { OptionsPanel } from "./OptionsPanel";
import { MatchAlert } from "./MatchAlert";
import { LineupIndicator } from "./LineupIndicator";
import { SetPieceDebugOverlay } from "./SetPieceDebugOverlay";
import { PlayerNamesPanel } from "./PlayerNamesPanel";
import { SoundToggle } from "./SoundToggle";
import { PenaltyShootout } from "./PenaltyShootout";
import { MobileControls } from "./MobileControls";
import { useTouchInput } from "../../hooks/useTouchInput";
import { useGameStore } from "../../game/store/useGameStore";

const SKY = "#8fc3e8";

export function GameCanvas({ onExit }: { onExit?: (() => void) | undefined }) {
  const inShootout = useGameStore((s) => s.matchStatus === "penalties");
  // Hoist touch input here so MobileControls (outside Canvas) and MatchScene
  // (inside Canvas) share the exact same stateRef.
  const { stateRef: touchStateRef, getInput: getTouchInput } = useTouchInput();

  return (
    <div className="fixed inset-0">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 26, 30], fov: 45, far: 600 }}>
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

        <MatchScene getTouchInput={getTouchInput} />
        <BallTrail />
      </Canvas>
      <OptionsPanel />
      <MatchHud onExit={onExit} />
      {!inShootout && <MatchAlert />}
      {!inShootout && <LineupIndicator />}
      {!inShootout && <SetPieceDebugOverlay />}
      {!inShootout && <PlayerNamesPanel />}
      <SoundToggle />
      <PowerBar />
      <ControlsHint />
      {/* On-screen controller — hidden on large-screen (desktop) by CSS, visible on mobile */}
      <MobileControls stateRef={touchStateRef} />
      {/* Drawn after extra time — the shootout takes over the screen. */}
      {inShootout && <PenaltyShootout onExit={onExit} />}
    </div>
  );
}
