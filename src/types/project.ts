export type ProjectStatus = "draft" | "editing" | "rendered" | "exported";

export type VideoFormat = "9:16" | "16:9" | "1:1";

export interface Project {
  id: string;
  name: string;
  /** Optional reference to brand_kits.id; null when the project uses defaults. */
  clientId: string | null;
  srtPath: string;
  videoPath?: string | null;
  videoFormat: VideoFormat;
  videoDuration: number;
  fps: number;
  settings: Record<string, unknown>;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
}
