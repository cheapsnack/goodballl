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
  BALL_RADIUS,
  resolvePlayerBall,
  stepBall,
  STRIKE_TUNING,
} from "../../game/logic/ballPhysics";
import { canStrike, resolveStrike, stepCharge } from "../../game/logic/striking";
import {
  stepBroadcastCamera,
  stepRunCamera,
  type CameraFrame,
  type CameraMode,
} from "../../game/logic/camera";
import { stepGoalkeeper, tryKeeperSave } from "../../game/logic/ai/goalkeeper";
import { nearestDefenderIndex, stepDefender } from "../../game/logic/ai/defender";
import { detectGoal, isPlayFrozen, MATCH_TUNING } from "../../game/logic/match";
import { detectOutOfBounds } from "../../game/logic/restarts";
import { playCrowdGroan, playCrowdRoar, playKick, playWhistle } from "../../game/logic/audio";
import { getClub, playerAt, playersAt } from "../../game/data/clubs";
import type { BallState, Kinematics, MovementInput } from "../../game/types";

export function MatchScene() {
  const input = useKeyboardInput();
  const { camera } = useThree();

  const playerRef = useRef<THREE.Group>(null);
  const ballRef = useRef<THREE.Group>(null);
  const keeperRef = useRef<THREE.Group>(null);
  const defenderRefs = useRef<(THREE.Group | null)[]>([]);

  // Clubs are chosen on the menu before this component ever mounts, so a
  // one-time read here (not a subscription) is enough to pull rosters/kits.
  const { homeClubId, awayClubId } = useGameStore.getState();
  const homeClub = getClub(homeClubId);
  const awayClub = getClub(awayClubId);
  const controlledPlayer = playerAt(homeClub, "FWD");
  const keeperPlayer = playerAt(awayClub, "GK");
  const defenderPlayers = playersAt(awayClub, "DEF", DEFENDER_ROLES.length);

  const params = useRef(paramsFromAttributes(controlledPlayer.attributes));
  const keeperParams = useRef(paramsFromAttributes(keeperPlayer.attributes));
  const defenderParams = useRef(
    defenderPlayers.map((p) => paramsFromAttributes(p.attributes)),
  );
  const camFrame = useRef<CameraFrame>({
    position: { x: 0, y: 26, z: 30 },
    lookAt: { x: 0, y: 0, z: 0 },
  });
  /** Sticky chaser index so defenders don't flicker who's pressing the ball. */
  const chaserRef = useRef(-1);
  /** Edge-detects the camera toggle key (it's a held boolean, not a press event). */
  const cameraKeyHeld = useRef(false);

  /** Drives the three.js camera for one frame in whichever mode is active. */
  const applyCamera = (
    mode: CameraMode,
    ballPos: { x: number; y: number; z: number },
    ballVel: { x: number; y: number; z: number },
    playerPos: { x: number; y: number; z: number },
    playerHeading: number,
    dt: number,
  ) => {
    camFrame.current =
      mode === "run"
        ? stepRunCamera(camFrame.current, playerPos, playerHeading, dt)
        : stepBroadcastCamera(camFrame.current, ballPos, ballVel, dt);
    const f = camFrame.current;
    camera.position.set(f.position.x, f.position.y, f.position.z);
    camera.lookAt(f.lookAt.x, f.lookAt.y, f.lookAt.z);
  };

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

    // --- camera toggle (edge-detected: the key is a held boolean) ---
    let cameraMode = store.cameraMode;
    if (keys.cameraToggle && !cameraKeyHeld.current) {
      cameraMode = cameraMode === "broadcast" ? "run" : "broadcast";
      useGameStore.setState({ cameraMode });
    }
    cameraKeyHeld.current = keys.cameraToggle;

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
        playWhistle(); // kickoff whistle as play resumes
        useGameStore.setState({ matchStatus: "playing", statusTimer: 0, lastScorer: null });
      } else if (store.matchStatus === "goal") {
        store.resetPositions();
        useGameStore.setState({
          matchStatus: "kickoff",
          statusTimer: MATCH_TUNING.kickoffPause,
        });
      } else if (store.matchStatus === "restart" && store.restart) {
        // Drop the ball at the throw-in/corner/goal-kick spot and go live —
        // whoever gets there first (human or AI) plays it, same as a loose ball.
        const spot = store.restart.position;
        const placedBall: BallState = {
          position: { x: spot.x, y: BALL_RADIUS, z: spot.z },
          velocity: { x: 0, y: 0, z: 0 },
          heading: 0,
          spin: 0,
        };
        useGameStore.setState({
          ball: placedBall,
          lastTouch: store.restart.team,
          restart: null,
          matchStatus: "playing",
          statusTimer: 0,
        });
        playWhistle();
      } else if (store.matchStatus === "halftime") {
        store.resetPositions();
        useGameStore.setState({
          period: store.period + 1,
          matchTime: 0,
          matchStatus: "kickoff",
          statusTimer: MATCH_TUNING.kickoffPause,
        });
      }

      const s2 = useGameStore.getState();
      applyCamera(cameraMode, s2.ball.position, { x: 0, y: 0, z: 0 }, s2.player.position, s2.player.heading, dt);

      // Snap meshes to the (possibly reset) bodies so kickoff looks right.
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
    let lastTouch = store.lastTouch;

    if (released && canStrike(player, ball)) {
      // Shots get a light on-target nudge toward goal centre; no pass
      // target yet since there are no teammates on the pitch.
      const goalTarget =
        prevCharge.action === "shoot"
          ? { x: DEFENDING_SIDE * PITCH.halfLength, z: 0 }
          : undefined;
      const strike = resolveStrike(player, prevCharge, goalTarget);
      ball = applyImpulse(ball, strike.direction, strike.speed, strike.lift);
      cooldown = STRIKE_TUNING.cooldown;
      lastTouch = "home";
      playKick(prevCharge.power);
    }

    // --- ball (dribble capture is suppressed right after a strike) ---
    if (cooldown <= 0) {
      const beforeDribble = ball;
      ball = resolvePlayerBall(ball, player, PLAYER_RADIUS, dt);
      if (ball !== beforeDribble) lastTouch = "home";
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
    if (saved) {
      ball = saved;
      lastTouch = "away";
    }

    // --- outfield defenders ---
    // Sticky chaser: only the previous chaser or someone clearly closer
    // presses, so the pair doesn't flicker between them every frame.
    const chaser = nearestDefenderIndex(store.defenders, ball, chaserRef.current);
    chaserRef.current = chaser;
    const defenders = store.defenders.map((d, i) => {
      const role = DEFENDER_ROLES[i] ?? DEFENDER_ROLES[0]!;
      const ai = stepDefender(d, role, ball, i === chaser);
      const dParams = defenderParams.current[i] ?? defenderParams.current[0]!;
      return clampToPitch(stepMovement(d, ai, dParams, dt), PITCH.halfLength, PITCH.halfWidth);
    });

    // Defenders shove the ball too, so a challenge actually wins possession.
    for (const d of defenders) {
      const beforeContact = ball;
      ball = resolvePlayerBall(ball, d, PLAYER_RADIUS, dt);
      if (ball !== beforeContact) lastTouch = "away";
    }

    // --- goal detection, dead-ball restarts & period end ---
    const goal = detectGoal(store.ball, ball);
    if (goal) {
      useGameStore.setState({ player, ball, charge, strikeCooldown: cooldown, keeper, keeperState, defenders, matchTime, lastTouch });
      useGameStore.getState().recordGoal(goal.scorer);
      playWhistle();
      if (goal.scorer === "home") playCrowdRoar();
      else playCrowdGroan();
      return;
    }

    const outOfBounds = detectOutOfBounds(store.ball, ball, lastTouch);
    if (outOfBounds) {
      useGameStore.setState({
        player,
        ball,
        charge,
        strikeCooldown: cooldown,
        keeper,
        keeperState,
        defenders,
        matchTime,
        lastTouch,
        restart: outOfBounds,
        matchStatus: "restart",
        statusTimer: MATCH_TUNING.restartPause,
      });
      playWhistle();
      return;
    }

    if (matchTime >= MATCH_TUNING.periodSeconds) {
      playWhistle();
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
      lastTouch,
    });

    syncMeshes({ player, ball, keeper, keeperState, defenders }, dt);

    // --- camera ---
    applyCamera(cameraMode, ball.position, ball.velocity, player.position, player.heading, dt);
  });

  return (
    <>
      <Pitch />
      <Goal x={-PITCH_LENGTH / 2} side={-1} />
      <Goal x={PITCH_LENGTH / 2} side={1} />
      <Player ref={playerRef} color={homeClub.primaryColor} accent={homeClub.secondaryColor} />
      {/* Goalkeepers traditionally clash with the outfield kit regardless of club. */}
      <Player ref={keeperRef} color="#f7c948" accent="#1d2b3a" />
      {DEFENDER_ROLES.map((role, i) => (
        <Player
          key={role.id}
          ref={(el) => {
            defenderRefs.current[i] = el;
          }}
          color={awayClub.primaryColor}
          accent={awayClub.secondaryColor}
        />
      ))}
      <Ball ref={ballRef} />
    </>
  );
}
