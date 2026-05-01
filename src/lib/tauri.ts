import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import type { Project, Theme } from "@/types";

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
  // Paths
  getAppPaths: () => invoke<AppPaths>("get_app_paths"),

  // Projects
  listProjects: () => invoke<Project[]>("list_projects"),
  getProject: (projectId: string) => invoke<Project>("get_project", { projectId }),
  createProject: (project: Project) => invoke<Project>("create_project", { project }),
  updateProject: (project: Project) => invoke<Project>("update_project", { project }),
  deleteProject: (projectId: string) => invoke<void>("delete_project", { projectId }),

  // Themes (becomes BrandKits in Wave 2)
  listThemes: () => invoke<Theme[]>("list_themes"),
  getTheme: (themeId: string) => invoke<Theme>("get_theme", { themeId }),
  saveTheme: (theme: Theme) => invoke<Theme>("save_theme", { theme }),
  deleteTheme: (themeId: string) => invoke<void>("delete_theme", { themeId }),

  // Secrets / API keys — presence-check only, keys stay in Rust.
  hasApiKey: (provider: Provider) => invoke<boolean>("has_api_key", { provider }),
  setApiKey: (provider: Provider, value: string) =>
    invoke<void>("set_api_key", { provider, value }),
  clearApiKey: (provider: Provider) => invoke<void>("clear_api_key", { provider }),

  // Filesystem
  ensureProjectDir: (projectId: string) =>
    invoke<string>("ensure_project_dir", { projectId }),
  copySrtIntoProject: (projectId: string, sourcePath: string) =>
    invoke<string>("copy_srt_into_project", { projectId, sourcePath }),
  saveThemeReferenceImage: (themeId: string, sourcePath: string) =>
    invoke<string>("save_theme_reference_image", { themeId, sourcePath }),
  deleteThemeReferenceImage: (path: string) =>
    invoke<void>("delete_theme_reference_image", { path }),
  readFileAsString: (path: string) =>
    invoke<string>("read_file_as_string", { path }),

  // Usage
  getUsageSince: (sinceMs: number) =>
    invoke<UsageSummary>("get_usage_since", { sinceMs }),

  // Reveal in Finder
  revealInFinder: (path: string) => invoke<void>("reveal_in_finder", { path }),

  // Logging
  getLogPath: () => invoke<string | null>("get_log_path"),
  clearLogs: () => invoke<void>("clear_logs"),
  logFromFrontend: (
    level: "info" | "warn" | "error",
    target: string,
    message: string,
  ) => invoke<void>("log_from_frontend", { level, target, message }),
} as const;
