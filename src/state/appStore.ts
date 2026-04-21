import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppStoreState {
  sidebarCollapsed: boolean;
  monthlyBudgetUsd: number;
  projectListLayout: "grid" | "list";

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMonthlyBudget: (usd: number) => void;
  setProjectListLayout: (layout: "grid" | "list") => void;
}

/**
 * UI-only state — persisted to localStorage.
 * Domain data lives in SQLite and is never persisted here.
 */
export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      monthlyBudgetUsd: 50,
      projectListLayout: "grid",

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMonthlyBudget: (monthlyBudgetUsd) => set({ monthlyBudgetUsd }),
      setProjectListLayout: (projectListLayout) => set({ projectListLayout }),
    }),
    { name: "wg-motion-studio.ui" },
  ),
);
