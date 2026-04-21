import type { AnimatedProperty, Direction8, EasingType } from "./animation";

export type PresetCategory = "enter" | "idle" | "exit" | "mask";

export type MaskShape = "rectangle" | "circle" | "ellipse";

export interface PresetDefaults {
  duration: number;
  intensity: number;
  direction?: Direction8;
  easing: EasingType;
  softEdge?: number;
}

export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  tags: string[];
  builtIn: boolean;
  animatedProperties: AnimatedProperty[];
  defaults: PresetDefaults;
  maskShape?: MaskShape;
}
