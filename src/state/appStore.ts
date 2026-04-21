import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppStoreState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/**
 * UI-only state — persisted to localStorage.
 * Domain data lives in SQLite and is never persisted here.
 */
export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: "wg-motion-studio.ui",
    },
  ),
);
