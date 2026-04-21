import type { Direction8, Preset } from "@/types";

/**
 * The baseline preset library. Shipped on first launch and refreshed if any
 * `builtIn: true` preset is missing. User-authored presets (`builtIn: false`)
 * are untouched.
 */

const now = () => 0; // seeded presets get a fixed "epoch" timestamp; save overwrites later.

/* -------------------------------------------------------------------------- */
/*  Enter                                                                      */
/* -------------------------------------------------------------------------- */

const POP_IN: Preset = {
  id: "pop-in",
  name: "Pop in",
  category: "enter",
  tags: ["standard", "snappy"],
  builtIn: true,
  animatedProperties: [{ property: "scale", startValue: 0, endValue: "baseState" }],
  defaults: { duration: 0.45, intensity: 100, easing: "back" },
};

const FADE_IN: Preset = {
  id: "fade-in",
  name: "Fade in",
  category: "enter",
  tags: ["subtle", "standard"],
  builtIn: true,
  animatedProperties: [{ property: "opacity", startValue: 0, endValue: "baseState" }],
  defaults: { duration: 0.4, intensity: 100, easing: "easeOut" },
};

function slideIn(direction: Direction8, id: string): Preset {
  return {
    id,
    name: `Slide in ${direction}`,
    category: "enter",
    tags: ["directional", "standard"],
    builtIn: true,
    animatedProperties: [
      { property: "positionX", startValue: -120, endValue: "baseState" },
      { property: "positionY", startValue: -120, endValue: "baseState" },
      { property: "opacity", startValue: 0, endValue: "baseState" },
    ],
    defaults: { duration: 0.45, intensity: 100, direction, easing: "easeOut" },
  };
}

const SLIDE_IN = slideIn("left", "slide-in");

const SCALE_UP: Preset = {
  id: "scale-up",
  name: "Scale up",
  category: "enter",
  tags: ["subtle"],
  builtIn: true,
  animatedProperties: [
    { property: "scale", startValue: 0.3, endValue: "baseState" },
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.4, intensity: 100, easing: "easeOut" },
};

const SPRING_IN: Preset = {
  id: "spring-in",
  name: "Spring in",
  category: "enter",
  tags: ["energetic", "bouncy"],
  builtIn: true,
  animatedProperties: [{ property: "scale", startValue: 0, endValue: "baseState" }],
  defaults: { duration: 0.55, intensity: 100, easing: "spring" },
};

const ROTATE_IN: Preset = {
  id: "rotate-in",
  name: "Rotate in",
  category: "enter",
  tags: ["playful"],
  builtIn: true,
  animatedProperties: [
    { property: "rotation", startValue: -45, endValue: "baseState" },
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.5, intensity: 100, easing: "easeOut" },
};

const FADE_UP: Preset = {
  id: "fade-up",
  name: "Fade up",
  category: "enter",
  tags: ["subtle", "standard"],
  builtIn: true,
  animatedProperties: [
    { property: "positionY", startValue: 40, endValue: "baseState" },
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.4, intensity: 100, easing: "easeOut" },
};

/** Phase-3 placeholder: stagger kicks in properly with TextCallout in phase 5. */
const STAGGER_LETTERS: Preset = {
  id: "stagger-letters",
  name: "Stagger letters",
  category: "enter",
  tags: ["text", "playful"],
  builtIn: true,
  animatedProperties: [
    { property: "positionY", startValue: 20, endValue: "baseState" },
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.5, intensity: 100, easing: "easeOut" },
};

/* -------------------------------------------------------------------------- */
/*  Idle                                                                       */
/* -------------------------------------------------------------------------- */

const FLOAT: Preset = {
  id: "idle-float",
  name: "Float",
  category: "idle",
  tags: ["gentle", "continuous"],
  builtIn: true,
  loopKind: "sine",
  animatedProperties: [{ property: "positionY", startValue: 0, endValue: 8 }],
  defaults: { duration: 3, intensity: 100, easing: "easeInOut" },
};

const PULSE: Preset = {
  id: "idle-pulse",
  name: "Pulse",
  category: "idle",
  tags: ["gentle"],
  builtIn: true,
  loopKind: "sine",
  animatedProperties: [{ property: "scale", startValue: 0, endValue: 0.08 }],
  defaults: { duration: 1.5, intensity: 100, easing: "easeInOut" },
};

const WOBBLE: Preset = {
  id: "idle-wobble",
  name: "Wobble",
  category: "idle",
  tags: ["playful"],
  builtIn: true,
  loopKind: "sine",
  animatedProperties: [{ property: "rotation", startValue: 0, endValue: 3 }],
  defaults: { duration: 2, intensity: 100, easing: "easeInOut" },
};

