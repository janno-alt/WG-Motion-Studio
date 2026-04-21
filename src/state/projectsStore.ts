import { create } from "zustand";

import type { Project } from "@/types";
import { commands } from "@/lib/tauri";

interface ProjectsStoreState {
  projects: Project[];
  selectedProjectId: string | null;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  select: (id: string | null) => void;
  upsert: (project: Project) => void;
  remove: (id: string) => void;
}

export const useProjectsStore = create<ProjectsStoreState>((set) => ({
  projects: [],
  selectedProjectId: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await commands.listProjects();
      set({ projects, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  select: (selectedProjectId) => set({ selectedProjectId }),

  upsert: (project) =>
    set((s) => {
      const idx = s.projects.findIndex((p) => p.id === project.id);
      const projects =
        idx === -1
          ? [project, ...s.projects]
          : s.projects.map((p) => (p.id === project.id ? project : p));
      return { projects };
    }),

  remove: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      selectedProjectId: s.selectedProjectId === id ? null : s.selectedProjectId,
    })),
}));
