export interface HookSuggestion {
  text: string;
  rationale: string;
}

export interface AutoHookInput {
  projectId: string;
  captionsJoined: string;
  voiceTone: string | null;
}

export type StockSource = "pexels" | "pixabay" | "both";

export interface StockClip {
  source: "pexels" | "pixabay";
  sourceId: string;
  query: string;
  thumbnailUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  durationSec: number | null;
}

export interface BRollResult {
  query: string;
  clips: StockClip[];
}

export interface AutoBRollInput {
  projectId: string;
  captionText: string;
  source: StockSource;
}

export interface VibeModeInput {
  projectId: string;
  vibe: string;
  currentClipCount: number;
  avgClipDurationSec: number;
}

export type MusicEnergy = "low" | "mid" | "high";
export type ColorSaturation = "subtle" | "normal" | "vivid";

export interface VibeAdjustment {
  cutFrequencyMultiplier: number;
  musicEnergy: MusicEnergy;
  musicVolumeMultiplier: number;
  colorSaturation: ColorSaturation;
  rationale: string;
}

export interface DownloadStockInput {
  projectId: string;
  clip: StockClip;
}
