import { create, type StateCreator } from "zustand";
import { temporal, type TemporalState } from "zundo";
import { useStore } from "zustand";
import { nanoid } from "nanoid";

import type {
  AnimationTracks,
  BaseState,
  EasingType,
  PlanItem,
  PresetInstance,
  StyleVariant,
  Tier1ComponentType,
} from "@/types";

type AnimationChannel = "enter" | "idle" | "exit";
type AnimationLane = "motion" | "mask";

interface EditorState {
  projectId: string | null;
  itemId: string | null;
  fps: number;

  baseState: BaseState;
  animation: AnimationTracks;
  brief: string;
  tier: 1 | 2 | 3;
  componentType?: Tier1ComponentType;
  styleVariant?: StyleVariant;
  duration: number;

  /** Non-history UI state kept out of zundo via `partialize`. */
  selectedInstance: {
    channel: AnimationChannel;
    lane: AnimationLane;
    index?: number;
  } | null;

  /** Bumped whenever a user-visible change occurs — save debouncing watches this. */
  revision: number;
}

interface EditorActions {
  hydrate: (item: PlanItem, fps: number, projectId: string) => void;
  clear: () => void;

  setBaseState: (patch: Partial<BaseState>) => void;
  setPosition: (x: number, y: number) => void;
  setRotation: (deg: number) => void;
  setScale: (x: number, y: number) => void;
  setOpacity: (v: number) => void;
  setColor: (hex: string | undefined) => void;
  setAnchorPoint: (x: number, y: number) => void;

  setBrief: (text: string) => void;
  setDuration: (seconds: number) => void;
  setStyleVariant: (v: StyleVariant) => void;
  setTier: (t: 1 | 2 | 3) => void;
  setComponentType: (c: Tier1ComponentType | undefined) => void;

  // Animation slot mutations
  upsertEnterMotion: (instance: PresetInstance | null) => void;
  upsertExitMotion: (instance: PresetInstance | null) => void;
  upsertEnterMask: (instance: PresetInstance | null) => void;
  upsertExitMask: (instance: PresetInstance | null) => void;
  addIdleMotion: (instance: PresetInstance) => void;
  updateIdleMotion: (index: number, instance: PresetInstance) => void;
  removeIdleMotion: (index: number) => void;

  select: (sel: EditorState["selectedInstance"]) => void;
  clearAnimations: () => void;

  toPlanItem: () => PlanItem | null;
}

type EditorStore = EditorState & EditorActions;

