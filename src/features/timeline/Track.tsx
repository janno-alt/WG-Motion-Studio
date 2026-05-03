import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Volume2, VolumeX } from "lucide-react";

import type { Asset, Clip as ClipModel, ClipKind, Track as TrackModel } from "@/types";
import { Clip } from "./Clip";
import { useAssetsStore } from "@/state/assetsStore";
import { useTimelineStore } from "@/state/timelineStore";

interface Props {
  track: TrackModel;
  clips: ClipModel[];
  pxPerSec: number;
  width: number;
}

const TRACK_HEIGHT = 56;

function clipKindForAsset(asset: Asset): ClipKind | null {
  if (asset.kind === "video") return "video";
  if (asset.kind === "audio") return "audio";
  if (asset.kind === "image") return "image";
  return null;
}

function canAcceptOnTrack(asset: Asset, track: TrackModel): boolean {
  if (track.kind === "captions") return false;
  if (track.kind === "audio") return asset.kind === "audio";
  // video lane: video + image OK; standalone audio rejected
  return asset.kind === "video" || asset.kind === "image";
}

export function Track({ track, clips, pxPerSec, width }: Props) {
  const tracks = useTimelineStore((s) => s.tracks);
  const setTrackVolume = useTimelineStore((s) => s.setTrackVolume);
  const setTrackMuted = useTimelineStore((s) => s.setTrackMuted);
  const addClip = useTimelineStore((s) => s.addClip);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);
  const projectAssets = useAssetsStore((s) =>
    track.projectId ? (s.byProject[track.projectId] ?? []) : [],
  );
  const [dropping, setDropping] = useState(false);

  const updateTrack = useCallback(
    (patch: Partial<TrackModel>) => {
      const next = tracks.map((t) => (t.id === track.id ? { ...t, ...patch } : t));
      useTimelineStore.setState({ tracks: next });
      void useTimelineStore.getState().saveSnapshot();
    },
    [track.id, tracks],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-wg-asset-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }, []);

  const onDragLeave = useCallback(() => setDropping(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      setDropping(false);
      const assetId = e.dataTransfer.getData("application/x-wg-asset-id");
      if (!assetId) return;
      e.preventDefault();
      const asset = projectAssets.find((a) => a.id === assetId);
      if (!asset) {
        toast.error("Asset not found.");
        return;
      }
      if (!canAcceptOnTrack(asset, track)) {
        toast.error(`Can't drop ${asset.kind} on ${track.name}.`);
        return;
      }
      const kind = clipKindForAsset(asset);
      if (!kind) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, e.clientX - rect.left + e.currentTarget.scrollLeft);
      const startSec = Math.max(0, x / pxPerSec);
      const dur = asset.durationSec ?? 5;
      addClip({
        trackId: track.id,
        assetId: asset.id,
        kind,
        startSec,
        durationSec: dur,
        inPointSec: 0,
        outPointSec: dur,
        data: null,
      });
      void saveSnapshot();
      toast.success(`${asset.name} → ${track.name}`);
    },
    [track, pxPerSec, projectAssets, addClip, saveSnapshot],
  );

  return (
    <div className="flex border-b border-border-subtle" style={{ height: TRACK_HEIGHT }}>
      <div className="flex w-32 shrink-0 flex-col justify-between border-r border-border-subtle bg-surface-1 px-2 py-1 text-xs text-text-secondary">
        <div className="flex items-center justify-between">
          <span className="font-mono text-text-primary">{track.name}</span>
          {track.kind !== "captions" ? (
            <button
              type="button"
              onClick={() => {
                if (track.kind === "video") updateTrack({ hidden: !track.hidden });
                else setTrackMuted(track.id, !track.muted);
                if (track.kind !== "video") {
                  void useTimelineStore.getState().saveSnapshot();
                }
              }}
              className="text-text-muted hover:text-text-primary"
              title={track.kind === "video" ? "Hide / show" : "Mute / unmute"}
            >
              {track.kind === "video" ? (
                track.hidden ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )
              ) : track.muted ? (
                <VolumeX size={12} />
              ) : (
                <Volume2 size={12} />
              )}
            </button>
          ) : null}
        </div>
        {track.kind === "audio" ? (
          <div className="flex items-center gap-1">
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={track.volume}
              onChange={(e) => setTrackVolume(track.id, Number(e.target.value))}
              onPointerUp={() => void useTimelineStore.getState().saveSnapshot()}
              className="h-1 flex-1 accent-accent-primary"
              title={`${Math.round(track.volume * 100)}%`}
            />
            <span className="w-7 text-right font-mono text-2xs text-text-muted">
              {Math.round(track.volume * 100)}
            </span>
          </div>
        ) : null}
      </div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          "relative flex-1 overflow-hidden bg-surface-0 transition-colors",
          dropping ? "bg-accent-primary/15 ring-1 ring-inset ring-accent-primary" : "",
        ].join(" ")}
        style={{ width }}
      >
        {clips.map((c) => (
          <Clip key={c.id} clip={c} pxPerSec={pxPerSec} />
        ))}
      </div>
    </div>
  );
}
