import type { AnimationTracks, BaseState } from "./animation";

export type VideoFormat = "9:16" | "1:1" | "16:9";
export type Fps = 30 | 60;

export type GraphicsDensity = "sparse" | "balanced" | "dense";
export type StyleIntensity = "subtle" | "balanced" | "prominent";

export type Tier1ComponentType =
  | "IconPopIn"
  | "HighlightCircle"
  | "SlideInIllustration"
  | "TextCallout"
  | "NumberEmphasis"
  | "ProgressBar"
  | "LowerThird"
  | "ArrowPointer";

export type PlanItemStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "generating"
  | "generated"
  | "error";

export type ProjectStatus =
  | "draft"
  | "analyzing"
  | "review"
  | "generating"
  | "rendered"
  | "exported";

export type StyleVariant = "A" | "B" | "C" | "D";

export interface ProjectSettings {
  graphicsDensity: GraphicsDensity;
  styleIntensity: StyleIntensity;
  allowedTiers: { tier1: boolean; tier2: boolean; tier3: boolean };
}

export interface PlanItem {
  id: string;
  timestamp: number;
  duration: number;
  tier: 1 | 2 | 3;
  componentType?: Tier1ComponentType;
  brief: string;
  srtContext: string;
  status: PlanItemStatus;
  previewUrl?: string;
  finalAssetUrl?: string;
  baseState: BaseState;
  animation: AnimationTracks;
  styleVariant?: StyleVariant;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  srtPath: string;
  videoPath?: string;
  videoFormat: VideoFormat;
  videoDuration: number;
  fps: Fps;
  settings: ProjectSettings;
  status: ProjectStatus;
  planItems: PlanItem[];
  createdAt: number;
  updatedAt: number;
}
