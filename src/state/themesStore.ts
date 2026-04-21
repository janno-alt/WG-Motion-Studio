import { create } from "zustand";

import type { Theme } from "@/types";
import { commands } from "@/lib/tauri";

interface ThemesStoreState {
  themes: Theme[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  upsert: (theme: Theme) => void;
  remove: (id: string) => void;
}

export const useThemesStore = create<ThemesStoreState>((set) => ({
  themes: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const themes = await commands.listThemes();
      set({ themes, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  upsert: (theme) =>
    set((s) => {
      const idx = s.themes.findIndex((t) => t.id === theme.id);
      const themes =
        idx === -1 ? [...s.themes, theme] : s.themes.map((t) => (t.id === theme.id ? theme : t));
      return { themes };
    }),

  remove: (id) => set((s) => ({ themes: s.themes.filter((t) => t.id !== id) })),
}));
