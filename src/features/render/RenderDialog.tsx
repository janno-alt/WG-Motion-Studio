import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { X } from "lucide-react";

import { Button } from "@/components/Button";
import { commands } from "@/lib/tauri";
import {
  REEL_9_16,
  type RenderBrandKit,
  type RenderPreset,
} from "@/types";
import { useAssetsStore } from "@/state/assetsStore";
import { useBrandKitsStore } from "@/state/brandKitsStore";
import { useProjectsStore } from "@/state/projectsStore";
import { useTimelineStore } from "@/state/timelineStore";
import { RenderPresetPicker } from "./RenderPresetPicker";

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
  const navigate = useNavigate();

  const [preset, setPreset] = useState<RenderPreset>(REEL_9_16);
  const [submitting, setSubmitting] = useState(false);

  const enqueue = async () => {
    if (!projectId) return;
    if (clips.length === 0) {
      toast.error("Empty timeline.");
      return;
    }
    const renderId = `r-${nanoid(8)}`;
    const projectsDirInfo = await commands.getAppPaths();
    const ext = preset.id === "prores-master" ? "mov" : "mp4";
    const outPath = `${projectsDirInfo.projectsDir}/${projectId}/${renderId}-${preset.id}.${ext}`;

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

    setSubmitting(true);
    try {
      await commands.enqueueRender({
        renderId,
        projectId,
        timeline: { projectId, tracks, clips },
        assets,
        preset,
        outputPath: outPath,
        brandKit,
      });
      toast.success(`Queued ${preset.id} render.`);
      onClose();
      navigate("/renders");
    } catch (err) {
      toast.error(`Enqueue failed: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v && !submitting ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-1 p-4 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              Queue render
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary"
              disabled={submitting}
            >
              <X size={14} />
            </button>
          </div>

          <Dialog.Description className="mb-3 text-2xs text-text-muted">
            Renders execute in order on a single FFmpeg worker. Watch progress
            on the Renders screen; queue more from here while one is running.
          </Dialog.Description>

          <RenderPresetPicker value={preset} onChange={setPreset} />

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void enqueue()} disabled={submitting}>
              {submitting ? "Queueing…" : "Queue render"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
