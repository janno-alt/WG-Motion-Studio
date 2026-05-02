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
      <div className="flex w-24 shrink-0 items-center justify-between border-r border-border-subtle bg-surface-1 px-2 text-xs text-text-secondary">
        <span className="font-mono text-text-primary">{track.name}</span>
        <div className="flex items-center gap-1">
          {track.kind !== "captions" ? (
            <button
              onClick={() =>
                updateTrack(track.kind === "video" ? { hidden: !track.hidden } : { muted: !track.muted })
              }
              className="text-text-muted hover:text-text-primary"
              title={track.kind === "video" ? "Hide / show" : "Mute / unmute"}
              type="button"
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
      </div>
      <div className="relative flex-1 overflow-hidden bg-surface-0" style={{ width }}>
        {clips.map((c) => (
          <Clip key={c.id} clip={c} pxPerSec={pxPerSec} />
        ))}
      </div>
    </div>
  );
}
