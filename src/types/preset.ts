import type { AnimatedProperty, Direction8, EasingType } from "./animation";

export type PresetCategory = "enter" | "idle" | "exit" | "mask";

export type MaskShape = "rectangle" | "circle" | "ellipse";

/**
 * How an idle preset cycles over time. One-shot (enter/exit) presets ignore this.
 *
 * - `sine`: value = start + amplitude * sin(2π t / period). Smooth oscillation.
 * - `linear`: value accumulates at `amplitude` per `period` seconds. Used for
 *   continuous rotations.
 * - `easeInOut`: triangle wave eased at the peaks — goes start → end → start
 *   each period. Used for bounces.
 */
export type LoopKind = "sine" | "linear" | "easeInOut";

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
  /** Required for idle presets, undefined for enter/exit/mask one-shots. */
  loopKind?: LoopKind;
  maskShape?: MaskShape;
}
