import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { Pitch } from "./Pitch";
import { Goal } from "./Goal";
import { Player } from "./Player";
import { Ball } from "./Ball";
import { PITCH_LENGTH } from "./pitchTexture";

import { useKeyboardInput } from "../../hooks/useKeyboardInput";
import {
  DEFENDER_ROLES,
  DEFENDING_SIDE,
  PITCH,
  PLAYER_RADIUS,
  useGameStore,
} from "../../game/store/useGameStore";
import { clampToPitch, paramsFromAttributes, stepMovement } from "../../game/logic/movement";
import {
  applyImpulse,
  resolvePlayerBall,
  stepBall,
  STRIKE_TUNING,
} from "../../game/logic/ballPhysics";
import { canStrike, resolveStrike, stepCharge } from "../../game/logic/striking";
import { stepBroadcastCamera, type CameraFrame } from "../../game/logic/camera";
import { stepGoalkeeper, tryKeeperSave } from "../../game/logic/ai/goalkeeper";
import { nearestDefenderIndex, stepDefender } from "../../game/logic/ai/defender";
import { detectGoal, isPlayFrozen, MATCH_TUNING } from "../../game/logic/match";
import { playCrowdGroan, playCrowdRoar, playKick, playWhistle } from "../../game/logic/audio";
import type { Kinematics, MovementInput } from "../../game/types";

// Placeholder attributes until club data is wired in (Phase 9).
const CONTROLLED_ATTRS = { pace: 74, dribble: 72 };
const KEEPER_ATTRS = { pace: 66, dribble: 60 };
const DEFENDER_ATTRS = { pace: 70, dribble: 64 };

