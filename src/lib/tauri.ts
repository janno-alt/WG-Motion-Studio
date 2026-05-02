import { invoke as tauriInvoke, Channel } from "@tauri-apps/api/core";

import type {
  Asset,
  BrandKit,
  CaptionSegment,
  DownloadProgressEvent,
  Project,
  RenderProgressEvent,
  RenderRequest,
  Timeline,
  Track,
  WhisperModel,
  WhisperModelStatus,
  WhisperProgressEvent,
} from "@/types";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

export type Provider = "gemini";

export interface AppPaths {
  dbPath: string;
  projectsDir: string;
  configDir: string;
}

export interface UsageSummary {
  totalCostUsd: number;
  geminiCostUsd: number;
  since: number;
}

export const commands = {
  getAppPaths: () => invoke<AppPaths>("get_app_paths"),

  // Projects
  listProjects: () => invoke<Project[]>("list_projects"),
  getProject: (projectId: string) => invoke<Project>("get_project", { projectId }),
  createProject: (project: Project) => invoke<Project>("create_project", { project }),
  updateProject: (project: Project) => invoke<Project>("update_project", { project }),
  deleteProject: (projectId: string) => invoke<void>("delete_project", { projectId }),

  // BrandKits (renamed from Themes in Wave 2)
  listBrandKits: () => invoke<BrandKit[]>("list_brand_kits"),
  getBrandKit: (brandKitId: string) =>
    invoke<BrandKit>("get_brand_kit", { brandKitId }),
  saveBrandKit: (brandKit: BrandKit) =>
    invoke<BrandKit>("save_brand_kit", { brandKit }),
  deleteBrandKit: (brandKitId: string) =>
    invoke<void>("delete_brand_kit", { brandKitId }),
  saveBrandKitLogo: (brandKitId: string, sourcePath: string) =>
    invoke<string>("save_brand_kit_logo", { brandKitId, sourcePath }),
  saveBrandKitReference: (brandKitId: string, sourcePath: string) =>
    invoke<string>("save_brand_kit_reference", { brandKitId, sourcePath }),
  deleteBrandKitAsset: (path: string) =>
    invoke<void>("delete_brand_kit_asset", { path }),

  // Secrets
  hasApiKey: (provider: Provider) => invoke<boolean>("has_api_key", { provider }),
  setApiKey: (provider: Provider, value: string) =>
    invoke<void>("set_api_key", { provider, value }),
  clearApiKey: (provider: Provider) => invoke<void>("clear_api_key", { provider }),

  // Filesystem / projects scaffolding
  ensureProjectDir: (projectId: string) =>
    invoke<string>("ensure_project_dir", { projectId }),
  copySrtIntoProject: (projectId: string, sourcePath: string) =>
    invoke<string>("copy_srt_into_project", { projectId, sourcePath }),
  readFileAsString: (path: string) => invoke<string>("read_file_as_string", { path }),

  // Usage
  getUsageSince: (sinceMs: number) =>
    invoke<UsageSummary>("get_usage_since", { sinceMs }),

  // Reveal
  revealInFinder: (path: string) => invoke<void>("reveal_in_finder", { path }),

  // Logging
  getLogPath: () => invoke<string | null>("get_log_path"),
  clearLogs: () => invoke<void>("clear_logs"),
  logFromFrontend: (
    level: "info" | "warn" | "error",
    target: string,
    message: string,
  ) => invoke<void>("log_from_frontend", { level, target, message }),

  // Assets
  importAsset: (projectId: string, sourcePath: string) =>
    invoke<Asset>("import_asset", { projectId, sourcePath }),
  listAssets: (projectId: string) =>
    invoke<Asset[]>("list_assets", { projectId }),
  getAsset: (assetId: string) => invoke<Asset>("get_asset", { assetId }),
  deleteAsset: (assetId: string) => invoke<void>("delete_asset", { assetId }),
  listAssetTags: (assetId: string) =>
    invoke<string[]>("list_asset_tags", { assetId }),
  setAssetTags: (assetId: string, tags: string[]) =>
    invoke<string[]>("set_asset_tags", { assetId, tags }),
  searchAssets: (projectId: string, query: string) =>
    invoke<{ asset: Asset; tags: string[] }[]>("search_assets", { projectId, query }),

  // Timeline
  loadTimeline: (projectId: string) =>
    invoke<Timeline>("load_timeline", { projectId }),
  saveTimeline: (timeline: Timeline) =>
    invoke<Timeline>("save_timeline", { timeline }),
  createDefaultTracks: (projectId: string) =>
    invoke<Track[]>("create_default_tracks", { projectId }),

  // Render — uses Channel<T> for progress streaming
  renderTimeline: (
    request: RenderRequest,
    onProgress: (e: RenderProgressEvent) => void,
  ) => {
    const progress = new Channel<RenderProgressEvent>();
    progress.onmessage = onProgress;
    return invoke<string>("render_timeline", { request, progress });
  },

  // Whisper
  whisperModelStatus: (model: WhisperModel) =>
    invoke<WhisperModelStatus>("whisper_model_status", { model }),
  whisperDownloadModel: (
    model: WhisperModel,
    onProgress: (e: DownloadProgressEvent) => void,
  ) => {
    const progress = new Channel<DownloadProgressEvent>();
    progress.onmessage = onProgress;
    return invoke<string>("whisper_download_model", { model, progress });
  },
  whisperTranscribe: (
    sourcePath: string,
    model: WhisperModel,
    language: string | null,
    onProgress: (e: WhisperProgressEvent) => void,
  ) => {
    const progress = new Channel<WhisperProgressEvent>();
    progress.onmessage = onProgress;
    return invoke<CaptionSegment[]>("whisper_transcribe", {
      sourcePath,
      model,
      language,
      progress,
    });
  },
} as const;
