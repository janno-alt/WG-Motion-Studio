import { create } from "zustand";

import type { Theme } from "@/types";

interface AppStoreState {
  themes: Theme[];
  activeThemeId: string | null;
}

interface AppStoreActions {
  setThemes: (themes: Theme[]) => void;
  setActiveThemeId: (id: string | null) => void;
}

export const useAppStore = create<AppStoreState & AppStoreActions>((set) => ({
  themes: [],
  activeThemeId: null,
  setThemes: (themes) => set({ themes }),
  setActiveThemeId: (id) => set({ activeThemeId: id }),
}));
