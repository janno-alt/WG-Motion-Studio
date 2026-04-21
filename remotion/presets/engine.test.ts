import { describe, expect, test } from "vitest";

import type {
  AnimationTracks,
  BaseState,
  Preset,
  PresetInstance,
} from "@/types";

import { composeTracks } from "./engine";
import { easingFor, windowProgress } from "./easing";

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const FPS = 30;

const BASE: BaseState = {
  position: { x: 100, y: 200 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  opacity: 1,
  anchorPoint: { x: 0.5, y: 0.5 },
};

function makeTracks(partial: Partial<AnimationTracks> = {}): AnimationTracks {
  return {
    enter: { motion: null, mask: null, ...(partial.enter ?? {}) },
    idle: { motion: [], mask: null, ...(partial.idle ?? {}) },
    exit: { motion: null, mask: null, ...(partial.exit ?? {}) },
  };
}

function instance(presetId: string, duration = 0.5, intensity = 100): PresetInstance {
  return { presetId, duration, intensity };
}

const FADE_IN: Preset = {
  id: "fade-in",
  name: "Fade in",
  category: "enter",
  tags: [],
  builtIn: true,
  animatedProperties: [
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.5, intensity: 100, easing: "linear" },
};

const FADE_OUT: Preset = {
  id: "fade-out",
  name: "Fade out",
  category: "exit",
  tags: [],
  builtIn: true,
  animatedProperties: [
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.5, intensity: 100, easing: "linear" },
};

const FLOAT: Preset = {
  id: "idle-float",
  name: "Float",
  category: "idle",
  tags: [],
  builtIn: true,
  loopKind: "sine",
  animatedProperties: [{ property: "positionY", startValue: 0, endValue: 8 }],
  defaults: { duration: 3, intensity: 100, easing: "easeInOut" },
};

const PULSE: Preset = {
  id: "idle-pulse",
  name: "Pulse",
  category: "idle",
  tags: [],
  builtIn: true,
  loopKind: "sine",
  animatedProperties: [{ property: "scale", startValue: 0, endValue: 0.08 }],
  defaults: { duration: 1.5, intensity: 100, easing: "easeInOut" },
};

const PRESETS = {
  "fade-in": FADE_IN,
  "fade-out": FADE_OUT,
  "idle-float": FLOAT,
  "idle-pulse": PULSE,
};

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("easing", () => {
  test("linear is identity", () => {
    const fn = easingFor("linear");
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.5);
    expect(fn(1)).toBe(1);
  });

  test("easeIn and easeOut are non-linear", () => {
    expect(easingFor("easeIn")(0.5)).toBeLessThan(0.5);
    expect(easingFor("easeOut")(0.5)).toBeGreaterThan(0.5);
  });

  test("back overshoots beyond 1 mid-curve then settles", () => {
    const fn = easingFor("back");
    const peak = Math.max(fn(0.85), fn(0.9), fn(0.95));
    expect(peak).toBeGreaterThan(1);
    expect(fn(1)).toBeCloseTo(1, 5);
  });
});

describe("windowProgress", () => {
  test("clamps to [0, 1]", () => {
    expect(windowProgress(-5, 0, 30)).toBe(0);
    expect(windowProgress(30, 0, 30)).toBe(1);
    expect(windowProgress(60, 0, 30)).toBe(1);
    expect(windowProgress(0, 0, 30)).toBe(0);
  });

  test("linear in the middle", () => {
    expect(windowProgress(15, 0, 30)).toBeCloseTo(0.5, 5);
  });

  test("zero-duration windows are treated as done", () => {
    expect(windowProgress(5, 0, 0)).toBe(1);
  });
});

describe("composeTracks — baseline", () => {
  test("frame outside item window returns base state identity", () => {
    const state = composeTracks(
      BASE,
      makeTracks(),
      PRESETS,
      -1,
      0,
      60,
      FPS,
    );
    expect(state.position).toEqual(BASE.position);
    expect(state.opacity).toBe(BASE.opacity);
  });

  test("no presets → base state unchanged at any frame", () => {
    const state = composeTracks(BASE, makeTracks(), PRESETS, 30, 0, 90, FPS);
    expect(state).toMatchObject({
      position: BASE.position,
      rotation: 0,
      scale: { x: 1, y: 1 },
      opacity: 1,
    });
  });
});

