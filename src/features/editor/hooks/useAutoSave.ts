import { useEffect, useRef, useState } from "react";

import { commands } from "@/lib/tauri";
import { useEditorStore } from "@/state/editorStore";
import { useProjectsStore } from "@/state/projectsStore";
import type { PlanItem, Project } from "@/types";

export type SaveState = "saved" | "dirty" | "saving" | "error";

interface Options {
  project: Project | null;
  itemId: string | null;
  /** Milliseconds of inactivity before writing. */
  debounceMs?: number;
}

/**
 * Auto-save: watches the editor store's `revision` counter and schedules a
 * write to disk `debounceMs` after the last change. Returns the current
 * save state and a manual `saveNow()` action.
 */
export function useAutoSave({ project, itemId, debounceMs = 3000 }: Options) {
  const revision = useEditorStore((s) => s.revision);
  const upsertProject = useProjectsStore((s) => s.upsert);

  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedRevision, setLastSavedRevision] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writing = useRef(false);

  const save = async (isFlush = false) => {
    if (!project || !itemId) return;
    const current = useEditorStore.getState();
    const updated = current.toPlanItem();
    if (!updated) return;
    // Find original item for non-editable fields (timestamp, srtContext, …).
    const original = project.planItems.find((p) => p.id === itemId);
    if (!original) return;

    const merged: PlanItem = {
      ...original,
      brief: updated.brief,
      duration: updated.duration,
      tier: updated.tier,
      componentType: updated.componentType,
      styleVariant: updated.styleVariant,
      baseState: updated.baseState,
      animation: updated.animation,
      // Status: don't regress. If already "approved" stay approved.
      status: original.status,
    };

    const nextProject: Project = {
      ...project,
      planItems: project.planItems.map((p) => (p.id === itemId ? merged : p)),
      updatedAt: Date.now(),
    };

    writing.current = true;
    setSaveState("saving");
    try {
      const saved = await commands.updateProject(nextProject);
      upsertProject(saved);
      setLastSavedRevision(useEditorStore.getState().revision);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      writing.current = false;
    }
    void isFlush;
  };

  useEffect(() => {
    if (!project || !itemId) return;
    if (revision === lastSavedRevision) {
      setSaveState("saved");
      return;
    }
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, project?.id, itemId]);

  // Flush on unmount.
  useEffect(() => {
    return () => {
      if (useEditorStore.getState().revision !== lastSavedRevision && !writing.current) {
        void save(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    saveState,
    isDirty: saveState !== "saved",
    saveNow: () => save(true),
  };
}
