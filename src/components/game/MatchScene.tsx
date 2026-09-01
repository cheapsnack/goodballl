import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { Pitch } from "./Pitch";
import { Goal } from "./Goal";
import { Player, PLAYER_HEIGHT } from "./Player";
import { Ball } from "./Ball";
import { PITCH_LENGTH } from "./pitchTexture";

import { useKeyboardInput, LOCAL_P1_KEYS, LOCAL_P2_KEYS, SOLO_KEYS } from "../../hooks/useKeyboardInput";
import { AWAY_DEFEND_SIDE, HOME_DEFEND_SIDE, PITCH, useGameStore } from "../../game/store/useGameStore";
import { clampToPitch, paramsFromAttributes, stepMovement } from "../../game/logic/movement";
import { applyImpulse, BALL_RADIUS, stepBall, STRIKE_TUNING } from "../../game/logic/ballPhysics";
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
  dribbleTowardGoal,
  jockeyDefender,
  aiShotDirection,
} from "../../game/logic/ai/outfield";
import { DIFFICULTY_TUNING } from "../../game/logic/ai/difficulty";
import { possessionBallPosition, tryCapture, type Possession } from "../../game/logic/possession";
import { detectGoal, isPlayFrozen, MATCH_TUNING, type TeamSide } from "../../game/logic/match";
import {
  clearSpaceAroundRestart,
  detectOutOfBounds,
  headingTo,
  RESTART_CLEARANCE,
} from "../../game/logic/restarts";
import { playCrowdGroan, playCrowdRoar, playKick, playWhistle } from "../../game/logic/audio";
import { attemptTackleImpulse, tackleDash, TACKLE_TUNING } from "../../game/logic/tackle";
import { getClub, playerAt } from "../../game/data/clubs";
import { useRoomChannel } from "../../multiplayer/useRoomChannel";
import { buildSnapshot, applySnapshot } from "../../multiplayer/snapshot";
import type { GuestInputPayload } from "../../multiplayer/types";
import type { BallState, Kinematics, MovementInput } from "../../game/types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Reference top speed used only to normalize "how fast is the possessor going" for the dribble hold-distance — not a gameplay cap. */
const POSSESSION_SPEED_REF = 14;

const IDLE_GUEST_INPUT: GuestInputPayload = {
  x: 0,
  z: 0,
  sprint: false,
  shoot: false,
  pass: false,
  loft: false,
  cameraToggle: false,
  switchPlayer: false,
  tackle: false,
};

