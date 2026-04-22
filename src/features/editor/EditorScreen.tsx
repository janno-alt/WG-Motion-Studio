import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { PlayerRef } from "@remotion/player";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditorToolbar } from "./components/EditorToolbar";
import { EditorViewport } from "./components/EditorViewport";
import { PropertyPanel } from "./components/PropertyPanel";
import { SlotTimeline } from "./components/SlotTimeline";
import { PresetLibrary } from "./components/PresetLibrary";
import { useEditorStore, useEditorHistory } from "@/state/editorStore";
import { usePresetsStore } from "@/state/presetsStore";
import { useProjectsStore } from "@/state/projectsStore";
import { useThemesStore } from "@/state/themesStore";
import { commands } from "@/lib/tauri";
import { useAutoSave } from "./hooks/useAutoSave";
import type { PlanItem, Project, Theme } from "@/types";

const SESSION_ORIGINAL_PREFIX = "originalPlanItem_";

export function EditorScreen() {
  const { id: projectId, itemId } = useParams();
  const navigate = useNavigate();

  const { projects, load: loadProjects } = useProjectsStore();
  const { themes, load: loadThemes } = useThemesStore();
  const presets = usePresetsStore((s) => s.presets);

  const hydrate = useEditorStore((s) => s.hydrate);
  const clearStore = useEditorStore((s) => s.clear);
  const history = useEditorHistory();

  const [project, setProject] = useState<Project | null>(null);
  const [item, setItem] = useState<PlanItem | null>(null);
  const [showConfirmBack, setShowConfirmBack] = useState(false);
  const [zoom, setZoom] = useState(0.3);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playerRef = useRef<PlayerRef | null>(null);
  const [editorName, setEditorName] = useState("");

  /* --- Load project + item ------------------------------------------------ */

  useEffect(() => {
    if (projects.length === 0) void loadProjects();
    void loadThemes();
  }, [loadProjects, loadThemes, projects.length]);

  useEffect(() => {
    if (!projectId) return;
    const fromStore = projects.find((p) => p.id === projectId) ?? null;
    if (fromStore) {
      setProject(fromStore);
    } else {
      void commands.getProject(projectId).then(setProject).catch(() => setProject(null));
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (!project || !itemId) return;
    const found = project.planItems.find((p) => p.id === itemId);
    if (!found) {
      toast.error("Plan item not found.");
      navigate(`/projects/${project.id}`, { replace: true });
      return;
    }
    setItem(found);
    hydrate(found, project.fps, project.id);
    setEditorName(suggestItemName(found));

    // Cache the AI-default for the reset button.
    const key = SESSION_ORIGINAL_PREFIX + found.id;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, JSON.stringify(found));
    }

    return () => {
      clearStore();
      history.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, itemId]);

  const theme: Theme | null = useMemo(
    () => themes.find((t) => t.id === project?.clientId) ?? null,
    [themes, project?.clientId],
  );

  /* --- Auto-save --------------------------------------------------------- */

  const { saveState, saveNow, isDirty } = useAutoSave({
    project,
    itemId: itemId ?? null,
  });

  /* --- Player transport --------------------------------------------------- */

  const duration = useEditorStore((s) => s.duration);
  useEffect(() => {
    const ref = playerRef.current;
    if (!ref) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      setCurrentFrame(e.detail.frame);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    ref.addEventListener("frameupdate", onFrame as never);
    ref.addEventListener("play", onPlay);
    ref.addEventListener("pause", onPause);
    return () => {
      ref.removeEventListener("frameupdate", onFrame as never);
      ref.removeEventListener("play", onPlay);
      ref.removeEventListener("pause", onPause);
    };
  }, [project, item]);

  /* --- Keyboard shortcuts ------------------------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      // Skip when typing in input/textarea (except undo/redo).
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (isMeta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
        return;
      }
      if (isMeta && (e.key === "Z" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        history.redo();
        return;
      }
      if (inField) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === "ArrowLeft") {
        nudgeFrame(e.shiftKey ? -10 : -1);
        return;
      }
      if (e.key === "ArrowRight") {
        nudgeFrame(e.shiftKey ? 10 : 1);
        return;
      }
      if (e.key.toLowerCase() === "j") {
        nudgeFrame(-5);
        return;
      }
      if (e.key.toLowerCase() === "k") {
        playerRef.current?.pause();
        return;
      }
      if (e.key.toLowerCase() === "l") {
        nudgeFrame(5);
        return;
      }
      if (isMeta && e.key === "0") {
        e.preventDefault();
        setZoom(0.3);
        return;
      }
      if (e.key === "Escape") {
        useEditorStore.getState().select(null);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const togglePlay = () => {
    const r = playerRef.current;
    if (!r) return;
    if (r.isPlaying()) r.pause();
    else r.play();
  };

  const nudgeFrame = (delta: number) => {
    const r = playerRef.current;
    if (!r) return;
    const next = Math.max(0, Math.min(Math.round((duration * 30) - 1), r.getCurrentFrame() + delta));
    r.seekTo(next);
  };

  /* --- Back / Reset ------------------------------------------------------- */

  const goBack = () => {
    if (isDirty) setShowConfirmBack(true);
    else navigate(project ? `/projects/${project.id}` : "/dashboard");
  };

  const saveAndBack = async () => {
    await saveNow();
    navigate(project ? `/projects/${project.id}` : "/dashboard");
  };

  const resetToAi = () => {
    if (!itemId) return;
    const raw = sessionStorage.getItem(SESSION_ORIGINAL_PREFIX + itemId);
    if (!raw) {
      toast.info("No AI default cached for this session.");
      return;
    }
    try {
      const original: PlanItem = JSON.parse(raw);
      hydrate(original, project?.fps ?? 30, project?.id ?? "");
      history.clear();
      toast.success("Reverted to AI default.");
    } catch {
      toast.error("Could not restore original.");
    }
  };

  /* --- Render ------------------------------------------------------------ */

  if (!project || !item || !theme) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center text-xs text-text-muted">
          Loading editor…
        </div>
      </div>
    );
  }

  const playheadSec = currentFrame / 30;
  const fps = project.fps;

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar
        name={editorName}
        onRenameName={setEditorName}
        saveState={saveState}
        playing={playing}
        loop={loop}
        currentSec={playheadSec}
        durationSec={duration}
        onPlayPause={togglePlay}
        onToggleLoop={() => setLoop((l) => !l)}
        canUndo={history.pastStates.length > 0}
        canRedo={history.futureStates.length > 0}
        onUndo={() => history.undo()}
        onRedo={() => history.redo()}
        onReset={resetToAi}
        onBack={goBack}
        onSaveAndBack={() => void saveAndBack()}
      />

      <div className="flex min-h-0 flex-1">
        <PresetLibrary themePreferredIds={theme.preferredPresets} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-row">
            <div className="flex min-w-0 flex-1 flex-col">
              <EditorViewport
                ref={playerRef}
                theme={theme}
                presets={presets}
                videoFormat={project.videoFormat}
                zoom={zoom}
              />
            </div>
            <PropertyPanel
              item={item}
              onJumpToFrame={() => playerRef.current?.seekTo(Math.round(item.timestamp * fps))}
            />
          </div>

          <div className="h-[200px] shrink-0 border-t border-border-subtle">
            <SlotTimeline
              presets={presets}
              itemDuration={duration}
              playheadSec={playheadSec}
              onPlayheadChange={(sec) => playerRef.current?.seekTo(Math.round(sec * 30))}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirmBack}
        onOpenChange={setShowConfirmBack}
        title="Leave editor?"
        description="You have unsaved changes that will be saved before leaving."
        confirmLabel="Save & leave"
        onConfirm={() => {
          setShowConfirmBack(false);
          void saveAndBack();
        }}
      />
    </div>
  );
}

function suggestItemName(item: PlanItem): string {
  const t = item.timestamp.toFixed(2);
  const kind = item.tier === 1 ? item.componentType ?? "Tier 1" : `Tier ${item.tier}`;
  return `${kind} @ ${t}s`;
}
