import { useEffect } from "react";

import { HOTKEYS, isEditableTarget } from "@/lib/hotkeys";
import { useTimelineStore } from "@/state/timelineStore";

export function useTimelineHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (HOTKEYS.splitAtPlayhead.match(e)) {
        e.preventDefault();
        const { selectedClipIds, clips, playheadSec, splitClipAt, saveSnapshot } =
          useTimelineStore.getState();
        const candidate =
          (selectedClipIds.size > 0
            ? clips.find((c) => selectedClipIds.has(c.id))
            : clips.find(
                (c) => c.startSec <= playheadSec && playheadSec < c.startSec + c.durationSec,
              )) ?? null;
        if (candidate) {
          const newId = splitClipAt(candidate.id, playheadSec);
          if (newId) void saveSnapshot();
        }
        return;
      }

      if (HOTKEYS.delete.match(e)) {
        e.preventDefault();
        const { selectedClipIds, removeSelected, saveSnapshot } = useTimelineStore.getState();
        if (selectedClipIds.size > 0) {
          removeSelected();
          void saveSnapshot();
        }
        return;
      }

      if (HOTKEYS.undo.match(e)) {
        e.preventDefault();
        useTimelineStore.temporal.getState().undo();
        void useTimelineStore.getState().saveSnapshot();
        return;
      }

      if (HOTKEYS.redo.match(e)) {
        e.preventDefault();
        useTimelineStore.temporal.getState().redo();
        void useTimelineStore.getState().saveSnapshot();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
