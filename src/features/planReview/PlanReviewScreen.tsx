import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "./components/Timeline";
import { PlanPlayer } from "./components/PlanPlayer";
import { PlanItemDetailPanel } from "./components/PlanItemDetailPanel";
import { commands } from "@/lib/tauri";
import { PLANNING_PROMPT } from "@/lib/planningPrompt";
import { parseSrt, type SrtBlock } from "@/lib/srt";
import { useProjectsStore } from "@/state/projectsStore";
import { useThemesStore } from "@/state/themesStore";
import { usePresetsStore } from "@/state/presetsStore";
import type { PlanItem, Project, Theme } from "@/types";

export function PlanReviewScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, upsert, load } = useProjectsStore();
  const { themes, load: loadThemes } = useThemesStore();
  const presets = usePresetsStore((s) => s.presets);

  const [project, setProject] = useState<Project | null>(null);
  const [srtBlocks, setSrtBlocks] = useState<SrtBlock[]>([]);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length === 0) void load();
    void loadThemes();
  }, [load, loadThemes, projects.length]);

  useEffect(() => {
    if (!id) return;
    const fromStore = projects.find((p) => p.id === id);
    if (fromStore) {
      setProject(fromStore);
    } else {
      void commands.getProject(id).then(setProject).catch(() => setProject(null));
    }
  }, [id, projects]);

  useEffect(() => {
    if (!project?.srtPath) return;
    void (async () => {
      try {
        const content = await readTextFile(project.srtPath);
        setSrtBlocks(parseSrt(content).blocks);
      } catch {
        setSrtBlocks([]);
      }
    })();
  }, [project?.srtPath]);

  const theme = useMemo<Theme | undefined>(
    () => themes.find((t) => t.id === project?.clientId),
    [themes, project?.clientId],
  );

  const selectedItem = useMemo<PlanItem | null>(
    () => project?.planItems.find((p) => p.id === selectedItemId) ?? null,
    [project, selectedItemId],
  );

  if (!project) {
    return (
      <div className="flex h-full flex-col">
        <ScreenHeader title="Plan review" />
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Loading project…
        </div>
      </div>
    );
  }

  const regenerate = async () => {
    if (!id) return;
    setConfirmingRegen(false);
    setRegenerating(true);
    try {
      const result = await commands.generatePlan(id, PLANNING_PROMPT);
      upsert(result.project);
      setProject(result.project);
      toast.success(`Plan regenerated — ${result.itemCount} items`);
    } catch (err) {
      toast.error(`Regenerate failed: ${String(err)}`);
    } finally {
      setRegenerating(false);
    }
  };

  const updateItem = async (next: PlanItem) => {
    if (!project) return;
    const updated: Project = {
      ...project,
      planItems: project.planItems.map((p) => (p.id === next.id ? next : p)),
      updatedAt: Date.now(),
    };
    try {
      const saved = await commands.updateProject(updated);
      setProject(saved);
      upsert(saved);
    } catch (err) {
      toast.error(`Update failed: ${String(err)}`);
    }
  };

  const deleteItem = async (victim: PlanItem) => {
    if (!project) return;
    const updated: Project = {
      ...project,
      planItems: project.planItems.filter((p) => p.id !== victim.id),
      updatedAt: Date.now(),
    };
    try {
      const saved = await commands.updateProject(updated);
      setProject(saved);
      upsert(saved);
      setSelectedItemId(null);
      toast.success("Item removed");
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Plan review"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<RefreshCw size={14} />}
              disabled={regenerating}
              onClick={() => setConfirmingRegen(true)}
            >
              {regenerating ? "Regenerating…" : "Regenerate plan"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled
              title="Not implemented yet — phase 5"
            >
              Generate assets
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 border-b border-border-subtle bg-surface-1 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-text-primary">
          <span className="font-semibold">{project.name}</span>
        </div>
        <span className="flex items-center gap-1.5 text-text-secondary">
          <span
            className="h-2.5 w-2.5 rounded-full border border-border-subtle"
            style={{ background: theme?.colors.primary ?? "#2A2A2A" }}
          />
          {theme?.name ?? project.clientId}
        </span>
        <StatusBadge status={project.status} />
        <div className="ml-auto text-text-muted">
          {project.planItems.length} items · {project.videoFormat} ·{" "}
          {project.videoDuration.toFixed(1)}s
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <Timeline
            duration={project.videoDuration}
            planItems={project.planItems}
            srtBlocks={srtBlocks}
            themePrimary={theme?.colors.primary ?? "#C8FF00"}
            onItemClick={(item) => setSelectedItemId(item.id)}
            onItemDoubleClick={(item) =>
              navigate(`/projects/${project.id}/editor/${item.id}`)
            }
            selectedItemId={selectedItemId}
          />
          {theme ? (
            <div className="shrink-0 border-t border-border-subtle">
              <PlanPlayer project={project} theme={theme} presets={presets} />
            </div>
          ) : null}
        </div>
        <PlanItemDetailPanel
          project={project}
          item={selectedItem}
          onUpdate={(next) => void updateItem(next)}
          onDelete={(v) => void deleteItem(v)}
        />
      </div>

      <ConfirmDialog
        open={confirmingRegen}
        onOpenChange={setConfirmingRegen}
        title="Regenerate plan?"
        description={
          <>
            This will discard all {project.planItems.length} current graphics and ask
            Claude to propose a fresh plan.
          </>
        }
        confirmLabel="Regenerate"
        danger
        onConfirm={() => void regenerate()}
      />
    </div>
  );
}
