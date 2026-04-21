/**
 * Preset engine — pure functions, no React hooks.
 *
 * Produces the final render-state for one plan item at one frame by
 * composing enter / idle / exit presets over the item's base state.
 *
 * Composition rules (from the main briefing):
 *   - position: additive
 *   - rotation: additive
 *   - scale:    multiplicative (component-wise)
 *   - opacity:  multiplicative
 *   - color:    override (last writer wins)
 *   - mask:     clip-path string on a separate wrapper
 */

import type {
  AnimatedProperty,
  AnimationTracks,
  BaseState,
  PlanItem,
  Preset,
  PresetInstance,
} from "@/types";
import { clamp01 } from "@/lib/time";

import { easingFor, type EasingFn } from "./easing";
import { interpolateColor } from "./color";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface ComposedState {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
  opacity: number;
  color?: string;
  clipPath?: string;
}

type PresetMap = Record<string, Preset>;

/** Additive deltas + multiplicative factors + optional color override. */
interface Delta {
  dx: number;
  dy: number;
  dr: number; // rotation delta
  sx: number; // scale factor
  sy: number;
  op: number; // opacity factor
  color?: string;
}

const IDENTITY: Delta = { dx: 0, dy: 0, dr: 0, sx: 1, sy: 1, op: 1 };

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Compose all active tracks for `currentFrame` relative to an item that
 * starts at `itemStartFrame` and lasts `itemDurationFrames`.
 */
export function composeTracks(
  baseState: BaseState,
  tracks: AnimationTracks,
  presets: PresetMap,
  currentFrame: number,
  itemStartFrame: number,
  itemDurationFrames: number,
  fps: number,
): ComposedState {
  const relativeFrame = currentFrame - itemStartFrame;
  if (relativeFrame < 0 || relativeFrame > itemDurationFrames) {
    return toComposed(baseState, IDENTITY);
  }

  const enterInstance = tracks.enter.motion;
  const exitInstance = tracks.exit.motion;
  const idleInstances = tracks.idle.motion ?? [];

  const enterFrames = enterInstance
    ? Math.max(1, Math.round(enterInstance.duration * fps))
    : 0;
  const exitFrames = exitInstance
    ? Math.max(1, Math.round(exitInstance.duration * fps))
    : 0;

  const inEnter = enterInstance !== null && relativeFrame < enterFrames;
  const inExit =
    exitInstance !== null && relativeFrame >= itemDurationFrames - exitFrames;

  let delta = { ...IDENTITY };

  // Enter and idle are mutually exclusive (enter wins its window).
  // Exit overlays at the end. Idle runs between enter-end and exit-start.
  if (inEnter && enterInstance) {
    const preset = presets[enterInstance.presetId];
    if (preset) delta = combine(delta, oneShot(preset, enterInstance, relativeFrame, enterFrames, baseState));
  } else if (!inExit) {
    const idleStart = enterFrames;
    const idleRel = relativeFrame - idleStart;
    for (const instance of idleInstances) {
      const preset = presets[instance.presetId];
      if (!preset) continue;
      delta = combine(delta, idleContribution(preset, instance, idleRel, fps, baseState));
    }
  }

  if (inExit && exitInstance) {
    const preset = presets[exitInstance.presetId];
    if (preset) {
      const exitRel = relativeFrame - (itemDurationFrames - exitFrames);
      delta = combine(delta, oneShot(preset, exitInstance, exitRel, exitFrames, baseState));
    }
  }

  const composed = toComposed(baseState, delta);

  // Mask channel on a wrapper — only enter/exit, not idle (phase 3 scope).
  const maskEnter = tracks.enter.mask;
  const maskExit = tracks.exit.mask;
  let clip: string | undefined;
  if (maskEnter && inEnter) {
    const p = presets[maskEnter.presetId];
    if (p) clip = maskClipPath(p, maskEnter, relativeFrame / Math.max(1, enterFrames), "enter");
  } else if (maskExit && inExit) {
    const p = presets[maskExit.presetId];
    if (p) {
      const t = (relativeFrame - (itemDurationFrames - exitFrames)) / Math.max(1, exitFrames);
      clip = maskClipPath(p, maskExit, t, "exit");
    }
  }
  if (clip) composed.clipPath = clip;
  return composed;
}

/* -------------------------------------------------------------------------- */
/*  Contribution builders                                                      */
/* -------------------------------------------------------------------------- */

