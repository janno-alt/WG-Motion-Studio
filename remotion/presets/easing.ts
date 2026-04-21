import BezierEasing from "bezier-easing";

import type { EasingType } from "@/types";
import { clamp01 } from "@/lib/time";

export type EasingFn = (t: number) => number;

const LINEAR: EasingFn = (t) => t;
const EASE_IN: EasingFn = (t) => t * t;
const EASE_OUT: EasingFn = (t) => 1 - (1 - t) * (1 - t);
const EASE_IN_OUT: EasingFn = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// Back — overshoots slightly past the endpoint. ~10% overshoot.
const BACK: EasingFn = (() => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
})();

// Bounce — settles like a ball. Standard Penner formula.
const BOUNCE: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t - 1.5 / d1) ** 2 + 0.75;
  if (t < 2.5 / d1) return n1 * (t - 2.25 / d1) ** 2 + 0.9375;
  return n1 * (t - 2.625 / d1) ** 2 + 0.984375;
};

/**
 * Critically-damped-ish spring. Not a physical simulation — a closed-form
 * curve that settles to 1 over the normalized range. Tuned so that by t=1
 * the value is very close to 1 regardless of (stiffness, damping).
 */
function springEasing(stiffness = 100, damping = 10): EasingFn {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * Math.sqrt(stiffness));
  return (t) => {
    // Duration-normalized t ∈ [0, 1]. We expand to a settled range of 1.
    const scaled = t * 6; // ~six time constants — settles very close to 1.
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return (
        1 -
        Math.exp(-zeta * w0 * scaled) *
          (Math.cos(wd * scaled) + ((zeta * w0) / wd) * Math.sin(wd * scaled))
      );
    }
    // Over/critical — exponential approach.
    return 1 - (1 + w0 * scaled) * Math.exp(-w0 * scaled);
  };
}

const SPRING_DEFAULT = springEasing(100, 10);

const bezierCache = new Map<string, EasingFn>();
function cubicBezier(p: [number, number, number, number]): EasingFn {
  const k = p.join(",");
  const cached = bezierCache.get(k);
  if (cached) return cached;
  const fn = BezierEasing(p[0], p[1], p[2], p[3]);
  bezierCache.set(k, fn);
  return fn;
}

export function easingFor(easing: EasingType | undefined): EasingFn {
  if (!easing) return LINEAR;
  if (typeof easing === "object") {
    return cubicBezier(easing.points);
  }
  switch (easing) {
    case "linear":
      return LINEAR;
    case "easeIn":
      return EASE_IN;
    case "easeOut":
      return EASE_OUT;
    case "easeInOut":
      return EASE_IN_OUT;
    case "back":
      return BACK;
    case "bounce":
      return BOUNCE;
    case "spring":
      return SPRING_DEFAULT;
  }
}

/**
 * Normalized, eased progress for the given frame within a window.
 * Returns 0 before `startFrame`, eased(1) at or after end. Guarded against
 * zero-length windows.
 */
export function windowProgress(
  currentFrame: number,
  startFrame: number,
  durationFrames: number,
  easing?: EasingType,
): number {
  if (durationFrames <= 0) return 1;
  const linear = clamp01((currentFrame - startFrame) / durationFrames);
  return easingFor(easing)(linear);
}
