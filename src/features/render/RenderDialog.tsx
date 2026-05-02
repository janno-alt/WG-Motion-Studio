import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { X } from "lucide-react";

import { Button } from "@/components/Button";
import { commands } from "@/lib/tauri";
import {
  REEL_9_16,
  type RenderBrandKit,
  type RenderProgressEvent,
} from "@/types";
import { useAssetsStore } from "@/state/assetsStore";
import { useBrandKitsStore } from "@/state/brandKitsStore";
import { useProjectsStore } from "@/state/projectsStore";
import { useTimelineStore } from "@/state/timelineStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RenderDialog({ open, onClose }: Props) {
  const projectId = useTimelineStore((s) => s.projectId);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const assets = useAssetsStore((s) => (projectId ? s.byProject[projectId] ?? [] : []));
  const projects = useProjectsStore((s) => s.projects);
  const brandKits = useBrandKitsStore((s) => s.brandKits);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ frame: number; total: number | null } | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const start = async () => {
    if (!projectId) return;
    if (clips.length === 0) {
      toast.error("Empty timeline.");
      return;
    }
    const renderId = `r-${nanoid(8)}`;
    const projectsDirInfo = await commands.getAppPaths();
    const outDir = `${projectsDirInfo.projectsDir}/${projectId}`;
    const outPath = `${outDir}/${renderId}.mp4`;

    setRunning(true);
    setProgress({ frame: 0, total: null });
    setOutputPath(null);

    const project = projects.find((p) => p.id === projectId);
    const fullKit = project ? brandKits.find((k) => k.id === project.clientId) : undefined;
    const brandKit: RenderBrandKit | null = fullKit
      ? {
          primary: fullKit.colors.primary,
          secondary: fullKit.colors.secondary,
          accent: fullKit.colors.accent,
          background: fullKit.colors.background,
          headlineFont: fullKit.typography.headlineFont,
          bodyFont: fullKit.typography.bodyFont,
        }
      : null;

    try {
      const finalPath = await commands.renderTimeline(
        {
          renderId,
          projectId,
          timeline: { projectId, tracks, clips },
          assets,
          preset: REEL_9_16,
          outputPath: outPath,
          brandKit,
        },
        (e: RenderProgressEvent) => {
          if (e.stage === "encoding") {
            setProgress({ frame: e.frame, total: e.totalFrames });
          } else if (e.stage === "done") {
            setProgress(null);
            setOutputPath(e.outputPath);
          } else if (e.stage === "error") {
            toast.error(`Render error: ${e.message}`);
          }
        },
      );
      toast.success("Render complete.");
      setOutputPath(finalPath);
    } catch (err) {
      toast.error(`Render failed: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const reveal = async () => {
    if (!outputPath) return;
    await commands.revealInFinder(outputPath);
  };

  const percent =
    progress && progress.total ? Math.min(100, Math.round((progress.frame / progress.total) * 100)) : null;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v && !running ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-1 p-4 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              Render — Reel 9:16
            </Dialog.Title>
            <button
              type="button"
              onClick={() => (!running ? onClose() : null)}
              className="text-text-muted hover:text-text-primary disabled:opacity-30"
              disabled={running}
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex justify-between">
              <span>Resolution</span>
              <span className="font-mono">
                {REEL_9_16.width}×{REEL_9_16.height} @ {REEL_9_16.fps}fps
              </span>
            </div>
            <div className="flex justify-between">
              <span>Codec</span>
              <span className="font-mono">{REEL_9_16.videoCodec} · {REEL_9_16.videoBitrate}</span>
            </div>
            <div className="flex justify-between">
              <span>Audio</span>
              <span className="font-mono">{REEL_9_16.audioCodec} · {REEL_9_16.audioBitrate}</span>
            </div>
          </div>

          {progress ? (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-2xs text-text-muted">
                <span>{progress.frame.toLocaleString()} frames{progress.total ? ` / ${progress.total.toLocaleString()}` : ""}</span>
                <span>{percent != null ? `${percent}%` : "…"}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full bg-accent-primary transition-[width] duration-200"
                  style={{ width: percent != null ? `${percent}%` : "10%" }}
                />
              </div>
            </div>
          ) : null}

          {outputPath ? (
            <div className="mt-4 space-y-2">
              <div className="break-all rounded-default bg-surface-2 px-2 py-1.5 font-mono text-2xs text-text-muted">
                {outputPath}
              </div>
              <Button variant="secondary" size="sm" onClick={() => void reveal()}>
                Reveal in Finder
              </Button>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={running}>
              {outputPath ? "Close" : "Cancel"}
            </Button>
            {!outputPath ? (
              <Button variant="primary" size="sm" onClick={() => void start()} disabled={running}>
                {running ? "Rendering…" : "Start render"}
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