export function MatchScene() {
  // Clubs, networking role and room are chosen on the menu before this
  // component ever mounts, so a one-time read here (not a subscription) is
  // enough — none of them change mid-match.
  const { homeClubId, awayClubId, netRole, roomCode, difficulty } = useGameStore.getState();
  const diff = DIFFICULTY_TUNING[difficulty];

  // Local 2P reassigns P1 to WASD-only (arrows go to P2); every other mode
  // keeps the original WASD-or-arrows single scheme. The P2 stream is
  // always mounted (hooks can't be conditional) but only ever consumed
  // when netRole is "local2p".
  const input = useKeyboardInput(netRole === "local2p" ? LOCAL_P1_KEYS : SOLO_KEYS);
  const input2 = useKeyboardInput(LOCAL_P2_KEYS);
  const { camera } = useThree();

  // --- mesh refs ---
  const homeGKRef = useRef<THREE.Group>(null);
  const awayGKRef = useRef<THREE.Group>(null);
  const homeRefs = useRef<(THREE.Group | null)[]>([]);
  const awayRefs = useRef<(THREE.Group | null)[]>([]);
  const ballRef = useRef<THREE.Group>(null);
  /** Floating marker above whichever player this screen currently controls. */
  const indicatorRef = useRef<THREE.Group>(null);
  /** Ground ring under that same player. */
  const indicatorRingRef = useRef<THREE.Mesh>(null);

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
  /** Per-player shot decision state, indexed like homeXI/awayXI — cooldown gates repeat shots; windup delays the strike itself for a cheap "reaction time" feel. */
  const homeShotState = useRef(
    homeXI.map(() => ({ cooldown: 0, windupUntil: 0, windupDir: null as { x: number; z: number } | null })),
  ).current;
  const awayShotState = useRef(
    awayXI.map(() => ({ cooldown: 0, windupUntil: 0, windupDir: null as { x: number; z: number } | null })),
  ).current;
  const homeGKParams = useRef(paramsFromAttributes(homeGKPlayer.attributes)).current;
  const awayGKParams = useRef(paramsFromAttributes(awayGKPlayer.attributes)).current;

  const camFrame = useRef<CameraFrame>({
    position: { x: 0, y: 26, z: 30 },
    lookAt: { x: 0, y: 0, z: 0 },
  });
  /** Sticky chaser index per team so players don't flicker who's pressing. */
  const chaserRef = useRef({ home: -1, away: -1 });
  /** Edge-detects held-boolean keys (camera toggle, player switch). */
  const keyEdge = useRef({ camera: false, switchPlayer: false, tackle: false });
  /** Host-side: edge-detects the guest's switch-player key from the network stream. */
  const guestKeyEdge = useRef(false);
  /** Host-side: edge-detects the guest's tackle key from the network stream. */
  const guestTackleKeyEdge = useRef(false);
  /** Home controlled player's tackle cooldown / active-contact window. */
  const tackleState = useRef({ cooldown: 0, active: 0 });
  /** Away controlled player's (guest's) tackle cooldown / active-contact window. */
  const awayTackleState = useRef({ cooldown: 0, active: 0 });
  /**
   * Whoever most recently released the ball (shot, passed, or got tackled)
   * is excluded from capturing it again until this expires — without this,
   * a shot or pass gets instantly re-swallowed by the very player who just
   * kicked it, since they're still standing right where it started.
   */
  const recentRelease = useRef<{ team: TeamSide; index: number; until: number } | null>(null);
  /** Host-side: the latest input the guest has sent (updated async, off the frame loop). */
  const guestInputRef = useRef<GuestInputPayload>(IDLE_GUEST_INPUT);
  /** Host-side: throttles how often a state snapshot is broadcast. */
  const broadcastTick = useRef(0);

  // Only set up a realtime channel for a networked match — for local
  // single-player, `code` is null and the hook is a no-op.
  const channel = useRoomChannel(netRole === "local" ? null : roomCode, {
    onInput: (payload) => {
      guestInputRef.current = payload;
    },
    onState: (snapshot) => {
      useGameStore.setState(applySnapshot(snapshot));
    },
  });

  /** Host only: throttled broadcast of the current frame to the guest. */
  const maybeBroadcastState = () => {
    if (netRole !== "host") return;
    broadcastTick.current++;
    if (broadcastTick.current % 2 !== 0) return; // ~30Hz at a 60fps frame rate
    const s = useGameStore.getState();
    channel.sendState(
      buildSnapshot({
        homeOutfield: s.homeOutfield,
        homeGK: s.homeGK,
        homeGKState: s.homeGKState,
        awayOutfield: s.awayOutfield,
        awayGK: s.awayGK,
        awayGKState: s.awayGKState,
        ball: s.ball,
        controlledIndex: s.controlledIndex,
        awayControlledIndex: s.awayControlledIndex,
        score: s.score,
        matchTime: s.matchTime,
        period: s.period,
        matchStatus: s.matchStatus,
        statusTimer: s.statusTimer,
        lastScorer: s.lastScorer,
      }),
    );
  };

  /** Floats the "you are here" marker above whichever player this screen controls. */
  const placeIndicator = (pos: { x: number; z: number }, elapsed: number) => {
    if (indicatorRef.current) {
      const bob = Math.sin(elapsed * 4) * 0.12;
      indicatorRef.current.position.set(pos.x, PLAYER_HEIGHT + 0.55 + bob, pos.z);
      indicatorRef.current.rotation.y = elapsed * 2;
    }
    if (indicatorRingRef.current) {
      indicatorRingRef.current.position.set(pos.x, 0.03, pos.z);
      const pulse = 1 + Math.sin(elapsed * 4) * 0.08;
      indicatorRingRef.current.scale.set(pulse, pulse, 1);
    }
  };

  /** Bumps a one-shot animation counter on a player's ref — Player.tsx watches for the change. */
  const bumpAnim = (group: THREE.Group | null, field: "kickCount" | "tackleCount") => {
    if (!group) return;
    const data = group.userData as { kickCount?: number; tackleCount?: number };
    data[field] = (data[field] ?? 0) + 1;
  };

  /** Scales an AI player's movement params by the difficulty's speed multiplier. Never applied to a human-controlled body. */
  const scaleParams = (p: ReturnType<typeof paramsFromAttributes>) => ({
    ...p,
    accel: p.accel * diff.speedMult,
    maxSpeed: p.maxSpeed * diff.speedMult,
  });

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
      ref.userData["speed"] = Math.hypot(gk.velocity.x, gk.velocity.z);
    };
    placeGK(homeGKRef.current, s.homeGK, s.homeGKState);
    placeGK(awayGKRef.current, s.awayGK, s.awayGKState);

    s.homeOutfield.forEach((p, i) => {
      const ref = homeRefs.current[i];
      if (!ref) return;
      ref.position.set(p.position.x, 0, p.position.z);
      ref.rotation.y = p.heading;
      ref.userData["speed"] = Math.hypot(p.velocity.x, p.velocity.z);
    });
    s.awayOutfield.forEach((p, i) => {
      const ref = awayRefs.current[i];
      if (!ref) return;
      ref.position.set(p.position.x, 0, p.position.z);
      ref.rotation.y = p.heading;
      ref.userData["speed"] = Math.hypot(p.velocity.x, p.velocity.z);
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

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const store = useGameStore.getState();
    const keys = input.current;

    // --- camera toggle (always local — each screen picks its own view) ---
    let cameraMode = store.cameraMode;
    if (keys.cameraToggle && !keyEdge.current.camera) {
      cameraMode = cameraMode === "broadcast" ? "run" : "broadcast";
      useGameStore.setState({ cameraMode });
    }
    keyEdge.current.camera = keys.cameraToggle;

    // --- guest: never simulates locally, just relays input and renders ---
    // whatever the host's last broadcast put in the store.
    if (netRole === "guest") {
      channel.sendInput(keys);
      const s = useGameStore.getState();
      const idx = s.awayControlledIndex ?? 0;
      const controlled = s.awayOutfield[idx] ?? s.awayOutfield[0]!;
      applyCamera(
        cameraMode,
        s.ball.position,
        { x: s.ball.velocity.x, y: 0, z: s.ball.velocity.z },
        controlled.position,
        controlled.heading,
        dt,
      );
      syncMeshes(s, dt);
      placeIndicator(controlled.position, state.clock.elapsedTime);
      return;
    }

    // --- player switch (home side: local human, or host's own player) ---
    if (keys.switchPlayer && !keyEdge.current.switchPlayer) {
      const next = nearestToBallIndex(store.homeOutfield, store.ball);
      if (next !== store.controlledIndex) {
        useGameStore.setState({ controlledIndex: next });
      }
    }
    keyEdge.current.switchPlayer = keys.switchPlayer;

    // --- player switch (away side: guest or local P2) ---
    let awayControlledIndex = store.awayControlledIndex;
    if ((netRole === "host" || netRole === "local2p") && awayControlledIndex !== null) {
      const guestKeys = netRole === "host" ? guestInputRef.current : input2.current;
      if (guestKeys.switchPlayer && !guestKeyEdge.current) {
        const next = nearestToBallIndex(store.awayOutfield, store.ball);
        if (next !== awayControlledIndex) {
          awayControlledIndex = next;
          useGameStore.setState({ awayControlledIndex });
        }
      }
      guestKeyEdge.current = guestKeys.switchPlayer;
    }

    const controlledIndex = useGameStore.getState().controlledIndex;

    // --- match state machine ---
    // Non-playing statuses freeze the sim; the camera still runs below so the
    // celebration/kickoff shot stays alive.
    if (isPlayFrozen(store.matchStatus) || store.matchStatus === "kickoff") {
      const remaining = store.statusTimer - dt;
      if (store.matchStatus === "fulltime") {
        // Match over: hold everything.
      } else if (remaining > 0) {
        if (store.matchStatus === "restart" && store.restart) {
          // Keep everyone moving into position during the restart countdown
          // instead of freezing solid — real players don't stand like
          // statues waiting for a throw-in. The ball itself stays put; only
          // outfield bodies drift toward a sensible shape around where the
          // restart will actually happen.
          const spot = store.restart.position;
          const refBall: BallState = {
            position: { x: spot.x, y: BALL_RADIUS, z: spot.z },
            velocity: { x: 0, y: 0, z: 0 },
            heading: 0,
            spin: 0,
          };
          const hasAwayHumanNow = (netRole === "host" || netRole === "local2p") && awayControlledIndex !== null;
          const awayKeysNow = netRole === "host" ? guestInputRef.current : input2.current;

          const homeOutfield = store.homeOutfield.map((p, i) => {
            const params = homeParams[i] ?? homeParams[0]!;
            if (i === controlledIndex) {
              return clampToPitch(stepMovement(p, keys, params, dt), PITCH.halfLength, PITCH.halfWidth);
            }
            const ai = stepOutfield(p, homeXI[i]!.role, refBall, false);
            return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
          });
          const awayOutfield = store.awayOutfield.map((p, i) => {
            const params = awayParams[i] ?? awayParams[0]!;
            if (hasAwayHumanNow && i === awayControlledIndex) {
              return clampToPitch(stepMovement(p, awayKeysNow, params, dt), PITCH.halfLength, PITCH.halfWidth);
            }
            const ai = stepOutfield(p, awayXI[i]!.role, refBall, false);
            return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
          });

          useGameStore.setState({ statusTimer: remaining, homeOutfield, awayOutfield });
        } else {
          useGameStore.setState({ statusTimer: remaining });
        }
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
        // clearing the non-taking side back gives it a clean restart instead
        // of an instant, ball-hugging challenge right on the boundary.
        const { type, team, position: spot } = store.restart;
        let placedBall: BallState = {
          position: { x: spot.x, y: BALL_RADIUS, z: spot.z },
          velocity: { x: 0, y: 0, z: 0 },
          heading: 0,
          spin: 0,
        };

        const minDist = RESTART_CLEARANCE[type];
        let nextHomeOutfield = store.homeOutfield;
        let nextAwayOutfield = store.awayOutfield;
        if (team === "home") {
          nextAwayOutfield = clearSpaceAroundRestart(nextAwayOutfield, spot, minDist);
        } else {
          nextHomeOutfield = clearSpaceAroundRestart(nextHomeOutfield, spot, minDist);
        }

        let nextHomeGK = store.homeGK;
        let nextAwayGK = store.awayGK;
        let possessionGrant: Possession | null = null;

        if (type === "goalkick") {
          // The goalkeeper takes it — put them on the spot facing upfield.
          const gkBody: Kinematics = {
            position: { x: spot.x, y: 0, z: spot.z },
            velocity: { x: 0, y: 0, z: 0 },
            heading: headingTo(spot, { x: 0, z: 0 }),
          };
          if (team === "home") nextHomeGK = gkBody;
          else nextAwayGK = gkBody;

          // Auto-launch the clearance — there's no human-controllable
          // goalkeeper in this game to manually take a goal kick, and real
          // goal kicks are struck long immediately anyway.
          const attackDir = team === "home" ? 1 : -1;
          const lateral = (Math.random() - 0.5) * 0.7;
          placedBall = applyImpulse(placedBall, { x: attackDir, z: lateral }, 13, 4);
        } else {
          // Throw-in / corner: bring the taking side's controlled player to
          // the spot and hand them the ball directly, so whoever's playing
          // can act immediately instead of having to run over and win it.
          const setback = type === "corner" ? 1.4 : 1;
          const towardCentre = { x: spot.x > 0 ? -1 : 1, z: spot.z > 0 ? -1 : 1 };
          const takerPos = {
            x: clamp(spot.x + towardCentre.x * setback, -PITCH.halfLength + 1, PITCH.halfLength - 1),
            z: clamp(spot.z + towardCentre.z * setback, -PITCH.halfWidth + 1, PITCH.halfWidth - 1),
          };
          const takerBody: Kinematics = {
            position: { x: takerPos.x, y: 0, z: takerPos.z },
            velocity: { x: 0, y: 0, z: 0 },
            heading: headingTo(takerPos, spot),
          };
          if (team === "home") {
            nextHomeOutfield = nextHomeOutfield.map((p, i) =>
              i === store.controlledIndex ? takerBody : p,
            );
            possessionGrant = { team: "home", index: store.controlledIndex };
          } else if (store.awayControlledIndex !== null) {
            const idx = store.awayControlledIndex;
            nextAwayOutfield = nextAwayOutfield.map((p, i) => (i === idx ? takerBody : p));
            possessionGrant = { team: "away", index: idx };
          }
        }

        useGameStore.setState({
          ball: placedBall,
          homeOutfield: nextHomeOutfield,
          awayOutfield: nextAwayOutfield,
          homeGK: nextHomeGK,
          awayGK: nextAwayGK,
          lastTouch: team,
          restart: null,
          restartLock: team,
          possession: possessionGrant,
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
      placeIndicator(controlled.position, state.clock.elapsedTime);
      maybeBroadcastState();
      return;
    }

    // --- clock ---
    const matchTime = store.matchTime + dt * MATCH_TUNING.clockScale;

    // --- home controlled player (movement is dampened while winding up a strike) ---
    const prevCharge = store.charge;
    const charge = stepCharge(prevCharge, keys, dt);
    const released = prevCharge.action !== null && charge.action === null;

    const move: MovementInput = charge.action
      ? { x: keys.x * STRIKE_TUNING.chargeMoveScale, z: keys.z * STRIKE_TUNING.chargeMoveScale, sprint: false }
      : keys;

    const controlledBefore = store.homeOutfield[controlledIndex] ?? store.homeOutfield[0]!;
    const controlledParams = homeParams[controlledIndex] ?? homeParams[0]!;
    let controlled = stepMovement(controlledBefore, move, controlledParams, dt);
    controlled = clampToPitch(controlled, PITCH.halfLength, PITCH.halfWidth);

    // --- tackle: home controlled player (one-shot dash, not a hold) ---
    tackleState.current.cooldown = Math.max(0, tackleState.current.cooldown - dt);
    tackleState.current.active = Math.max(0, tackleState.current.active - dt);
    if (keys.tackle && !keyEdge.current.tackle && tackleState.current.cooldown <= 0) {
      const dash = tackleDash(controlled.heading);
      controlled = {
        ...controlled,
        velocity: { x: controlled.velocity.x + dash.x, y: 0, z: controlled.velocity.z + dash.z },
      };
      tackleState.current.cooldown = TACKLE_TUNING.cooldown;
      tackleState.current.active = TACKLE_TUNING.activeWindow;
      bumpAnim(homeRefs.current[controlledIndex] ?? null, "tackleCount");
    }
    keyEdge.current.tackle = keys.tackle;

    // --- away controlled player (host's guest, or local player 2) ---
    const hasAwayHuman = (netRole === "host" || netRole === "local2p") && awayControlledIndex !== null;
    const prevAwayCharge = store.awayCharge;
    let awayCharge = prevAwayCharge;
    let awayReleased = false;
    let awayControlled: Kinematics | null = null;

    if (hasAwayHuman) {
      const guestKeys = netRole === "host" ? guestInputRef.current : input2.current;
      awayCharge = stepCharge(prevAwayCharge, guestKeys, dt);
      awayReleased = prevAwayCharge.action !== null && awayCharge.action === null;

      const awayMove: MovementInput = awayCharge.action
        ? { x: guestKeys.x * STRIKE_TUNING.chargeMoveScale, z: guestKeys.z * STRIKE_TUNING.chargeMoveScale, sprint: false }
        : guestKeys;

      const idx = awayControlledIndex!;
      const awayControlledBefore = store.awayOutfield[idx] ?? store.awayOutfield[0]!;
      const awayControlledParams = awayParams[idx] ?? awayParams[0]!;
      awayControlled = clampToPitch(
        stepMovement(awayControlledBefore, awayMove, awayControlledParams, dt),
        PITCH.halfLength,
        PITCH.halfWidth,
      );

      // --- tackle: away controlled player (guest), relayed through the host ---
      awayTackleState.current.cooldown = Math.max(0, awayTackleState.current.cooldown - dt);
      awayTackleState.current.active = Math.max(0, awayTackleState.current.active - dt);
      if (guestKeys.tackle && !guestTackleKeyEdge.current && awayTackleState.current.cooldown <= 0) {
        const dash = tackleDash(awayControlled.heading);
        awayControlled = {
          ...awayControlled,
          velocity: { x: awayControlled.velocity.x + dash.x, y: 0, z: awayControlled.velocity.z + dash.z },
        };
        awayTackleState.current.cooldown = TACKLE_TUNING.cooldown;
        awayTackleState.current.active = TACKLE_TUNING.activeWindow;
        bumpAnim(awayRefs.current[idx] ?? null, "tackleCount");
      }
      guestTackleKeyEdge.current = guestKeys.tackle;
    }

    // --- shared frame state ---
    let ball = store.ball;
    let cooldown = Math.max(0, store.strikeCooldown - dt);
    let awayCooldown = Math.max(0, store.awayStrikeCooldown - dt);
    let lastTouch: TeamSide = store.lastTouch;
    // While set, only this team may touch (and therefore strike) the ball —
    // see the dead-ball restart placement above for why.
    let restartLock: TeamSide | null = store.restartLock;
    // Who has the ball glued to their feet right now, if anyone. This is
    // resolved to a final value at the very end of the frame.
    let possession = store.possession;

    // --- strikes: releasing the charge always gives up possession ---
    if (released && canStrike(controlled, ball) && (restartLock === null || restartLock === "home")) {
      // Shots get a light on-target nudge toward goal centre; passing has no
      // teammate-lock-on target yet, so it's pure facing direction.
      const goalTarget =
        prevCharge.action === "shoot" ? { x: -HOME_DEFEND_SIDE * PITCH.halfLength, z: 0 } : undefined;
      const strike = resolveStrike(controlled, prevCharge, goalTarget);
      ball = applyImpulse(ball, strike.direction, strike.speed, strike.lift);
      cooldown = STRIKE_TUNING.cooldown;
      lastTouch = "home";
      restartLock = null;
      possession = null;
      recentRelease.current = {
        team: "home",
        index: controlledIndex,
        until: state.clock.elapsedTime + STRIKE_TUNING.cooldown,
      };
      playKick(prevCharge.power);
      bumpAnim(homeRefs.current[controlledIndex] ?? null, "kickCount");
    }

    if (
      awayControlled &&
      awayReleased &&
      canStrike(awayControlled, ball) &&
      (restartLock === null || restartLock === "away")
    ) {
      const goalTarget =
        prevAwayCharge.action === "shoot" ? { x: -AWAY_DEFEND_SIDE * PITCH.halfLength, z: 0 } : undefined;
      const strike = resolveStrike(awayControlled, prevAwayCharge, goalTarget);
      ball = applyImpulse(ball, strike.direction, strike.speed, strike.lift);
      awayCooldown = STRIKE_TUNING.cooldown;
      lastTouch = "away";
      restartLock = null;
      possession = null;
      recentRelease.current = {
        team: "away",
        index: awayControlledIndex ?? 0,
        until: state.clock.elapsedTime + STRIKE_TUNING.cooldown,
      };
      playKick(prevAwayCharge.power);
      bumpAnim(awayRefs.current[awayControlledIndex ?? 0] ?? null, "kickCount");
    }

    // --- home outfield (AI teammates + the controlled player) ---
    // Movement resolves first, using last frame's ball position for chase/
    // zonal targeting; final ball placement (glued to whoever ends up with
    // it) happens afterward, once everyone's new position is known.
    const homeChaser = nearestChaserIndex(store.homeOutfield, store.ball, chaserRef.current.home);
    chaserRef.current.home = homeChaser;
    const homeGoalX = -HOME_DEFEND_SIDE * PITCH.halfLength; // opponent's goal — home attacks here
    const homeOutfield = store.homeOutfield.map((p, i) => {
      if (i === controlledIndex) return controlled;

      const shotState = homeShotState[i]!;
      shotState.cooldown = Math.max(0, shotState.cooldown - dt);

      // Mid wind-up takes priority over everything else — finish the motion
      // before making any new decision, so a shot always actually fires.
      if (shotState.windupUntil > 0) {
        if (state.clock.elapsedTime >= shotState.windupUntil) {
          if (restartLock === null || restartLock === "home") {
            const dir = shotState.windupDir ?? aiShotDirection(p, homeGoalX, diff.shotAccuracy);
            ball = applyImpulse(ball, dir, diff.shotPower, 0.12);
            lastTouch = "home";
            restartLock = null;
            possession = null;
            recentRelease.current = { team: "home", index: i, until: state.clock.elapsedTime + STRIKE_TUNING.cooldown };
            bumpAnim(homeRefs.current[i] ?? null, "kickCount");
            playKick(0.6);
          }
          shotState.cooldown = diff.decisionCooldown;
          shotState.windupUntil = 0;
          shotState.windupDir = null;
        }
        return clampToPitch(
          stepMovement(p, { x: 0, z: 0, sprint: false }, homeParams[i] ?? homeParams[0]!, dt),
          PITCH.halfLength,
          PITCH.halfWidth,
        );
      }

      const iAmPossessor = possession !== null && possession.team === "home" && possession.index === i;
      if (iAmPossessor && (restartLock === null || restartLock === "home")) {
        const distToGoal = Math.hypot(homeGoalX - p.position.x, p.position.z);
        if (shotState.cooldown <= 0 && distToGoal < diff.shootRange) {
          // Decide now, strike after a short wind-up — a cheap stand-in for
          // reaction time that also gives the shot a readable animation beat.
          shotState.windupUntil = state.clock.elapsedTime + diff.shotWindup;
          shotState.windupDir = aiShotDirection(p, homeGoalX, diff.shotAccuracy);
          return clampToPitch(
            stepMovement(p, { x: 0, z: 0, sprint: false }, homeParams[i] ?? homeParams[0]!, dt),
            PITCH.halfLength,
            PITCH.halfWidth,
          );
        }
        const ai = dribbleTowardGoal(p, homeGoalX, store.awayOutfield, store.homeOutfield);
        const params = scaleParams(homeParams[i] ?? homeParams[0]!);
        return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
      }

      const isChaserNow = i === homeChaser;
      // If the opponent has the ball and we're a defensive-line/mid player,
      // jockey instead of holding a static zone — that's what makes the
      // AI "come out to press" rather than just standing there.
      const carrier: Kinematics | null =
        possession && possession.team === "away"
          ? hasAwayHuman && possession.index === awayControlledIndex && awayControlled
            ? awayControlled
            : store.awayOutfield[possession.index]!
          : null;
      if (
        !isChaserNow &&
        carrier &&
        homeXI[i]!.role.slot.position !== "FWD" // forwards keep pushing up instead of tracking back
      ) {
        const ai = jockeyDefender(p, carrier, HOME_DEFEND_SIDE * PITCH.halfLength, store.homeOutfield);
        const params = scaleParams(homeParams[i] ?? homeParams[0]!);
        return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
      }

      const ai = stepOutfield(p, homeXI[i]!.role, store.ball, isChaserNow);
      const params = scaleParams(homeParams[i] ?? homeParams[0]!);
      return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
    });

    // --- away outfield (AI, except a connected guest's/local P2's player) ---
    const awayChaser = nearestChaserIndex(store.awayOutfield, store.ball, chaserRef.current.away);
    chaserRef.current.away = awayChaser;
    const awayGoalX = -AWAY_DEFEND_SIDE * PITCH.halfLength; // opponent's goal — away attacks here
    const awayOutfield = store.awayOutfield.map((p, i) => {
      if (hasAwayHuman && i === awayControlledIndex && awayControlled) return awayControlled;

      const shotState = awayShotState[i]!;
      shotState.cooldown = Math.max(0, shotState.cooldown - dt);

      if (shotState.windupUntil > 0) {
        if (state.clock.elapsedTime >= shotState.windupUntil) {
          if (restartLock === null || restartLock === "away") {
            const dir = shotState.windupDir ?? aiShotDirection(p, awayGoalX, diff.shotAccuracy);
            ball = applyImpulse(ball, dir, diff.shotPower, 0.12);
            lastTouch = "away";
            restartLock = null;
            possession = null;
            recentRelease.current = { team: "away", index: i, until: state.clock.elapsedTime + STRIKE_TUNING.cooldown };
            bumpAnim(awayRefs.current[i] ?? null, "kickCount");
            playKick(0.6);
          }
          shotState.cooldown = diff.decisionCooldown;
          shotState.windupUntil = 0;
          shotState.windupDir = null;
        }
        return clampToPitch(
          stepMovement(p, { x: 0, z: 0, sprint: false }, awayParams[i] ?? awayParams[0]!, dt),
          PITCH.halfLength,
          PITCH.halfWidth,
        );
      }

      const iAmPossessor = possession !== null && possession.team === "away" && possession.index === i;
      if (iAmPossessor && (restartLock === null || restartLock === "away")) {
        const distToGoal = Math.hypot(awayGoalX - p.position.x, p.position.z);
        if (shotState.cooldown <= 0 && distToGoal < diff.shootRange) {
          shotState.windupUntil = state.clock.elapsedTime + diff.shotWindup;
          shotState.windupDir = aiShotDirection(p, awayGoalX, diff.shotAccuracy);
          return clampToPitch(
            stepMovement(p, { x: 0, z: 0, sprint: false }, awayParams[i] ?? awayParams[0]!, dt),
            PITCH.halfLength,
            PITCH.halfWidth,
          );
        }
        const ai = dribbleTowardGoal(p, awayGoalX, store.homeOutfield, store.awayOutfield);
        const params = scaleParams(awayParams[i] ?? awayParams[0]!);
        return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
      }

      const isChaserNow = i === awayChaser;
      const carrier: Kinematics | null =
        possession && possession.team === "home"
          ? possession.index === controlledIndex
            ? controlled
            : store.homeOutfield[possession.index]!
          : null;
      if (
        !isChaserNow &&
        carrier &&
        awayXI[i]!.role.slot.position !== "FWD"
      ) {
        const ai = jockeyDefender(p, carrier, AWAY_DEFEND_SIDE * PITCH.halfLength, store.awayOutfield);
        const params = scaleParams(awayParams[i] ?? awayParams[0]!);
        return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
      }

      const ai = stepOutfield(p, awayXI[i]!.role, store.ball, isChaserNow);
      const params = scaleParams(awayParams[i] ?? awayParams[0]!);
      return clampToPitch(stepMovement(p, ai, params, dt), PITCH.halfLength, PITCH.halfWidth);
    });

    /** Looks up a player's post-movement body by team + index — everyone's already been moved above. */
    const bodyOf = (team: TeamSide, index: number): Kinematics => {
      if (team === "home") return index === controlledIndex ? controlled : homeOutfield[index]!;
      return hasAwayHuman && index === awayControlledIndex && awayControlled
        ? awayControlled
        : awayOutfield[index]!;
    };

    // --- tackle resolution: strips possession from whoever has it, if anyone ---
    // Checked against the *carrier's actual body*, not the ball's offset
    // dribble point — with the possession-lock system the ball can sit
    // noticeably ahead of a carrier who's facing away from the tackler, so
    // targeting the exact ball point made tackles whiff far more than they
    // should. Tackling the player, not a phantom spot near them, is both
    // more intuitive and more reliable.
    const tackleTargetPos = possession ? bodyOf(possession.team, possession.index).position : ball.position;
    const ballForTackle: BallState = { ...ball, position: { ...ball.position, ...tackleTargetPos } };

    if (tackleState.current.active > 0 && (restartLock === null || restartLock === "home")) {
      const knocked = attemptTackleImpulse(ballForTackle, controlled.position);
      if (knocked) {
        ball = knocked;
        lastTouch = "home";
        restartLock = null;
        possession = null;
        recentRelease.current = {
          team: "home",
          index: controlledIndex,
          until: state.clock.elapsedTime + STRIKE_TUNING.cooldown,
        };
        tackleState.current.active = 0;
        playKick(0.55);
      }
    }
    if (
      awayControlled &&
      awayTackleState.current.active > 0 &&
      (restartLock === null || restartLock === "away")
    ) {
      const knocked = attemptTackleImpulse(ballForTackle, awayControlled.position);
      if (knocked) {
        ball = knocked;
        lastTouch = "away";
        restartLock = null;
        possession = null;
        recentRelease.current = {
          team: "away",
          index: awayControlledIndex ?? 0,
          until: state.clock.elapsedTime + STRIKE_TUNING.cooldown,
        };
        awayTackleState.current.active = 0;
        playKick(0.55);
      }
    }

    // --- goalkeeper movement (positioning/diving reacts to the ball as of any strike/tackle already resolved this frame) ---
    const homeDecision = stepGoalkeeper(store.homeGK, store.homeGKState, ball, HOME_DEFEND_SIDE, dt);
    const homeGK = driveGoalkeeper(store.homeGK, homeDecision, homeGKParams, HOME_DEFEND_SIDE, dt);
    const homeGKState = homeDecision.state;

    const awayDecision = stepGoalkeeper(store.awayGK, store.awayGKState, ball, AWAY_DEFEND_SIDE, dt);
    const awayGK = driveGoalkeeper(store.awayGK, awayDecision, awayGKParams, AWAY_DEFEND_SIDE, dt);
    const awayGKState = awayDecision.state;

    // --- ball resolution: glue it to whoever has it, or run real physics for a loose ball ---
    if (possession) {
      const possessor = bodyOf(possession.team, possession.index);
      const speedFrac = Math.hypot(possessor.velocity.x, possessor.velocity.z) / POSSESSION_SPEED_REF;
      const pos = possessionBallPosition(possessor, speedFrac);
      ball = {
        position: { x: pos.x, y: BALL_RADIUS, z: pos.z },
        velocity: possessor.velocity,
        heading: possessor.heading,
        spin: ball.spin,
      };
      lastTouch = possession.team;
    } else {
      ball = stepBall(ball, dt, { halfLength: PITCH.halfLength, halfWidth: PITCH.halfWidth });

      // --- goalkeeper saves work on a loose ball only, against their fresh (post-movement) positions ---
      const homeSaveCheck = tryKeeperSave(ball, homeGK, homeGKState, HOME_DEFEND_SIDE);
      if (homeSaveCheck) {
        ball = homeSaveCheck;
        lastTouch = "away";
      }
      const awaySaveCheck = tryKeeperSave(ball, awayGK, awayGKState, AWAY_DEFEND_SIDE);
      if (awaySaveCheck) {
        ball = awaySaveCheck;
        lastTouch = "home";
      }

      // --- capture: whoever's nearest and eligible picks it up clean ---
      // Excludes whoever just released the ball (see recentRelease above) so
      // a shot or pass can't be instantly re-swallowed by its own kicker.
      const excluded =
        recentRelease.current && state.clock.elapsedTime < recentRelease.current.until
          ? recentRelease.current
          : null;
      const candidates: { team: TeamSide; index: number; body: Kinematics }[] = [];
      if (restartLock === null || restartLock === "home") {
        for (let i = 0; i < homeOutfield.length; i++) {
          if (excluded && excluded.team === "home" && excluded.index === i) continue;
          candidates.push({ team: "home", index: i, body: bodyOf("home", i) });
        }
      }
      if (restartLock === null || restartLock === "away") {
        for (let i = 0; i < awayOutfield.length; i++) {
          if (excluded && excluded.team === "away" && excluded.index === i) continue;
          candidates.push({ team: "away", index: i, body: bodyOf("away", i) });
        }
      }
      const captured = tryCapture(ball, candidates);
      if (captured) {
        possession = captured;
        lastTouch = captured.team;
        restartLock = null;
        const body = bodyOf(captured.team, captured.index);
        const pos = possessionBallPosition(body, 0);
        ball = {
          position: { x: pos.x, y: BALL_RADIUS, z: pos.z },
          velocity: { x: 0, y: 0, z: 0 },
          heading: body.heading,
          spin: ball.spin,
        };
      }
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
        awayCharge,
        awayStrikeCooldown: awayCooldown,
        matchTime,
        lastTouch,
        restartLock: null,
        possession: null,
      });
      useGameStore.getState().recordGoal(goal.scorer);
      playWhistle();
      if (goal.scorer === "home") playCrowdRoar();
      else playCrowdGroan();
      maybeBroadcastState();
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
        awayCharge,
        awayStrikeCooldown: awayCooldown,
        matchTime,
        lastTouch,
        restart: outOfBounds,
        restartLock: null,
        possession: null,
        matchStatus: "restart",
        statusTimer: MATCH_TUNING.restartPause,
      });
      playWhistle();
      maybeBroadcastState();
      return;
    }

    if (matchTime >= MATCH_TUNING.periodSeconds) {
      playWhistle();
      useGameStore.setState({
        matchTime: MATCH_TUNING.periodSeconds,
        matchStatus: store.period >= MATCH_TUNING.periods ? "fulltime" : "halftime",
        statusTimer: MATCH_TUNING.halfTimePause,
      });
      maybeBroadcastState();
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
      awayCharge,
      awayStrikeCooldown: awayCooldown,
      lastTouch,
      restartLock,
      possession,
    });

    syncMeshes({ homeOutfield, homeGK, homeGKState, awayOutfield, awayGK, awayGKState, ball }, dt);

    // --- camera ---
    applyCamera(cameraMode, ball.position, ball.velocity, controlled.position, controlled.heading, dt);
    placeIndicator(controlled.position, state.clock.elapsedTime);
    maybeBroadcastState();
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

      {/* Marker over whichever player this screen currently controls. */}
      <group ref={indicatorRef}>
        <mesh rotation-x={Math.PI}>
          <coneGeometry args={[0.22, 0.4, 4]} />
          <meshStandardMaterial color="#fff45c" emissive="#fff45c" emissiveIntensity={0.7} />
        </mesh>
      </group>
      {/* Ground ring under the same player — visible even when the camera looks straight down. */}
      <mesh ref={indicatorRingRef} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.62, 0.78, 28]} />
        <meshBasicMaterial color="#fff45c" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
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
