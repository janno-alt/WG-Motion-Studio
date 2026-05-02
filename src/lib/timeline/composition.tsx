import { convertFileSrc } from "@tauri-apps/api/core";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
} from "remotion";

import type { Asset, BrandKit, Clip, Timeline, Track } from "@/types";
import { LottieClip } from "./components/LottieClip";
import { LowerThird } from "./components/LowerThird";
import { Outro } from "./components/Outro";
import { TitleCard } from "./components/TitleCard";

interface Props {
  timeline: Timeline;
  assets: Asset[];
  brandKit: BrandKit | null;
  fps: number;
  width: number;
  height: number;
}

export function TimelineComposition({ timeline, assets, brandKit }: Props) {
  const assetById = new Map(assets.map((a) => [a.id, a] as const));
  const videoTracks = sortBy(
    timeline.tracks.filter((t) => t.kind === "video" && !t.hidden),
    (t) => t.sortOrder,
  );
  const audioTracks = timeline.tracks.filter((t) => t.kind === "audio" && !t.muted);
  const captionsTrack = timeline.tracks.find((t) => t.kind === "captions");
  const captionClips = captionsTrack
    ? timeline.clips.filter((c) => c.trackId === captionsTrack.id)
    : [];

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {videoTracks.map((track) => (
        <VideoLayer
          key={track.id}
          track={track}
          clips={timeline.clips.filter((c) => c.trackId === track.id)}
          assetById={assetById}
          brandKit={brandKit}
        />
      ))}
      {audioTracks.map((track) => (
        <AudioLayer
          key={track.id}
          track={track}
          clips={timeline.clips.filter((c) => c.trackId === track.id)}
          assetById={assetById}
        />
      ))}
      <CaptionsLayer clips={captionClips} />
    </AbsoluteFill>
  );
}

function VideoLayer({
  clips,
  assetById,
  brandKit,
}: {
  track: Track;
  clips: Clip[];
  assetById: Map<string, Asset>;
  brandKit: BrandKit | null;
}) {
  return (
    <>
      {clips.map((clip) => {
        const fps = 30;
        const from = Math.round(clip.startSec * fps);
        const dur = Math.max(1, Math.round(clip.durationSec * fps));
        const startFrom = Math.round(clip.inPointSec * fps);

        if (clip.kind === "video" || clip.kind === "image") {
          if (clip.assetId == null) return null;
          const asset = assetById.get(clip.assetId);
          if (!asset) return null;
          const src = convertFileSrc(asset.path);
          return (
            <Sequence key={clip.id} from={from} durationInFrames={dur}>
              {clip.kind === "video" ? (
                <OffthreadVideo src={src} startFrom={startFrom} muted />
              ) : (
                <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              )}
            </Sequence>
          );
        }

        if (clip.kind === "titleCard") {
          return (
            <Sequence key={clip.id} from={from} durationInFrames={dur}>
              <TitleCard data={clip.data} brandKit={brandKit} />
            </Sequence>
          );
        }
        if (clip.kind === "lowerThird") {
          return (
            <Sequence key={clip.id} from={from} durationInFrames={dur}>
              <LowerThird data={clip.data} brandKit={brandKit} />
            </Sequence>
          );
        }
        if (clip.kind === "outro") {
          return (
            <Sequence key={clip.id} from={from} durationInFrames={dur}>
              <Outro data={clip.data} brandKit={brandKit} />
            </Sequence>
          );
        }
        if (clip.kind === "lottie") {
          return (
            <Sequence key={clip.id} from={from} durationInFrames={dur}>
              <LottieClip data={clip.data} />
            </Sequence>
          );
        }
        return null;
      })}
    </>
  );
}

function AudioLayer({
  track,
  clips,
  assetById,
}: {
  track: Track;
  clips: Clip[];
  assetById: Map<string, Asset>;
}) {
  return (
    <>
      {clips.map((clip) => {
        if (clip.assetId == null || clip.kind !== "audio") return null;
        const asset = assetById.get(clip.assetId);
        if (!asset) return null;
        const fps = 30;
        const from = Math.round(clip.startSec * fps);
        const dur = Math.max(1, Math.round(clip.durationSec * fps));
        const startFrom = Math.round(clip.inPointSec * fps);
        return (
          <Sequence key={clip.id} from={from} durationInFrames={dur}>
            <Audio src={convertFileSrc(asset.path)} startFrom={startFrom} volume={track.volume} />
          </Sequence>
        );
      })}
    </>
  );
}

function CaptionsLayer({ clips }: { clips: Clip[] }) {
  return (
    <>
      {clips.map((clip) => {
        const text =
          (clip.data && typeof clip.data["text"] === "string"
            ? (clip.data["text"] as string)
            : "") ?? "";
        if (!text) return null;
        const fps = 30;
        const from = Math.round(clip.startSec * fps);
        const dur = Math.max(1, Math.round(clip.durationSec * fps));
        return (
          <Sequence key={clip.id} from={from} durationInFrames={dur}>
            <AbsoluteFill
              style={{
                justifyContent: "flex-end",
                alignItems: "center",
                paddingBottom: "8%",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: "white",
                  textShadow: "0 0 8px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.75)",
                  textAlign: "center",
                  maxWidth: "85%",
                  lineHeight: 1.1,
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
}

function sortBy<T>(arr: T[], key: (x: T) => number): T[] {
  return [...arr].sort((a, b) => key(a) - key(b));
}

export function timelineDurationFrames(timeline: Timeline, fps: number): number {
  let max = 0;
  for (const c of timeline.clips) {
    const end = c.startSec + c.durationSec;
    if (end > max) max = end;
  }
  return Math.max(1, Math.round(max * fps));
}
