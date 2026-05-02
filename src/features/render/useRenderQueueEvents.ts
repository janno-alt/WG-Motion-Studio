import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { useRendersStore } from "@/state/rendersStore";
import type { RenderQueueEvent } from "@/types";

/**
 * Subscribes to the global "render-queue" Tauri event and patches the
 * rendersStore in place so any open RenderQueueScreen + sidebar badge
 * stay in sync without polling.
 */
export function useRenderQueueEvents() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void (async () => {
      unlisten = await listen<RenderQueueEvent>("render-queue", (e) => {
        const ev = e.payload;
        const { patch, load } = useRendersStore.getState();
        switch (ev.stage) {
          case "queued":
            // Reload to pick up the new row
            void load(null);
            break;
          case "started":
            patch(ev.renderId, { status: "running", startedAt: Date.now() });
            break;
          case "progress": {
            const p =
              ev.totalFrames && ev.totalFrames > 0
                ? Math.min(1, ev.frame / ev.totalFrames)
                : 0;
            patch(ev.renderId, { progress: p });
            break;
          }
          case "done":
            patch(ev.renderId, {
              status: "done",
              progress: 1,
              outputPath: ev.outputPath,
              finishedAt: Date.now(),
            });
            break;
          case "failed":
            patch(ev.renderId, {
              status: "failed",
              error: ev.message,
              finishedAt: Date.now(),
            });
            break;
          case "cancelled":
            patch(ev.renderId, { status: "cancelled", finishedAt: Date.now() });
            break;
        }
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);
}