function oneShot(
  preset: Preset,
  instance: PresetInstance,
  relativeFrame: number,
  windowFrames: number,
  baseState: BaseState,
): Delta {
  const easing = easingFor(instance.easing ?? preset.defaults.easing);
  const tLinear = clamp01(relativeFrame / Math.max(1, windowFrames));
  const t = easing(tLinear);
  // Enter presets converge to baseState at t=1 → we want the "delta at t=1" to be
  // identity. So when `endValue === 'baseState'`, interpolate from startValue → 0 (additive)
  // or → 1 (multiplicative). For an exit, the preset's semantic is inverted
  // (start at baseState, end at a far-away value), so we flip the progression.
  const forward = preset.category !== "exit";
  return applyProperties(preset.animatedProperties, forward ? t : 1 - t, instance, baseState);
}

function idleContribution(
  preset: Preset,
  instance: PresetInstance,
  relativeFrame: number,
  fps: number,
  baseState: BaseState,
): Delta {
  if (relativeFrame < 0) return IDENTITY;
  const period = Math.max(0.01, preset.defaults.duration);
  const periodFrames = period * fps;
  const rawT = relativeFrame / periodFrames;
  const kind = preset.loopKind ?? "sine";

  let progress: number;
  switch (kind) {
    case "sine": {
      // One full sine cycle per `period`. Return value in [-1, 1], interpreted as
      // `startValue + amplitude * sine`.
      return applySineProperties(preset.animatedProperties, rawT, instance, baseState);
    }
    case "linear": {
      // Continuously accumulating — e.g. slow rotation.
      progress = rawT;
      break;
    }
    case "easeInOut": {
      // Triangle wave 0 → 1 → 0 per period, eased.
      const frac = rawT - Math.floor(rawT);
      const tri = frac < 0.5 ? frac * 2 : (1 - frac) * 2;
      progress = easingFor("easeInOut")(tri);
      break;
    }
  }
  return applyProperties(preset.animatedProperties, progress, instance, baseState);
}

function applyProperties(
  props: AnimatedProperty[],
  t: number,
  instance: PresetInstance,
  baseState: BaseState,
): Delta {
  const intensityScale = (instance.intensity ?? 100) / 100;
  const d: Delta = { ...IDENTITY };
  for (const p of props) {
    const start = numericValue(p.property, p.startValue, /*neutral*/ false);
    const end =
      p.endValue === "baseState"
        ? neutralForProperty(p.property)
        : numericValue(p.property, p.endValue, false);
    const value = start + (end - start) * t;

    switch (p.property) {
      case "positionX":
        d.dx += directional(value, instance.direction, "x") * intensityScale;
        break;
      case "positionY":
        d.dy += directional(value, instance.direction, "y") * intensityScale;
        break;
      case "rotation":
        d.dr += value * intensityScale;
        break;
      case "scale":
        d.sx *= scaleApply(value, intensityScale);
        d.sy *= scaleApply(value, intensityScale);
        break;
      case "scaleX":
        d.sx *= scaleApply(value, intensityScale);
        break;
      case "scaleY":
        d.sy *= scaleApply(value, intensityScale);
        break;
      case "opacity":
        d.op *= clamp01(value);
        break;
      case "color": {
        if (typeof p.startValue === "string" && typeof p.endValue === "string") {
          d.color = interpolateColor(
            p.startValue,
            p.endValue === "baseState" ? baseState.color ?? p.startValue : p.endValue,
            t,
          );
        }
        break;
      }
    }
  }
  return d;
}

