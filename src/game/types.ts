export type Vec3 = { x: number; y: number; z: number };

export type Attributes = {
  pace: number; // 1-99, drives top speed & accel
  shot: number;
  pass: number;
  dribble: number; // turn rate / close control
  defend: number;
  gk: number;
};

export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export type Player = {
  id: string;
  name: string;
  position: PlayerPosition;
  attributes: Attributes;
};

export type Formation = "4-4-2" | "4-3-3" | "3-5-2";

export type Club = {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  players: Player[];
  formation: Formation;
};

/** Normalized directional input on the ground plane, plus modifiers. */
export type MovementInput = {
  x: number; // -1..1, right positive
  z: number; // -1..1, forward negative (screen "up")
  sprint: boolean;
};

/** Everything that changes frame-to-frame for a moving body on the pitch. */
export type Kinematics = {
  position: Vec3;
  velocity: Vec3;
  /** Facing angle in radians around the Y axis. */
  heading: number;
};

export type BallState = Kinematics & {
  /** Spin/roll angle used purely for visual rolling. */
  spin: number;
};

/** Which kind of strike is being charged. */
export type StrikeAction = "shoot" | "pass";

/** Action keys, read alongside MovementInput from the same input ref. */
export type ActionInput = {
  shoot: boolean;
  pass: boolean;
  /** Loft modifier — turns a driven strike into a lofted one. */
  loft: boolean;
  /** Camera toggle key, held state — the consumer edge-detects the press. */
  cameraToggle: boolean;
  /** Switch-player key, held state — the consumer edge-detects the press. */
  switchPlayer: boolean;
  /** Tackle key, held state — the consumer edge-detects the press (it's a one-shot dash, not a hold). */
  tackle: boolean;
};

/** Everything the input hook produces in one frame. */
export type PlayerInput = MovementInput & ActionInput;

/** Charge-up state for the current strike, advanced every frame. */
export type ChargeState = {
  /** null when nothing is being charged. */
  action: StrikeAction | null;
  /** 0..1 normalized power. */
  power: number;
  /** seconds the key has been held. */
  elapsed: number;
  /** whether the loft modifier was held during the charge. */
  loft: boolean;
};
