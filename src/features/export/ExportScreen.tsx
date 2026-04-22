import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FileCode2, FileArchive, Film, Video, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { TierBadge } from "@/components/TierBadge";
import { buildFcpxml, type FcpxmlAsset } from "@/lib/export/fcpxml";
import { buildResolveScript, type ResolveScriptAsset } from "@/lib/export/resolveScript";
import { commands } from "@/lib/tauri";
import { formatUsd } from "@/lib/pricing";
import { formatSeconds } from "@/lib/format";
import { useProjectsStore } from "@/state/projectsStore";
import { useThemesStore } from "@/state/themesStore";
import { useUsageStore } from "@/state/usageStore";
import type { PlanItem, Project, Theme } from "@/types";

type CardStatus = "idle" | "running" | "done" | "error";

interface CardState {
  status: CardStatus;
  resultPath?: string;
  error?: string;
}

const BLANK: CardState = { status: "idle" };

export function ExportScreen() {
  const { id } = useParams();
  const { projects, load: loadProjects, upsert } = useProjectsStore();
  const { themes, load: loadThemes } = useThemesStore();
  const usage = useUsageStore();

  const [project, setProject] = useState<Project | null>(null);
  const [fcpxmlState, setFcpxml] = useState<CardState>(BLANK);
  const [scriptState, setScript] = useState<CardState>(BLANK);
  const [zipState, setZip] = useState<CardState>(BLANK);
  const [fullState, setFull] = useState<CardState>(BLANK);

  useEffect(() => {
    if (projects.length === 0) void loadProjects();
    void loadThemes();
    void usage.refresh();
  }, []);

  useEffect(() => {
    if (!id) return;
    const fromStore = projects.find((p) => p.id === id);
    if (fromStore) setProject(fromStore);
    else void commands.getProject(id).then(setProject).catch(() => setProject(null));
  }, [id, projects]);

  const theme: Theme | undefined = useMemo(
    () => themes.find((t) => t.id === project?.clientId),
    [themes, project?.clientId],
  );

  if (!project) {
    return (
      <div className="flex h-full flex-col">
        <ScreenHeader title="Export" />
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Loading project…
        </div>
      </div>
    );
  }

  /* --- Helpers ----------------------------------------------------------- */

  const itemsReady = project.planItems.filter((p) => p.status === "generated");
  const itemsMissing = project.planItems.filter((p) => p.status !== "generated");

  const renderMissingOverlays = async () => {
    // Renders each not-yet-rendered item serially (backend already
    // serialises via RENDER_LOCK, but we await here too so errors
    // surface per-item).
    for (const item of itemsReady) {
      const expected = `${project.id}/renders/overlays/${item.id}.webm`;
      // We don't actually check disk existence — backend will overwrite.
      try {
        await commands.renderItemOverlay(project.id, item.id, undefined, "webm");
      } catch (err) {
        throw new Error(`Render ${item.id} failed: ${String(err)}`);
      }
      void expected;
    }
  };

  const collectOverlayAssets = async () => {
    // Re-fetch project so we have latest finalAssetUrl paths etc.
    const fresh = await commands.getProject(project.id);
    setProject(fresh);
    upsert(fresh);
    const paths = await commands.getAppPaths();
    // Convention: overlays live in `{projectsDir}/{projectId}/renders/overlays/{itemId}.webm`.
    const base = `${paths.projectsDir}/${project.id}/renders/overlays`;
    const map = new Map<string, FcpxmlAsset>();
    for (const item of fresh.planItems) {
      if (item.status !== "generated") continue;
      map.set(item.id, {
        id: item.id,
        path: `${base}/${item.id}.webm`,
        durationSec: item.duration,
      });
    }
    return map;
  };

  /* --- FCPXML ------------------------------------------------------------ */

  const exportFcpxml = async () => {
    setFcpxml({ status: "running" });
    try {
      await renderMissingOverlays();
      const assets = await collectOverlayAssets();
      const xml = buildFcpxml({ project, assets });
      const path = await commands.writeProjectExport(project.id, "timeline.fcpxml", xml);
      setFcpxml({ status: "done", resultPath: path });
      toast.success("FCPXML exported");
    } catch (err) {
      setFcpxml({ status: "error", error: String(err) });
      toast.error(`FCPXML export failed: ${String(err)}`);
    }
  };

  /* --- Resolve Python ---------------------------------------------------- */

  const exportResolveScript = async () => {
    setScript({ status: "running" });
    try {
      const assets = await collectOverlayAssets();
      const scriptAssets: ResolveScriptAsset[] = project.planItems
        .filter((p) => assets.has(p.id))
        .map((p) => ({
          itemId: p.id,
          path: assets.get(p.id)!.path,
          timestamp: p.timestamp,
          duration: p.duration,
          briefShort: (p.brief || p.id).slice(0, 50),
        }));
      const src = buildResolveScript(project, scriptAssets);
      const path = await commands.writeProjectExport(project.id, "resolve-import.py", src);
      setScript({ status: "done", resultPath: path });
      toast.success("Resolve script generated");
    } catch (err) {
      setScript({ status: "error", error: String(err) });
      toast.error(`Script export failed: ${String(err)}`);
    }
  };

  /* --- ZIP --------------------------------------------------------------- */

  const exportZip = async () => {
    setZip({ status: "running" });
    try {
      // Ensure FCPXML exists in the bundle.
      if (fcpxmlState.status !== "done") await exportFcpxml();
      const path = await commands.zipProjectExports(project.id, project.name);
      setZip({ status: "done", resultPath: path });
      toast.success("Project bundle zipped");
    } catch (err) {
      setZip({ status: "error", error: String(err) });
      toast.error(`ZIP export failed: ${String(err)}`);
    }
  };

  /* --- Full render ------------------------------------------------------- */

  const exportFullVideo = async () => {
    const picked = await saveDialog({
      defaultPath: `${project.name.replace(/\s+/g, "_")}.webm`,
      filters: [
        { name: "WebM (VP9 alpha)", extensions: ["webm"] },
        { name: "ProRes 4444", extensions: ["mov"] },
      ],
    });
    if (!picked) return;
    const fmt: "prores" | "webm" = picked.endsWith(".mov") ? "prores" : "webm";
    setFull({ status: "running" });
    try {
      const result = await commands.renderProjectFull(project.id, picked, fmt);
      setFull({ status: "done", resultPath: result.outputPath });
      toast.success("Full video rendered");
    } catch (err) {
      setFull({ status: "error", error: String(err) });
      toast.error(`Full render failed: ${String(err)}`);
    }
  };

  /* --- Render ------------------------------------------------------------ */

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title={`Export · ${project.name}`} />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-6">
          {itemsMissing.length > 0 ? (
            <div className="flex items-start gap-2 rounded-card border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
              <RefreshCw size={14} className="mt-0.5" />
              <div>
                {itemsMissing.length} of {project.planItems.length} items haven&apos;t been
                generated yet. Go back to the plan to generate them before exporting.
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <ExportCard
              icon={FileCode2}
              title="FCPXML"
              tag="Recommended"
              description="Native DaVinci Resolve import. Each overlay lands on its own clip in track 2 with correct timing."
              state={fcpxmlState}
              onExport={() => void exportFcpxml()}
              disabled={itemsReady.length === 0}
            />
            <ExportCard
              icon={FileArchive}
              title="Bundle · ZIP"
              description="Zipped archive with all rendered overlays, FCPXML, and Python script. Portable to other machines."
              state={zipState}
              onExport={() => void exportZip()}
              disabled={itemsReady.length === 0}
            />
            <ExportCard
              icon={Film}
              title="Full overlay video"
              description="Single WebM-alpha or ProRes-4444 with every graphic pre-timed — drop it on a single track."
              state={fullState}
              onExport={() => void exportFullVideo()}
              disabled={itemsReady.length === 0}
            />
            <ExportCard
              icon={Video}
              title="Resolve Python script"
              description="Run inside Resolve's console when FCPXML can't be imported."
              state={scriptState}
              onExport={() => void exportResolveScript()}
              disabled={itemsReady.length === 0}
            />
          </div>

          {/* Project meta */}
          <section className="rounded-card border border-border-subtle bg-surface-1 p-4">
            <h2 className="mb-3 text-2xs font-semibold uppercase tracking-wide text-text-muted">
              Project details
            </h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-text-muted">Theme</div>
                <div className="flex items-center gap-1.5 text-text-primary">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-border-subtle"
                    style={{ background: theme?.colors.primary ?? "#2A2A2A" }}
                  />
                  {theme?.name ?? project.clientId}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Format</div>
                <div className="font-mono text-text-primary">
                  {project.videoFormat} @ {project.fps}fps · {formatSeconds(project.videoDuration)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Plan items</div>
                <div className="text-text-primary">
                  {itemsReady.length} ready · {itemsMissing.length} pending
                </div>
              </div>
              <div>
                <div className="text-text-muted">API cost (this month)</div>
                <div className="font-mono text-text-primary">
                  {formatUsd(usage.summary?.totalCostUsd ?? 0)}
                </div>
              </div>
            </div>
          </section>

          {/* Per-item list */}
          <section className="rounded-card border border-border-subtle bg-surface-1">
            <header className="flex items-center justify-between border-b border-border-subtle px-4 py-2 text-2xs uppercase tracking-wide text-text-muted">
              <span>Items in export</span>
              <span className="font-mono">{itemsReady.length}</span>
            </header>
            <ul className="divide-y divide-border-subtle">
              {project.planItems.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function ExportCard({
  icon: Icon,
  title,
  tag,
  description,
  state,
  onExport,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  tag?: string;
  description: string;
  state: CardState;
  onExport: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-1 p-4 shadow-panel">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-accent-primary" />
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {tag ? (
          <span className="ml-auto rounded-full bg-accent-primary/15 px-2 py-0.5 text-2xs text-accent-primary">
            {tag}
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">{description}</p>
      <div className="flex items-center justify-between pt-1">
        {state.status === "done" ? (
          <div className="flex flex-1 items-center gap-1.5 overflow-hidden text-2xs text-success">
            <span className="truncate font-mono" title={state.resultPath}>
              {state.resultPath ? abbreviatePath(state.resultPath) : ""}
            </span>
            {state.resultPath ? (
              <button
                type="button"
                onClick={() => void commands.revealInFinder(state.resultPath!)}
                className="flex h-6 w-6 items-center justify-center rounded-default text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                title="Reveal in Finder"
              >
                <FolderOpen size={12} />
              </button>
            ) : null}
          </div>
        ) : state.status === "error" ? (
          <div className="flex-1 text-2xs text-danger" title={state.error}>
            Failed — see toast.
          </div>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={disabled || state.status === "running"}
          onClick={onExport}
        >
          {state.status === "running" ? "Working…" : state.status === "done" ? "Re-export" : "Export"}
        </Button>
      </div>
    </div>
  );
}

function ItemRow({ item }: { item: PlanItem }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-xs">
      <span className="w-14 shrink-0 font-mono text-text-muted">{item.timestamp.toFixed(2)}s</span>
      <TierBadge tier={item.tier} />
      <span className="min-w-0 flex-1 truncate text-text-primary">{item.brief}</span>
      <span
        className={[
          "rounded-full px-2 py-0.5 text-2xs",
          item.status === "generated"
            ? "bg-success/15 text-success"
            : "bg-surface-3 text-text-muted",
        ].join(" ")}
      >
        {item.status}
      </span>
    </li>
  );
}

function abbreviatePath(path: string): string {
  const parts = path.split(/[\\/]/);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-3).join("/")}`;
}
