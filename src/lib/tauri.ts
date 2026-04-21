import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import type { Project, Theme, Preset } from "@/types";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

export type Provider = "anthropic" | "gemini";

export interface AppPaths {
  dbPath: string;
  projectsDir: string;
  configDir: string;
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

  // Themes
  listThemes: () => invoke<Theme[]>("list_themes"),
  getTheme: (themeId: string) => invoke<Theme>("get_theme", { themeId }),
  saveTheme: (theme: Theme) => invoke<Theme>("save_theme", { theme }),
  deleteTheme: (themeId: string) => invoke<void>("delete_theme", { themeId }),

  // Presets
  listPresets: () => invoke<Preset[]>("list_presets"),
  savePreset: (preset: Preset) => invoke<Preset>("save_preset", { preset }),
  deletePreset: (presetId: string) => invoke<void>("delete_preset", { presetId }),

  // Secrets / API keys — the frontend can only check presence and set/clear.
  // Reading the actual key is intentionally NOT exposed — it stays in Rust.
  hasApiKey: (provider: Provider) => invoke<boolean>("has_api_key", { provider }),
  setApiKey: (provider: Provider, value: string) =>
    invoke<void>("set_api_key", { provider, value }),
  clearApiKey: (provider: Provider) => invoke<void>("clear_api_key", { provider }),
} as const;