function applySineProperties(
  props: AnimatedProperty[],
  cycleT: number,
  instance: PresetInstance,
  baseState: BaseState,
): Delta {
  const intensityScale = (instance.intensity ?? 100) / 100;
  const osc = Math.sin(cycleT * 2 * Math.PI);
  const d: Delta = { ...IDENTITY };
  for (const p of props) {
    const amplitude = numericValue(p.property, p.endValue === "baseState" ? 0 : p.endValue, false);
    const center = numericValue(p.property, p.startValue, false);
    const value = center + amplitude * osc;

    switch (p.property) {
      case "positionX":
        d.dx += directional(value, instance.direction, "x") * intensityScale;
        break;
      case "positionY":
        d.dy += directional(value, instance.direction, "y") * intensityScale;
        break;
      case "rotation":
        d.dr += value * intensityScale;
        break;
      case "scale":
      case "scaleX":
      case "scaleY": {
        // Sine-scale: multiplier = 1 + amplitude * sin(t) * intensity
        const mult = 1 + amplitude * osc * intensityScale;
        if (p.property !== "scaleY") d.sx *= mult;
        if (p.property !== "scaleX") d.sy *= mult;
        break;
      }
      case "opacity":
        d.op *= clamp01(1 + amplitude * osc * intensityScale);
        break;
      case "color": {
        if (typeof p.startValue === "string" && typeof p.endValue === "string") {
          d.color = interpolateColor(p.startValue, p.endValue, (osc + 1) / 2);
          void baseState; // color sine ignores base
        }
        break;
      }
    }
  }
  return d;
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function neutralForProperty(property: AnimatedProperty["property"]): number {
  switch (property) {
    case "positionX":
    case "positionY":
    case "rotation":
      return 0;
    case "scale":
    case "scaleX":
    case "scaleY":
    case "opacity":
      return 1;
    default:
      return 0;
  }
}

function numericValue(
  _property: AnimatedProperty["property"],
  value: string | number,
  neutral: boolean,
): number {
  if (typeof value === "number") return value;
  if (value === "baseState") return neutral ? 0 : 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Turns scale ratios of 0 into full hide; otherwise clamp to reasonable range. */
function scaleApply(multiplier: number, intensity: number): number {
  // Blend intensity: scale = 1 + intensity*(multiplier-1).
  const blended = 1 + intensity * (multiplier - 1);
  return Math.max(0, blended);
}

/** Rotate a 1-axis offset by an 8-way direction onto the requested axis. */
function directional(
  magnitude: number,
  direction: PresetInstance["direction"],
  axis: "x" | "y",
): number {
  if (!direction) return magnitude;
  // Convert 8-direction to unit vector and project onto axis.
  const map: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    upRight: { x: 0.707, y: -0.707 },
    right: { x: 1, y: 0 },
    downRight: { x: 0.707, y: 0.707 },
    down: { x: 0, y: 1 },
    downLeft: { x: -0.707, y: 0.707 },
    left: { x: -1, y: 0 },
    upLeft: { x: -0.707, y: -0.707 },
  };
  const v = map[direction] ?? { x: 1, y: 0 };
  return magnitude * (axis === "x" ? v.x : v.y);
}

function combine(a: Delta, b: Delta): Delta {
  return {
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    dr: a.dr + b.dr,
    sx: a.sx * b.sx,
    sy: a.sy * b.sy,
    op: a.op * b.op,
    color: b.color ?? a.color,
  };
}

function toComposed(base: BaseState, d: Delta): ComposedState {
  return {
    position: { x: base.position.x + d.dx, y: base.position.y + d.dy },
    rotation: base.rotation + d.dr,
    scale: { x: base.scale.x * d.sx, y: base.scale.y * d.sy },
    opacity: clamp01(base.opacity * d.op),
    color: d.color ?? base.color,
  };
}

/* -------------------------------------------------------------------------- */
/*  Mask CSS generators                                                        */
/* -------------------------------------------------------------------------- */

function maskClipPath(
  preset: Preset,
  instance: PresetInstance,
  tLinear: number,
  phase: "enter" | "exit",
): string {
  const eased: EasingFn = easingFor(instance.easing ?? preset.defaults.easing);
  const t = eased(clamp01(tLinear));
  // Reveal progresses from 0 → 1 on enter, and 1 → 0 on exit.
  const reveal = phase === "enter" ? t : 1 - t;
  switch (preset.id) {
    case "wipe-right":
      return `inset(0 ${(1 - reveal) * 100}% 0 0)`;
    case "wipe-left":
      return `inset(0 0 0 ${(1 - reveal) * 100}%)`;
    case "wipe-up":
      return `inset(${(1 - reveal) * 100}% 0 0 0)`;
    case "wipe-down":
      return `inset(0 0 ${(1 - reveal) * 100}% 0)`;
    case "iris-out":
      return `circle(${reveal * 70}% at 50% 50%)`;
    case "iris-in":
      return `circle(${(1 - reveal) * 70}% at 50% 50%)`;
    default:
      return `inset(0)`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Convenience for outside callers                                            */
/* -------------------------------------------------------------------------- */

export function composeForPlanItem(
  item: PlanItem,
  presets: PresetMap,
  currentFrame: number,
  fps: number,
): ComposedState {
  const start = Math.round(item.timestamp * fps);
  const duration = Math.max(1, Math.round(item.duration * fps));
  return composeTracks(
    item.baseState,
    item.animation,
    presets,
    currentFrame,
    start,
    duration,
    fps,
  );
}