const SLOW_ROTATE: Preset = {
  id: "idle-rotate",
  name: "Slow rotate",
  category: "idle",
  tags: ["continuous"],
  builtIn: true,
  loopKind: "linear",
  animatedProperties: [{ property: "rotation", startValue: 0, endValue: 5 }],
  defaults: { duration: 1, intensity: 100, easing: "linear" },
};

const BOUNCE_LOOP: Preset = {
  id: "idle-bounce",
  name: "Bounce",
  category: "idle",
  tags: ["playful"],
  builtIn: true,
  loopKind: "easeInOut",
  animatedProperties: [{ property: "positionY", startValue: 0, endValue: -12 }],
  defaults: { duration: 2, intensity: 100, easing: "easeInOut" },
};

/* -------------------------------------------------------------------------- */
/*  Exit                                                                       */
/* -------------------------------------------------------------------------- */

const FADE_OUT: Preset = {
  id: "fade-out",
  name: "Fade out",
  category: "exit",
  tags: ["subtle", "standard"],
  builtIn: true,
  animatedProperties: [{ property: "opacity", startValue: 0, endValue: "baseState" }],
  defaults: { duration: 0.35, intensity: 100, easing: "easeIn" },
};

const POP_OUT: Preset = {
  id: "pop-out",
  name: "Pop out",
  category: "exit",
  tags: ["snappy"],
  builtIn: true,
  animatedProperties: [{ property: "scale", startValue: 0, endValue: "baseState" }],
  defaults: { duration: 0.35, intensity: 100, easing: "back" },
};

const SLIDE_OUT: Preset = {
  id: "slide-out",
  name: "Slide out",
  category: "exit",
  tags: ["directional", "standard"],
  builtIn: true,
  animatedProperties: [
    { property: "positionX", startValue: -120, endValue: "baseState" },
    { property: "positionY", startValue: -120, endValue: "baseState" },
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.35, intensity: 100, direction: "right", easing: "easeIn" },
};

const SCALE_DOWN: Preset = {
  id: "scale-down",
  name: "Scale down",
  category: "exit",
  tags: ["subtle"],
  builtIn: true,
  animatedProperties: [
    { property: "scale", startValue: 0.3, endValue: "baseState" },
    { property: "opacity", startValue: 0, endValue: "baseState" },
  ],
  defaults: { duration: 0.35, intensity: 100, easing: "easeIn" },
};

/* -------------------------------------------------------------------------- */
/*  Mask                                                                       */
/* -------------------------------------------------------------------------- */

function mask(id: string, name: string, shape: "rectangle" | "circle", tags: string[]): Preset {
  return {
    id,
    name,
    category: "mask",
    tags: ["mask", ...tags],
    builtIn: true,
    animatedProperties: [],
    defaults: { duration: 0.5, intensity: 100, easing: "easeInOut", softEdge: 0 },
    maskShape: shape,
  };
}

const WIPE_RIGHT = mask("wipe-right", "Wipe right", "rectangle", ["directional"]);
const WIPE_LEFT = mask("wipe-left", "Wipe left", "rectangle", ["directional"]);
const WIPE_UP = mask("wipe-up", "Wipe up", "rectangle", ["directional"]);
const WIPE_DOWN = mask("wipe-down", "Wipe down", "rectangle", ["directional"]);
const IRIS_OUT = mask("iris-out", "Iris out", "circle", ["reveal"]);
const IRIS_IN = mask("iris-in", "Iris in", "circle", ["reveal"]);

/* -------------------------------------------------------------------------- */
/*  Exported bundle                                                            */
/* -------------------------------------------------------------------------- */

export const BUILT_IN_PRESETS: readonly Preset[] = [
  // Enter
  POP_IN,
  FADE_IN,
  SLIDE_IN,
  SCALE_UP,
  SPRING_IN,
  ROTATE_IN,
  FADE_UP,
  STAGGER_LETTERS,
  // Idle
  FLOAT,
  PULSE,
  WOBBLE,
  SLOW_ROTATE,
  BOUNCE_LOOP,
  // Exit
  FADE_OUT,
  POP_OUT,
  SLIDE_OUT,
  SCALE_DOWN,
  // Mask
  WIPE_RIGHT,
  WIPE_LEFT,
  WIPE_UP,
  WIPE_DOWN,
  IRIS_OUT,
  IRIS_IN,
];

void now; // timestamps are set when a preset is persisted server-side.
