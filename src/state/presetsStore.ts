import { create } from "zustand";

import type { Preset } from "@/types";
import { commands } from "@/lib/tauri";
import { BUILT_IN_PRESETS } from "@remotion-project/presets/builtins";

interface PresetsStoreState {
  presets: Preset[];
  byId: Record<string, Preset>;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  upsert: (preset: Preset) => void;
  remove: (id: string) => void;
}

function indexBy(list: Preset[]): Record<string, Preset> {
  const out: Record<string, Preset> = {};
  for (const p of list) out[p.id] = p;
  return out;
}

export const usePresetsStore = create<PresetsStoreState>((set) => ({
  presets: [],
  byId: {},
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const existing = await commands.listPresets();
      const existingIds = new Set(existing.map((p) => p.id));
      const missing = BUILT_IN_PRESETS.filter((p) => !existingIds.has(p.id));

      // First-run (or post-upgrade) seed: persist any missing built-ins.
      const seeded: Preset[] = [];
      for (const preset of missing) {
        const saved = await commands.savePreset(preset);
        seeded.push(saved);
      }

      const presets = [...existing, ...seeded];
      set({ presets, byId: indexBy(presets), loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  upsert: (preset) =>
    set((s) => {
      const idx = s.presets.findIndex((p) => p.id === preset.id);
      const presets =
        idx === -1
          ? [...s.presets, preset]
          : s.presets.map((p) => (p.id === preset.id ? preset : p));
      return { presets, byId: indexBy(presets) };
    }),

  remove: (id) =>
    set((s) => {
      const presets = s.presets.filter((p) => p.id !== id);
      return { presets, byId: indexBy(presets) };
    }),
}));

// Convenience: grouped-by-category selector helper.
export function groupPresetsByCategory(presets: Preset[]) {
  const enter: Preset[] = [];
  const idle: Preset[] = [];
  const exit: Preset[] = [];
  const mask: Preset[] = [];
  for (const p of presets) {
    if (p.category === "enter") enter.push(p);
    else if (p.category === "idle") idle.push(p);
    else if (p.category === "exit") exit.push(p);
    else if (p.category === "mask") mask.push(p);
  }
  return { enter, idle, exit, mask };
}

