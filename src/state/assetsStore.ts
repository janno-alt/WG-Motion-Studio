import { create } from "zustand";

import type { Asset } from "@/types";
import { commands } from "@/lib/tauri";

interface AssetsStoreState {
  byProject: Record<string, Asset[]>;
  loading: boolean;

  load: (projectId: string) => Promise<void>;
  upsert: (asset: Asset) => void;
  remove: (assetId: string) => void;
  forProject: (projectId: string) => Asset[];
}

export const useAssetsStore = create<AssetsStoreState>((set, get) => ({
  byProject: {},
  loading: false,

  load: async (projectId) => {
    set({ loading: true });
    try {
      const assets = await commands.listAssets(projectId);
      set((s) => ({ byProject: { ...s.byProject, [projectId]: assets }, loading: false }));
    } catch {
      set({ loading: false });
    }
  },

  upsert: (asset) =>
    set((s) => {
      const list = s.byProject[asset.projectId] ?? [];
      const idx = list.findIndex((a) => a.id === asset.id);
      const next = idx === -1 ? [asset, ...list] : list.map((a) => (a.id === asset.id ? asset : a));
      return { byProject: { ...s.byProject, [asset.projectId]: next } };
    }),

  remove: (assetId) =>
    set((s) => {
      const next: Record<string, Asset[]> = {};
      for (const [k, list] of Object.entries(s.byProject)) {
        next[k] = list.filter((a) => a.id !== assetId);
      }
      return { byProject: next };
    }),

  forProject: (projectId) => get().byProject[projectId] ?? [],
}));