export function MatchScene() {
  const input = useKeyboardInput();
  const { camera } = useThree();

  const playerRef = useRef<THREE.Group>(null);
  const ballRef = useRef<THREE.Group>(null);
  const keeperRef = useRef<THREE.Group>(null);
  const defenderRefs = useRef<(THREE.Group | null)[]>([]);

  const params = useRef(paramsFromAttributes(CONTROLLED_ATTRS));
  const keeperParams = useRef(paramsFromAttributes(KEEPER_ATTRS));
  const defenderParams = useRef(paramsFromAttributes(DEFENDER_ATTRS));
  const camFrame = useRef<CameraFrame>({
    position: { x: 0, y: 26, z: 30 },
    lookAt: { x: 0, y: 0, z: 0 },
  });

  /** Pushes simulation bodies onto the three.js meshes. */
  const syncMeshes = (
    s: {
      player: Kinematics;
      ball: import("../../game/types").BallState;
      keeper: Kinematics;
      keeperState: { phase: string; diveDir: number };
      defenders: Kinematics[];
    },
    dt: number,
  ) => {
    if (playerRef.current) {
      playerRef.current.position.set(s.player.position.x, 0, s.player.position.z);
      playerRef.current.rotation.y = s.player.heading;
    }
    if (keeperRef.current) {
      keeperRef.current.position.set(s.keeper.position.x, 0, s.keeper.position.z);
      keeperRef.current.rotation.y = s.keeper.heading;
      // Tip the body over during a dive — cheap but reads instantly.
      keeperRef.current.rotation.x =
        s.keeperState.phase === "diving" ? s.keeperState.diveDir * 0.95 : 0;
    }
    s.defenders.forEach((d, i) => {
      const ref = defenderRefs.current[i];
      if (!ref) return;
      ref.position.set(d.position.x, 0, d.position.z);
      ref.rotation.y = d.heading;
    });
    if (ballRef.current) {
      ballRef.current.position.set(s.ball.position.x, s.ball.position.y, s.ball.position.z);
      const speed = Math.hypot(s.ball.velocity.x, s.ball.velocity.z);
      if (speed > 0.01 && dt > 0) {
        const axis = new THREE.Vector3(s.ball.velocity.z, 0, -s.ball.velocity.x).normalize();
        ballRef.current.rotateOnWorldAxis(axis, (speed / 0.36) * dt);
      }
    }
  };

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const store = useGameStore.getState();
    const keys = input.current;

    // --- match state machine ---
    // Non-playing statuses freeze the sim; the camera still runs below so the
    // celebration/kickoff shot stays alive.
    if (isPlayFrozen(store.matchStatus) || store.matchStatus === "kickoff") {
      const remaining = store.statusTimer - dt;
      if (store.matchStatus === "fulltime") {
        // Match over: hold everything.
      } else if (remaining > 0) {
        useGameStore.setState({ statusTimer: remaining });
      } else if (store.matchStatus === "kickoff") {
        useGameStore.setState({ matchStatus: "playing", statusTimer: 0, lastScorer: null });
      } else if (store.matchStatus === "goal") {
        store.resetPositions();
        useGameStore.setState({
          matchStatus: "kickoff",
          statusTimer: MATCH_TUNING.kickoffPause,
        });
      } else if (store.matchStatus === "halftime") {
        store.resetPositions();
        useGameStore.setState({
          period: store.period + 1,
          matchTime: 0,
          matchStatus: "kickoff",
          statusTimer: MATCH_TUNING.kickoffPause,
        });
      }

      const frozen = store.ball;
      camFrame.current = stepBroadcastCamera(
        camFrame.current,
        frozen.position,
        { x: 0, y: 0, z: 0 },
        dt,
      );
      const cf = camFrame.current;
      camera.position.set(cf.position.x, cf.position.y, cf.position.z);
      camera.lookAt(cf.lookAt.x, cf.lookAt.y, cf.lookAt.z);

      // Snap meshes to the (possibly reset) bodies so kickoff looks right.
      const s2 = useGameStore.getState();
      syncMeshes(s2, 0);
      return;
    }

    // --- clock ---
    const matchTime = store.matchTime + dt * MATCH_TUNING.clockScale;

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
      // No teammates yet, so no pass target to assist toward.
      const strike = resolveStrike(player, prevCharge);
      ball = applyImpulse(ball, strike.direction, strike.speed, strike.lift);
      cooldown = STRIKE_TUNING.cooldown;
    }

    // --- ball (dribble capture is suppressed right after a strike) ---
    if (cooldown <= 0) {
      ball = resolvePlayerBall(ball, player, PLAYER_RADIUS, dt);
    }
    ball = stepBall(ball, dt, { halfLength: PITCH.halfLength, halfWidth: PITCH.halfWidth });

    // --- goalkeeper ---
    const decision = stepGoalkeeper(store.keeper, store.keeperState, ball, DEFENDING_SIDE, dt);
    let keeper: Kinematics;
    if (decision.diveVelocity) {
      // Diving is scripted motion: drive the body directly rather than through
      // the acceleration model, so the dive stays snappy and readable.
      const v = decision.diveVelocity;
      keeper = {
        position: {
          x: store.keeper.position.x + v.x * dt,
          y: 0,
          z: store.keeper.position.z + v.z * dt,
        },
        velocity: { x: v.x, y: 0, z: v.z },
        heading: -DEFENDING_SIDE * (Math.PI / 2),
      };
    } else {
      keeper = stepMovement(store.keeper, decision.input, keeperParams.current, dt);
    }
    keeper = clampToPitch(keeper, PITCH.halfLength, PITCH.halfWidth, 1.5);

    const keeperState = decision.state;
    const saved = tryKeeperSave(ball, keeper, keeperState, DEFENDING_SIDE);
    if (saved) ball = saved;

    // --- outfield defenders ---
    const chaser = nearestDefenderIndex(store.defenders, ball);
    const defenders = store.defenders.map((d, i) => {
      const role = DEFENDER_ROLES[i] ?? DEFENDER_ROLES[0]!;
      const ai = stepDefender(d, role, ball, i === chaser);
      return clampToPitch(stepMovement(d, ai, defenderParams.current, dt), PITCH.halfLength, PITCH.halfWidth);
    });

    // Defenders shove the ball too, so a challenge actually wins possession.
    for (const d of defenders) {
      ball = resolvePlayerBall(ball, d, PLAYER_RADIUS, dt);
    }

    // --- goal detection & period end ---
    const goal = detectGoal(store.ball, ball);
    if (goal) {
      useGameStore.setState({ player, ball, charge, strikeCooldown: cooldown, keeper, keeperState, defenders, matchTime });
      useGameStore.getState().recordGoal(goal.scorer);
      return;
    }

    if (matchTime >= MATCH_TUNING.periodSeconds) {
      useGameStore.setState({
        matchTime: MATCH_TUNING.periodSeconds,
        matchStatus: store.period >= MATCH_TUNING.periods ? "fulltime" : "halftime",
        statusTimer: MATCH_TUNING.halfTimePause,
      });
      return;
    }

    useGameStore.setState({
      player,
      ball,
      matchTime,
      charge,
      strikeCooldown: cooldown,
      keeper,
      keeperState,
      defenders,
    });

    syncMeshes({ player, ball, keeper, keeperState, defenders }, dt);


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
      <Player ref={keeperRef} color="#f7c948" accent="#1d2b3a" />
      {DEFENDER_ROLES.map((role, i) => (
        <Player
          key={role.id}
          ref={(el) => {
            defenderRefs.current[i] = el;
          }}
          color="#2f6fd0"
          accent="#eef4ff"
        />
      ))}
      <Ball ref={ballRef} />
    </>
  );
}