describe("composeTracks — enter", () => {
  test("fade-in opacity ramps 0 → 1 linearly over enter duration", () => {
    const tracks = makeTracks({
      enter: { motion: instance("fade-in", 0.5), mask: null },
    });
    const atStart = composeTracks(BASE, tracks, PRESETS, 0, 0, 60, FPS);
    const atMiddle = composeTracks(BASE, tracks, PRESETS, 7, 0, 60, FPS);
    const atEnd = composeTracks(BASE, tracks, PRESETS, 15, 0, 60, FPS);
    expect(atStart.opacity).toBeCloseTo(0, 3);
    expect(atMiddle.opacity).toBeGreaterThan(0.3);
    expect(atMiddle.opacity).toBeLessThan(0.7);
    expect(atEnd.opacity).toBeCloseTo(1, 3);
  });
});

describe("composeTracks — enter + idle exclusivity", () => {
  test("during enter window, idle contribution is suppressed", () => {
    const tracks = makeTracks({
      enter: { motion: instance("fade-in", 0.5), mask: null },
      idle: { motion: [instance("idle-float", 3)], mask: null },
    });
    // Mid-enter frame — floats y-delta should be zero (idle not running yet).
    const mid = composeTracks(BASE, tracks, PRESETS, 7, 0, 60, FPS);
    expect(mid.position.y).toBeCloseTo(BASE.position.y, 3);
  });

  test("after enter window, idle runs and moves position", () => {
    const tracks = makeTracks({
      enter: { motion: instance("fade-in", 0.5), mask: null },
      idle: { motion: [instance("idle-float", 3)], mask: null },
    });
    // Well past enter window — idle should have accumulated phase and moved Y.
    const sample = composeTracks(BASE, tracks, PRESETS, 30, 0, 120, FPS);
    // Idle-float amplitude = 8 px. Position should drift off base at some point
    // during the first second. Sample a few frames to be tolerant of exact phase.
    const samples = [20, 30, 40, 50].map(
      (f) => composeTracks(BASE, tracks, PRESETS, f, 0, 120, FPS).position.y,
    );
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    expect(max - min).toBeGreaterThan(2);
    void sample;
  });
});

describe("composeTracks — idle stacking", () => {
  test("stacked idle presets overlay correctly (sum of position, product of scale)", () => {
    const tracksFloat = makeTracks({
      idle: { motion: [instance("idle-float", 3)], mask: null },
    });
    const tracksPulse = makeTracks({
      idle: { motion: [instance("idle-pulse", 1.5)], mask: null },
    });
    const tracksBoth = makeTracks({
      idle: {
        motion: [instance("idle-float", 3), instance("idle-pulse", 1.5)],
        mask: null,
      },
    });
    const frame = 10;
    const a = composeTracks(BASE, tracksFloat, PRESETS, frame, 0, 120, FPS);
    const b = composeTracks(BASE, tracksPulse, PRESETS, frame, 0, 120, FPS);
    const both = composeTracks(BASE, tracksBoth, PRESETS, frame, 0, 120, FPS);

    // Float moves Y only; Pulse scales only. Combined should see both effects.
    expect(both.position.y).toBeCloseTo(a.position.y, 3);
    expect(both.scale.x).toBeCloseTo(b.scale.x, 3);
  });
});

describe("composeTracks — exit", () => {
  test("fade-out opacity ramps 1 → 0 over exit duration", () => {
    const tracks = makeTracks({
      exit: { motion: instance("fade-out", 0.5), mask: null },
    });
    const dur = 60; // 2 s
    const exitStart = dur - 15; // fps * 0.5
    const atExitStart = composeTracks(BASE, tracks, PRESETS, exitStart, 0, dur, FPS);
    const atMid = composeTracks(BASE, tracks, PRESETS, exitStart + 7, 0, dur, FPS);
    const atEnd = composeTracks(BASE, tracks, PRESETS, dur, 0, dur, FPS);
    expect(atExitStart.opacity).toBeCloseTo(1, 3);
    expect(atMid.opacity).toBeLessThan(0.7);
    expect(atEnd.opacity).toBeCloseTo(0, 3);
  });
});
