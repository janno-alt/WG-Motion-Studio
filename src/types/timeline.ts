export type TrackKind = "video" | "audio" | "captions";

export type ClipKind =
  | "video"
  | "audio"
  | "image"
  | "caption"
  | "titleCard"
  | "lowerThird"
  | "outro"
  | "lottie";

export interface Track {
  id: string;
  projectId: string;
  kind: TrackKind;
  name: string;
  sortOrder: number;
  muted: boolean;
  hidden: boolean;
  volume: number;
  pan: number;
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string | null;
  kind: ClipKind;
  startSec: number;
  durationSec: number;
  inPointSec: number;
  outPointSec: number;
  data: Record<string, unknown> | null;
  sortOrder: number;
}

export interface Timeline {
  projectId: string;
  tracks: Track[];
  clips: Clip[];
}

export type AssetKind = "video" | "audio" | "image" | "unknown";

export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  name: string;
  path: string;
  thumbnailPath: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  audioChannels: number | null;
  audioSampleRate: number | null;
  sizeBytes: number;
  importedAt: number;
}

export interface RenderPreset {
  id: string;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  videoBitrate: string;
  audioCodec: string;
  audioBitrate: string;
  loudnormLufs: number | null;
}

export const REEL_9_16: RenderPreset = {
  id: "reel-9-16",
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: "h264_videotoolbox",
  videoBitrate: "8M",
  audioCodec: "aac",
  audioBitrate: "192k",
  loudnormLufs: -16,
};

export const YOUTUBE_16_9: RenderPreset = {
  id: "youtube-16-9",
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: "h264_videotoolbox",
  videoBitrate: "12M",
  audioCodec: "aac",
  audioBitrate: "192k",
  loudnormLufs: -14,
};

export const PRORES_MASTER: RenderPreset = {
  id: "prores-master",
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: "prores_videotoolbox",
  videoBitrate: "0",
  audioCodec: "pcm_s16le",
  audioBitrate: "1536k",
  loudnormLufs: null,
};

export const ALL_PRESETS: RenderPreset[] = [REEL_9_16, YOUTUBE_16_9, PRORES_MASTER];

export interface RenderRow {
  id: string;
  projectId: string;
  preset: string;
  outputPath: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
}

export type RenderQueueEvent =
  | { stage: "queued"; renderId: string }
  | { stage: "started"; renderId: string }
  | { stage: "progress"; renderId: string; frame: number; totalFrames: number | null }
  | { stage: "done"; renderId: string; outputPath: string }
  | { stage: "failed"; renderId: string; message: string }
  | { stage: "cancelled"; renderId: string };

export interface SilenceRange {
  startSec: number;
  endSec: number;
}

export interface SilenceParams {
  thresholdDb: number;
  minDurationSec: number;
}

export const DEFAULT_SILENCE_PARAMS: SilenceParams = {
  thresholdDb: -30,
  minDurationSec: 1.0,
};

export interface RenderBrandKit {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  headlineFont: string;
  bodyFont: string;
}

export interface RenderRequest {
  renderId: string;
  projectId: string;
  timeline: Timeline;
  assets: Asset[];
  preset: RenderPreset;
  outputPath: string;
  brandKit: RenderBrandKit | null;
}

export type RenderProgressEvent =
  | { stage: "starting"; renderId: string }
  | { stage: "encoding"; renderId: string; frame: number; totalFrames: number | null; fps: number | null }
  | { stage: "done"; renderId: string; outputPath: string }
  | { stage: "error"; renderId: string; message: string };

export type WhisperModel = "medium" | "largeV3";

export interface WhisperModelStatus {
  model: WhisperModel;
  installed: boolean;
  path: string;
  sizeBytes: number;
}

export interface CaptionSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export type WhisperProgressEvent =
  | { stage: "extracting" }
  | { stage: "transcribing"; percent: number | null }
  | { stage: "parsing" }
  | { stage: "done"; segments: number }
  | { stage: "error"; message: string };

export type DownloadProgressEvent =
  | { stage: "started"; total: number | null }
  | { stage: "progress"; downloaded: number; total: number | null }
  | { stage: "done"; path: string }
  | { stage: "error"; message: string };