const EMPTY_STATE: EditorState = {
  projectId: null,
  itemId: null,
  fps: 30,
  baseState: {
    position: { x: 540, y: 960 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    opacity: 1,
    anchorPoint: { x: 0.5, y: 0.5 },
  },
  animation: {
    enter: { motion: null, mask: null },
    idle: { motion: [], mask: null },
    exit: { motion: null, mask: null },
  },
  brief: "",
  tier: 1,
  duration: 2,
  selectedInstance: null,
  revision: 0,
};

const creator: StateCreator<EditorStore, [], [], EditorStore> = (set, get) => ({
  ...EMPTY_STATE,

  hydrate: (item, fps, projectId) =>
    set({
      projectId,
      itemId: item.id,
      fps,
      baseState: cloneBase(item.baseState),
      animation: cloneAnimation(item.animation),
      brief: item.brief,
      tier: item.tier,
      componentType: item.componentType,
      styleVariant: item.styleVariant,
      duration: item.duration,
      selectedInstance: null,
      revision: 0,
    }),

  clear: () => set(() => ({ ...EMPTY_STATE })),

  setBaseState: (patch) =>
    set((s) => ({
      baseState: { ...s.baseState, ...patch },
      revision: s.revision + 1,
    })),

  setPosition: (x, y) =>
    set((s) => ({
      baseState: { ...s.baseState, position: { x, y } },
      revision: s.revision + 1,
    })),

  setRotation: (deg) =>
    set((s) => ({
      baseState: { ...s.baseState, rotation: deg },
      revision: s.revision + 1,
    })),

  setScale: (x, y) =>
    set((s) => ({
      baseState: { ...s.baseState, scale: { x, y } },
      revision: s.revision + 1,
    })),

  setOpacity: (v) =>
    set((s) => ({
      baseState: { ...s.baseState, opacity: Math.max(0, Math.min(1, v)) },
      revision: s.revision + 1,
    })),

  setColor: (hex) =>
    set((s) => ({
      baseState: { ...s.baseState, color: hex },
      revision: s.revision + 1,
    })),

  setAnchorPoint: (x, y) =>
    set((s) => ({
      baseState: { ...s.baseState, anchorPoint: { x, y } },
      revision: s.revision + 1,
    })),

  setBrief: (text) => set((s) => ({ brief: text, revision: s.revision + 1 })),
  setDuration: (seconds) =>
    set((s) => ({ duration: Math.max(0.2, seconds), revision: s.revision + 1 })),
  setStyleVariant: (v) => set((s) => ({ styleVariant: v, revision: s.revision + 1 })),
  setTier: (t) => set((s) => ({ tier: t, revision: s.revision + 1 })),
  setComponentType: (c) => set((s) => ({ componentType: c, revision: s.revision + 1 })),

  upsertEnterMotion: (instance) =>
    set((s) => ({
      animation: { ...s.animation, enter: { ...s.animation.enter, motion: instance } },
      revision: s.revision + 1,
    })),

  upsertExitMotion: (instance) =>
    set((s) => ({
      animation: { ...s.animation, exit: { ...s.animation.exit, motion: instance } },
      revision: s.revision + 1,
    })),

  upsertEnterMask: (instance) =>
    set((s) => ({
      animation: { ...s.animation, enter: { ...s.animation.enter, mask: instance } },
      revision: s.revision + 1,
    })),

  upsertExitMask: (instance) =>
    set((s) => ({
      animation: { ...s.animation, exit: { ...s.animation.exit, mask: instance } },
      revision: s.revision + 1,
    })),

  addIdleMotion: (instance) =>
    set((s) => ({
      animation: {
        ...s.animation,
        idle: { ...s.animation.idle, motion: [...s.animation.idle.motion, instance] },
      },
      revision: s.revision + 1,
    })),

  updateIdleMotion: (index, instance) =>
    set((s) => ({
      animation: {
        ...s.animation,
        idle: {
          ...s.animation.idle,
          motion: s.animation.idle.motion.map((p, i) => (i === index ? instance : p)),
        },
      },
      revision: s.revision + 1,
    })),

  removeIdleMotion: (index) =>
    set((s) => ({
      animation: {
        ...s.animation,
        idle: {
          ...s.animation.idle,
          motion: s.animation.idle.motion.filter((_, i) => i !== index),
        },
      },
      selectedInstance:
        s.selectedInstance?.channel === "idle" && s.selectedInstance.index === index
          ? null
          : s.selectedInstance,
      revision: s.revision + 1,
    })),

  select: (sel) => set({ selectedInstance: sel }),

  clearAnimations: () =>
    set((s) => ({
      animation: {
        enter: { motion: null, mask: null },
        idle: { motion: [], mask: null },
        exit: { motion: null, mask: null },
      },
      selectedInstance: null,
      revision: s.revision + 1,
    })),

  toPlanItem: () => {
    const s = get();
    if (!s.itemId) return null;
    return {
      id: s.itemId,
      timestamp: 0, // patched in by save flow which merges with stored item
      duration: s.duration,
      tier: s.tier,
      componentType: s.componentType,
      brief: s.brief,
      srtContext: "",
      status: "proposed",
      baseState: cloneBase(s.baseState),
      animation: cloneAnimation(s.animation),
      styleVariant: s.styleVariant,
    };
  },
});

export const useEditorStore = create<EditorStore>()(
  temporal(creator, {
    limit: 100,
    // Only zundo-track real editing state; skip UI-selection + revision.
    partialize: (state) => ({
      baseState: state.baseState,
      animation: state.animation,
      brief: state.brief,
      tier: state.tier,
      componentType: state.componentType,
      styleVariant: state.styleVariant,
      duration: state.duration,
    }),
    equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    handleSet: (handleSet) =>
      debounce((state) => handleSet(state), 250),
  }),
);

/** Hook into the zundo TemporalState to read/execute undo-redo. */
export function useEditorHistory() {
  return useStore(useEditorStore.temporal as never) as TemporalState<
    Partial<EditorStore>
  >;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cloneBase(b: BaseState): BaseState {
  return {
    position: { ...b.position },
    rotation: b.rotation,
    scale: { ...b.scale },
    opacity: b.opacity,
    anchorPoint: { ...b.anchorPoint },
    color: b.color,
  };
}

function cloneAnimation(a: AnimationTracks): AnimationTracks {
  return {
    enter: { motion: a.enter.motion ? { ...a.enter.motion } : null, mask: a.enter.mask ? { ...a.enter.mask } : null },
    idle: { motion: a.idle.motion.map((m) => ({ ...m })), mask: null },
    exit: { motion: a.exit.motion ? { ...a.exit.motion } : null, mask: a.exit.mask ? { ...a.exit.mask } : null },
  };
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

/** A fresh `PresetInstance` starting from a preset's defaults. */
export function instanceFromDefaults(
  presetId: string,
  duration: number,
  intensity = 100,
  easing?: EasingType,
): PresetInstance {
  return {
    presetId,
    duration,
    intensity,
    ...(easing ? { easing } : {}),
  };
}

void nanoid; // kept as a ready-to-use ID mint when drafts need one.
