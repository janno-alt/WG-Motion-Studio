import { create } from "zustand";

import type { BrandKit } from "@/types";
import { commands } from "@/lib/tauri";

interface BrandKitsStoreState {
  brandKits: BrandKit[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  upsert: (kit: BrandKit) => void;
  remove: (id: string) => void;
}

export const useBrandKitsStore = create<BrandKitsStoreState>((set) => ({
  brandKits: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const brandKits = await commands.listBrandKits();
      set({ brandKits, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  upsert: (kit) =>
    set((s) => {
      const idx = s.brandKits.findIndex((t) => t.id === kit.id);
      const brandKits =
        idx === -1
          ? [...s.brandKits, kit]
          : s.brandKits.map((t) => (t.id === kit.id ? kit : t));
      return { brandKits };
    }),

  remove: (id) =>
    set((s) => ({ brandKits: s.brandKits.filter((t) => t.id !== id) })),
}));
