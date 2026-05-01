export type ProjectStatus = "draft" | "editing" | "rendered" | "exported";

export type VideoFormat = "9:16" | "16:9" | "1:1";

export interface Project {
  id: string;
  name: string;
  clientId: string;
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
