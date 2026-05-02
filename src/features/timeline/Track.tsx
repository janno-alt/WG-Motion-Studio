import { useCallback } from "react";
import { Eye, EyeOff, Volume2, VolumeX } from "lucide-react";

import type { Clip as ClipModel, Track as TrackModel } from "@/types";
import { Clip } from "./Clip";
import { useTimelineStore } from "@/state/timelineStore";

interface Props {
  track: TrackModel;
  clips: ClipModel[];
  pxPerSec: number;
  width: number;
}

const TRACK_HEIGHT = 56;

export function Track({ track, clips, pxPerSec, width }: Props) {
  const tracks = useTimelineStore((s) => s.tracks);
  const setTrackVolume = useTimelineStore((s) => s.setTrackVolume);
  const setTrackMuted = useTimelineStore((s) => s.setTrackMuted);

  const updateTrack = useCallback(
    (patch: Partial<TrackModel>) => {
      const next = tracks.map((t) => (t.id === track.id ? { ...t, ...patch } : t));
      useTimelineStore.setState({ tracks: next });
      void useTimelineStore.getState().saveSnapshot();
    },
    [track.id, tracks],
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
      <div className="relative flex-1 overflow-hidden bg-surface-0" style={{ width }}>
        {clips.map((c) => (
          <Clip key={c.id} clip={c} pxPerSec={pxPerSec} />
        ))}
      </div>
    </div>
  );
}
