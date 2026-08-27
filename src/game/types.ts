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
