import { create } from "zustand";
import { temporal } from "zundo";

import type { PlanItem, Project } from "@/types";

interface ProjectStoreState {
  project: Project | null;
  selectedPlanItemId: string | null;
}

interface ProjectStoreActions {
  setProject: (project: Project | null) => void;
  setSelectedPlanItemId: (id: string | null) => void;
  upsertPlanItem: (item: PlanItem) => void;
  removePlanItem: (id: string) => void;
}

export type ProjectStore = ProjectStoreState & ProjectStoreActions;

export const useProjectStore = create<ProjectStore>()(
  temporal(
    (set) => ({
      project: null,
      selectedPlanItemId: null,

      setProject: (project) => set({ project, selectedPlanItemId: null }),
      setSelectedPlanItemId: (id) => set({ selectedPlanItemId: id }),

      upsertPlanItem: (item) =>
        set((state) => {
          if (!state.project) return state;
          const idx = state.project.planItems.findIndex((p) => p.id === item.id);
          const planItems =
            idx === -1
              ? [...state.project.planItems, item]
              : state.project.planItems.map((p) => (p.id === item.id ? item : p));
          return { project: { ...state.project, planItems } };
        }),

      removePlanItem: (id) =>
        set((state) => {
          if (!state.project) return state;
          return {
            project: {
              ...state.project,
              planItems: state.project.planItems.filter((p) => p.id !== id),
            },
            selectedPlanItemId:
              state.selectedPlanItemId === id ? null : state.selectedPlanItemId,
          };
        }),
    }),
    {
      limit: 100,
      partialize: (state) => ({
        project: state.project,
        selectedPlanItemId: state.selectedPlanItemId,
      }),
    },
  ),
);
