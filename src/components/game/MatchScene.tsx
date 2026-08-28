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
  AWAY_DEFEND_SIDE,
  HOME_DEFEND_SIDE,
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
import {
  buildOutfield,
  nearestChaserIndex,
  nearestToBallIndex,
  stepOutfield,
} from "../../game/logic/ai/outfield";
import { detectGoal, isPlayFrozen, MATCH_TUNING, type TeamSide } from "../../game/logic/match";
import { detectOutOfBounds } from "../../game/logic/restarts";
import { playCrowdGroan, playCrowdRoar, playKick, playWhistle } from "../../game/logic/audio";
import { getClub, playerAt } from "../../game/data/clubs";
import type { BallState, Kinematics, MovementInput } from "../../game/types";

export function MatchScene() {
  const input = useKeyboardInput();
  const { camera } = useThree();

  // --- mesh refs ---
  const homeGKRef = useRef<THREE.Group>(null);
  const awayGKRef = useRef<THREE.Group>(null);
  const homeRefs = useRef<(THREE.Group | null)[]>([]);
  const awayRefs = useRef<(THREE.Group | null)[]>([]);
  const ballRef = useRef<THREE.Group>(null);

  // Clubs are chosen on the menu before this component ever mounts, so a
  // one-time read here (not a subscription) is enough to pull rosters/kits.
  const { homeClubId, awayClubId } = useGameStore.getState();
  const homeClub = getClub(homeClubId);
  const awayClub = getClub(awayClubId);
  const homeGKPlayer = playerAt(homeClub, "GK");
  const awayGKPlayer = playerAt(awayClub, "GK");

  // Rosters + formation roles, computed once — positions are re-derived by
  // the store on every kickoff, but attributes/roles never change mid-match.
  const homeXI = useRef(buildOutfield(homeClub, HOME_DEFEND_SIDE)).current;
  const awayXI = useRef(buildOutfield(awayClub, AWAY_DEFEND_SIDE)).current;

  const homeParams = useRef(homeXI.map((e) => paramsFromAttributes(e.player.attributes))).current;
  const awayParams = useRef(awayXI.map((e) => paramsFromAttributes(e.player.attributes))).current;
  const homeGKParams = useRef(paramsFromAttributes(homeGKPlayer.attributes)).current;
  const awayGKParams = useRef(paramsFromAttributes(awayGKPlayer.attributes)).current;

  const camFrame = useRef<CameraFrame>({
    position: { x: 0, y: 26, z: 30 },
    lookAt: { x: 0, y: 0, z: 0 },
  });
  /** Sticky chaser index per team so players don't flicker who's pressing. */
  const chaserRef = useRef({ home: -1, away: -1 });
  /** Edge-detects held-boolean keys (camera toggle, player switch). */
  const keyEdge = useRef({ camera: false, switchPlayer: false });

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
      homeOutfield: Kinematics[];
      homeGK: Kinematics;
      homeGKState: { phase: string; diveDir: number };
      awayOutfield: Kinematics[];
      awayGK: Kinematics;
      awayGKState: { phase: string; diveDir: number };
      ball: BallState;
    },
    dt: number,
  ) => {
    const placeGK = (ref: THREE.Group | null, gk: Kinematics, state: { phase: string; diveDir: number }) => {
      if (!ref) return;
      ref.position.set(gk.position.x, 0, gk.position.z);
      ref.rotation.y = gk.heading;
      ref.rotation.x = state.phase === "diving" ? state.diveDir * 0.95 : 0;
    };
    placeGK(homeGKRef.current, s.homeGK, s.homeGKState);
    placeGK(awayGKRef.current, s.awayGK, s.awayGKState);

    s.homeOutfield.forEach((p, i) => {
      const ref = homeRefs.current[i];
      if (!ref) return;
      ref.position.set(p.position.x, 0, p.position.z);
      ref.rotation.y = p.heading;
    });
    s.awayOutfield.forEach((p, i) => {
      const ref = awayRefs.current[i];
      if (!ref) return;
      ref.position.set(p.position.x, 0, p.position.z);
      ref.rotation.y = p.heading;
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

    // --- camera toggle & player switch (edge-detected: keys are held booleans) ---
    let cameraMode = store.cameraMode;
    if (keys.cameraToggle && !keyEdge.current.camera) {
      cameraMode = cameraMode === "broadcast" ? "run" : "broadcast";
      useGameStore.setState({ cameraMode });
    }
    keyEdge.current.camera = keys.cameraToggle;

    if (keys.switchPlayer && !keyEdge.current.switchPlayer) {
      const next = nearestToBallIndex(store.homeOutfield, store.ball);
      if (next !== store.controlledIndex) {
        useGameStore.setState({ controlledIndex: next });
      }
    }
    keyEdge.current.switchPlayer = keys.switchPlayer;

    // Re-read in case the switch just changed it.
    const controlledIndex = useGameStore.getState().controlledIndex;

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
      const controlled = s2.homeOutfield[s2.controlledIndex] ?? s2.homeOutfield[0]!;
      applyCamera(cameraMode, s2.ball.position, { x: 0, y: 0, z: 0 }, controlled.position, controlled.heading, dt);
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

    // --- controlled player (movement is dampened while winding up a strike) ---
    const move: MovementInput = charge.action
      ? {
          x: keys.x * STRIKE_TUNING.chargeMoveScale,
          z: keys.z * STRIKE_TUNING.chargeMoveScale,
          sprint: false,
        }
      : keys;

    const controlledBefore = store.homeOutfield[controlledIndex] ?? store.homeOutfield[0]!;
    const controlledParams = homeParams[controlledIndex] ?? homeParams[0]!;
    let controlled = stepMovement(controlledBefore, move, controlledParams, dt);
    controlled = clampToPitch(controlled, PITCH.halfLength, PITCH.halfWidth);

    // --- strike ---
    let ball = store.ball;
    let cooldown = Math.max(0, store.strikeCooldown - dt);
    let lastTouch: TeamSide = store.lastTouch;

    if (released && canStrike(controlled, ball)) {
      // Shots get a light on-target nudge toward goal centre; passing has no
      // teammate-lock-on target yet, so it's pure facing direction.
      const goalTarget =
        prevCharge.action === "shoot" ? { x: -HOME_DEFEND_SIDE * PITCH.halfLength, z: 0 } : undefined;
      const strike = resolveStrike(controlled, prevCharge, goalTarget);
      ball = applyImpulse(ball, strike.direction, strike.speed, strike.lift);
      cooldown = STRIKE_TUNING.cooldown;
      lastTouch = "home";
      playKick(prevCharge.power);
    }

    // --- ball (dribble capture is suppressed right after a strike) ---
    if (cooldown <= 0) {
      const beforeDribble = ball;
      ball = resolvePlayerBall(ball, controlled, PLAYER_RADIUS, dt);
      if (ball !== beforeDribble) lastTouch = "home";
    }
    ball = stepBall(ball, dt, { halfLength: PITCH.halfLength, halfWidth: PITCH.halfWidth });

    // --- home goalkeeper ---
    const homeDecision = stepGoalkeeper(store.homeGK, store.homeGKState, ball, HOME_DEFEND_SIDE, dt);
    let homeGK = driveGoalkeeper(store.homeGK, homeDecision, homeGKParams, HOME_DEFEND_SIDE, dt);
    const homeGKState = homeDecision.state;
    const homeSave = tryKeeperSave(ball, homeGK, homeGKState, HOME_DEFEND_SIDE);
    if (homeSave) {
      ball = homeSave;
      lastTouch = "away";
    }

    // --- away goalkeeper ---
    const awayDecision = stepGoalkeeper(store.awayGK, store.awayGKState, ball, AWAY_DEFEND_SIDE, dt);
    let awayGK = driveGoalkeeper(store.awayGK, awayDecision, awayGKParams, AWAY_DEFEND_SIDE, dt);
    const awayGKState = awayDecision.state;
    const awaySave = tryKeeperSave(ball, awayGK, awayGKState, AWAY_DEFEND_SIDE);
    if (awaySave) {
      ball = awaySave;
      lastTouch = "home";
    }

    // --- home outfield (9 AI teammates + the controlled player) ---
    const homeChaser = nearestChaserIndex(store.homeOutfield, ball, chaserRef.current.home);
    chaserRef.current.home = homeChaser;
    const homeOutfield = store.homeOutfield.map((p, i) => {
      if (i === controlledIndex) return controlled;
      const ai = stepOutfield(p, homeXI[i]!.role, ball, i === homeChaser);
      const params = homeParams[i] ?? homeParams[0]!;
      return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
    });

    // --- away outfield (all 10 AI) ---
    const awayChaser = nearestChaserIndex(store.awayOutfield, ball, chaserRef.current.away);
    chaserRef.current.away = awayChaser;
    const awayOutfield = store.awayOutfield.map((p, i) => {
      const ai = stepOutfield(p, awayXI[i]!.role, ball, i === awayChaser);
      const params = awayParams[i] ?? awayParams[0]!;
      return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
    });

    // Everyone but the controlled player only shoves the ball via body
    // contact (no intentional dribble pull) — a simplified stand-in for
    // teammates/opponents winning or deflecting a loose ball.
    for (let i = 0; i < homeOutfield.length; i++) {
      if (i === controlledIndex) continue;
      const before = ball;
      ball = resolvePlayerBall(ball, homeOutfield[i]!, PLAYER_RADIUS, dt);
      if (ball !== before) lastTouch = "home";
    }
    for (const p of awayOutfield) {
      const before = ball;
      ball = resolvePlayerBall(ball, p, PLAYER_RADIUS, dt);
      if (ball !== before) lastTouch = "away";
    }

    // --- goal detection, dead-ball restarts & period end ---
    const goal = detectGoal(store.ball, ball);
    if (goal) {
      useGameStore.setState({
        homeOutfield,
        homeGK,
        homeGKState,
        awayOutfield,
        awayGK,
        awayGKState,
        ball,
        charge,
        strikeCooldown: cooldown,
        matchTime,
        lastTouch,
      });
      useGameStore.getState().recordGoal(goal.scorer);
      playWhistle();
      if (goal.scorer === "home") playCrowdRoar();
      else playCrowdGroan();
      return;
    }

    const outOfBounds = detectOutOfBounds(store.ball, ball, lastTouch);
    if (outOfBounds) {
      useGameStore.setState({
        homeOutfield,
        homeGK,
        homeGKState,
        awayOutfield,
        awayGK,
        awayGKState,
        ball,
        charge,
        strikeCooldown: cooldown,
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
      homeOutfield,
      homeGK,
      homeGKState,
      awayOutfield,
      awayGK,
      awayGKState,
      ball,
      matchTime,
      charge,
      strikeCooldown: cooldown,
      lastTouch,
    });

    syncMeshes({ homeOutfield, homeGK, homeGKState, awayOutfield, awayGK, awayGKState, ball }, dt);

    // --- camera ---
    applyCamera(cameraMode, ball.position, ball.velocity, controlled.position, controlled.heading, dt);
  });

  return (
    <>
      <Pitch />
      <Goal x={-PITCH_LENGTH / 2} side={-1} />
      <Goal x={PITCH_LENGTH / 2} side={1} />

      {/* Goalkeepers traditionally clash with the outfield kit regardless of club. */}
      <Player ref={homeGKRef} color="#f7c948" accent="#1d2b3a" />
      <Player ref={awayGKRef} color="#f7c948" accent="#1d2b3a" />

      {homeXI.map((entity, i) => (
        <Player
          key={entity.role.id}
          ref={(el) => {
            homeRefs.current[i] = el;
          }}
          color={homeClub.primaryColor}
          accent={homeClub.secondaryColor}
        />
      ))}
      {awayXI.map((entity, i) => (
        <Player
          key={entity.role.id}
          ref={(el) => {
            awayRefs.current[i] = el;
          }}
          color={awayClub.primaryColor}
          accent={awayClub.secondaryColor}
        />
      ))}

      <Ball ref={ballRef} />
    </>
  );
}

/**
 * Shared goalkeeper drive step for either side — diving is scripted motion
 * (drives the body directly rather than through the acceleration model, so
 * the dive stays snappy and readable); otherwise it's regular stepMovement.
 */
function driveGoalkeeper(
  state: Kinematics,
  decision: ReturnType<typeof stepGoalkeeper>,
  params: ReturnType<typeof paramsFromAttributes>,
  side: 1 | -1,
  dt: number,
): Kinematics {
  if (decision.diveVelocity) {
    const v = decision.diveVelocity;
    const next: Kinematics = {
      position: {
        x: state.position.x + v.x * dt,
        y: 0,
        z: state.position.z + v.z * dt,
      },
      velocity: { x: v.x, y: 0, z: v.z },
      heading: -side * (Math.PI / 2),
    };
    return clampToPitch(next, PITCH.halfLength, PITCH.halfWidth, 1.5);
  }
  const next = stepMovement(state, decision.input, params, dt);
  return clampToPitch(next, PITCH.halfLength, PITCH.halfWidth, 1.5);
}
