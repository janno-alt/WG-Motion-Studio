export type Direction8 =
  | "up"
  | "upRight"
  | "right"
  | "downRight"
  | "down"
  | "downLeft"
  | "left"
  | "upLeft";

export type BuiltInEasing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "spring"
  | "bounce"
  | "back";

export interface CubicBezierEasing {
  type: "cubicBezier";
  points: [number, number, number, number];
}

export type EasingType = BuiltInEasing | CubicBezierEasing;

export interface BaseState {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
  opacity: number;
  color?: string;
  anchorPoint: { x: number; y: number };
}

export interface PresetInstance {
  presetId: string;
  duration: number;
  intensity: number;
  easing?: EasingType;
  delay?: number;
  direction?: Direction8;
  softEdge?: number;
}

export interface AnimationTracks {
  enter: { motion: PresetInstance | null; mask: PresetInstance | null };
  idle: { motion: PresetInstance[]; mask: null };
  exit: { motion: PresetInstance | null; mask: PresetInstance | null };
}

export type AnimatedPropertyName =
  | "positionX"
  | "positionY"
  | "rotation"
  | "scale"
  | "scaleX"
  | "scaleY"
  | "opacity"
  | "color";

export interface AnimatedProperty {
  property: AnimatedPropertyName;
  startValue: string | number;
  endValue: "baseState" | string | number;
  easing?: EasingType;
}
