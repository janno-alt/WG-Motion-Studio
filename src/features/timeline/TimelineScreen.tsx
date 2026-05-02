import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { FilePlus2, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { commands } from "@/lib/tauri";
import { useAssetsStore } from "@/state/assetsStore";
import { useTimelineStore } from "@/state/timelineStore";
import { CaptionsPanel } from "@/features/captions/CaptionsPanel";
import { RenderDialog } from "@/features/render/RenderDialog";
import { useTimelineHotkeys } from "./hooks/useTimelineHotkeys";
import { PreviewPane } from "./PreviewPane";
import { TimelineRuler } from "./TimelineRuler";
import { Track } from "./Track";

export function TimelineScreen() {
  const { id: projectId } = useParams<{ id: string }>();
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const zoom = useTimelineStore((s) => s.zoomPxPerSec);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const load = useTimelineStore((s) => s.load);
  const reset = useTimelineStore((s) => s.reset);
  const addClip = useTimelineStore((s) => s.addClip);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);
  const loadAssets = useAssetsStore((s) => s.load);
  const upsertAsset = useAssetsStore((s) => s.upsert);

  const trackPanelRef = useRef<HTMLDivElement>(null);
  const [renderOpen, setRenderOpen] = useState(false);
  useTimelineHotkeys();

  useEffect(() => {
    if (!projectId) return;
    void load(projectId);
    void loadAssets(projectId);
    return () => reset();
  }, [projectId, load, loadAssets, reset]);

  const durationSec = useMemo(() => {
    let max = 30;
    for (const c of clips) {
      const end = c.startSec + c.durationSec;
      if (end > max) max = end;
    }
    return max + 5;
  }, [clips]);

  const trackPanelWidth = durationSec * zoom;

  const importVideo = async () => {
    if (!projectId) return;
    const picked = await open({
      multiple: false,
      filters: [
        { name: "Media", extensions: ["mp4", "mov", "m4v", "mkv", "webm", "mp3", "wav", "m4a", "aac", "jpg", "jpeg", "png"] },
      ],
    });
    if (!picked || typeof picked !== "string") return;
    try {
      const asset = await commands.importAsset(projectId, picked);
      upsertAsset(asset);
      const targetTrack =
        tracks.find((t) => t.kind === (asset.kind === "audio" ? "audio" : "video")) ?? tracks[0];
      if (!targetTrack) {
        toast.error("No matching track for this asset.");
        return;
      }
      const dur = asset.durationSec ?? 5;
      const lastEnd = clips
        .filter((c) => c.trackId === targetTrack.id)
        .reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0);
      addClip({
        trackId: targetTrack.id,
        assetId: asset.id,
        kind: asset.kind === "audio" ? "audio" : asset.kind === "image" ? "image" : "video",
        startSec: lastEnd,
        durationSec: dur,
        inPointSec: 0,
        outPointSec: dur,
        data: null,
      });
      await saveSnapshot();
      toast.success(`Imported ${asset.name}`);
    } catch (err) {
      toast.error(`Import failed: ${String(err)}`);
    }
  };

  if (!projectId) {
    return <div className="p-6 text-sm text-text-muted">No project selected.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Timeline"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<FilePlus2 size={14} />}
              onClick={() => void importVideo()}
            >
              Import
            </Button>
            <Button variant="primary" size="sm" onClick={() => setRenderOpen(true)}>
              Render
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex w-1/2 flex-col border-r border-border-subtle">
          <PreviewPane width={1080} height={1920} />
        </div>
        <div className="flex w-1/2 flex-col">
          <CaptionsPanel />
        </div>
      </div>

      <div className="flex h-7 items-center gap-3 border-t border-border-subtle bg-surface-1 px-2">
        <button
          type="button"
          onClick={() => setZoom(zoom * 0.7)}
          className="flex h-5 w-5 items-center justify-center rounded-default text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          title="Zoom out"
        >
          <ZoomOut size={12} />
        </button>
        <button
          type="button"
          onClick={() => setZoom(zoom * 1.5)}
          className="flex h-5 w-5 items-center justify-center rounded-default text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          title="Zoom in"
        >
          <ZoomIn size={12} />
        </button>
        <span className="font-mono text-2xs text-text-muted">{Math.round(zoom)} px/s</span>
      </div>

      <div className="flex h-72 shrink-0 flex-col overflow-auto bg-surface-0" ref={trackPanelRef}>
        <div className="flex">
          <div className="w-24 shrink-0 border-r border-b border-border-subtle bg-surface-1" />
          <TimelineRuler width={trackPanelWidth} durationSec={durationSec} />
        </div>
        {tracks.map((t) => (
          <Track
            key={t.id}
            track={t}
            clips={clips.filter((c) => c.trackId === t.id)}
            pxPerSec={zoom}
            width={trackPanelWidth}
          />
        ))}
      </div>

      <RenderDialog open={renderOpen} onClose={() => setRenderOpen(false)} />
    </div>
  );
}
