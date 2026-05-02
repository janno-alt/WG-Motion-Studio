import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, FolderOpen, Package, X } from "lucide-react";

import { Button } from "@/components/Button";
import { commands } from "@/lib/tauri";
import { buildFcpxml } from "@/lib/export/fcpxml";
import { useAssetsStore } from "@/state/assetsStore";
import { useBrandKitsStore } from "@/state/brandKitsStore";
import { useProjectsStore } from "@/state/projectsStore";
import { useTimelineStore } from "@/state/timelineStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Format = "9:16" | "16:9";

export function FcpxmlExportDialog({ open, onClose }: Props) {
  const projectId = useTimelineStore((s) => s.projectId);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const assets = useAssetsStore((s) => (projectId ? s.byProject[projectId] ?? [] : []));
  const projects = useProjectsStore((s) => s.projects);
  const brandKits = useBrandKitsStore((s) => s.brandKits);

  const [format, setFormat] = useState<Format>("9:16");
  const [busy, setBusy] = useState(false);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [bundlePath, setBundlePath] = useState<string | null>(null);

  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const brandKit = project ? brandKits.find((k) => k.id === project.clientId) ?? null : null;
  const dims = format === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };

  const writeFcpxml = async (filename = "timeline.fcpxml") => {
    if (!projectId || !project) {
      toast.error("No project loaded.");
      return null;
    }
    if (clips.length === 0) {
      toast.error("Empty timeline.");
      return null;
    }
    const xml = buildFcpxml({
      timeline: { projectId, tracks, clips },
      assets,
      brandKit,
      fps: 30,
      format: dims,
      projectName: project.name,
    });
    return await commands.writeProjectExport(projectId, filename, xml);
  };

  const exportFcpxml = async () => {
    setBusy(true);
    try {
      const path = await writeFcpxml();
      if (path) {
        setResultPath(path);
        toast.success("FCPXML written.");
      }
    } catch (err) {
      toast.error(`Export failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const exportBundle = async () => {
    if (!project) return;
    setBusy(true);
    try {
      // Write fcpxml + project.json + brand_kit.json into the project's
      // exports directory, then zip them.
      await writeFcpxml("timeline.fcpxml");
      await commands.writeProjectExport(
        project.id,
        "project.json",
        JSON.stringify(
          {
            project,
            timeline: { projectId: project.id, tracks, clips },
            assets,
          },
          null,
          2,
        ),
      );
      if (brandKit) {
        await commands.writeProjectExport(
          project.id,
          "brand_kit.json",
          JSON.stringify(brandKit, null, 2),
        );
      }
      const zipPath = await commands.zipProjectExports(project.id, project.name);
      setBundlePath(zipPath);
      toast.success("Bundle ZIP created.");
    } catch (err) {
      toast.error(`Bundle failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (path: string) => {
    try {
      await commands.revealInFinder(path);
    } catch (err) {
      toast.error(`Reveal failed: ${String(err)}`);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v && !busy ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-1 p-4 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              Export
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary"
              disabled={busy}
            >
              <X size={14} />
            </button>
          </div>

          <Dialog.Description className="mb-3 text-2xs text-text-muted">
            FCPXML 1.10 — opens in Final Cut Pro X and DaVinci Resolve. Bundle
            also packages project.json + brand_kit.json into a ZIP next to it.
          </Dialog.Description>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-text-primary">
              Sequence format
            </label>
            <div className="flex gap-1">
              {(["9:16", "16:9"] as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={[
                    "rounded-default px-2 py-1 text-xs transition-colors",
                    format === f
                      ? "bg-surface-3 text-text-primary"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                  ].join(" ")}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {resultPath ? (
            <ResultLine label="FCPXML" path={resultPath} onReveal={() => void reveal(resultPath)} />
          ) : null}
          {bundlePath ? (
            <ResultLine label="Bundle ZIP" path={bundlePath} onReveal={() => void reveal(bundlePath)} />
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Close
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<FileText size={12} />}
              onClick={() => void exportFcpxml()}
              disabled={busy}
            >
              Just FCPXML
            </Button>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Package size={12} />}
              onClick={() => void exportBundle()}
              disabled={busy}
            >
              {busy ? "Writing…" : "Export bundle"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ResultLine({
  label,
  path,
  onReveal,
}: {
  label: string;
  path: string;
  onReveal: () => void;
}) {
  return (
    <div className="mt-3 rounded-default border border-border-subtle bg-surface-0 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs text-text-muted">{label}</span>
        <button
          type="button"
          onClick={onReveal}
          className="flex items-center gap-1 text-2xs text-text-secondary hover:text-text-primary"
        >
          <FolderOpen size={11} /> Reveal
        </button>
      </div>
      <div className="mt-0.5 truncate font-mono text-2xs text-text-primary" title={path}>
        {path}
      </div>
    </div>
  );
}
