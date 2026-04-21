import { create } from "zustand";
import { startOfMonth } from "date-fns";

import { commands, type UsageSummary } from "@/lib/tauri";

interface UsageStoreState {
  summary: UsageSummary | null;
  refresh: () => Promise<void>;
}

export const useUsageStore = create<UsageStoreState>((set) => ({
  summary: null,
  refresh: async () => {
    const since = startOfMonth(new Date()).getTime();
    try {
      const summary = await commands.getUsageSince(since);
      set({ summary });
    } catch {
      /* keep previous summary on failure */
    }
  },
}));
