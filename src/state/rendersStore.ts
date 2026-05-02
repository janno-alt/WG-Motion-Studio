import { create } from "zustand";

import { commands } from "@/lib/tauri";
import type { RenderRow } from "@/types";

interface RendersStoreState {
  renders: RenderRow[];
  loading: boolean;

  load: (projectId: string | null) => Promise<void>;
  upsert: (row: RenderRow) => void;
  patch: (renderId: string, patch: Partial<RenderRow>) => void;
  remove: (renderId: string) => void;
}

export const useRendersStore = create<RendersStoreState>((set) => ({
  renders: [],
  loading: false,

  load: async (projectId) => {
    set({ loading: true });
    try {
      const rows = await commands.listRenders(projectId);
      set({ renders: rows, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsert: (row) =>
    set((s) => {
      const idx = s.renders.findIndex((r) => r.id === row.id);
      const renders =
        idx === -1
          ? [row, ...s.renders]
          : s.renders.map((r) => (r.id === row.id ? row : r));
      return { renders };
    }),

  patch: (renderId, patch) =>
    set((s) => ({
      renders: s.renders.map((r) => (r.id === renderId ? { ...r, ...patch } : r)),
    })),

  remove: (renderId) =>
    set((s) => ({ renders: s.renders.filter((r) => r.id !== renderId) })),
}));

export function activeCount(rows: RenderRow[]): number {
  return rows.filter((r) => r.status === "queued" || r.status === "running").length;
}
