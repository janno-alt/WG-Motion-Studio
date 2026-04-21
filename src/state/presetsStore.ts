import { create } from "zustand";

import type { Preset } from "@/types";
import { commands } from "@/lib/tauri";

interface PresetsStoreState {
  presets: Preset[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  upsert: (preset: Preset) => void;
  remove: (id: string) => void;
}

export const usePresetsStore = create<PresetsStoreState>((set) => ({
  presets: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const presets = await commands.listPresets();
      set({ presets, loading: false });
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
      return { presets };
    }),

  remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
}));
