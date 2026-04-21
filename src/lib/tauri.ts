import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import type { Project, Theme, Preset } from "@/types";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

/* ------------------------------------------------------------------ */
/*  Commands                                                           */
/* ------------------------------------------------------------------ */

export const commands = {
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

  // Secrets / API keys
  getApiKey: (provider: "anthropic" | "gemini") =>
    invoke<string | null>("get_api_key", { provider }),
  setApiKey: (provider: "anthropic" | "gemini", value: string) =>
    invoke<void>("set_api_key", { provider, value }),
  clearApiKey: (provider: "anthropic" | "gemini") =>
    invoke<void>("clear_api_key", { provider }),

  // Paths / env
  getAppPaths: () => invoke<AppPaths>("get_app_paths"),
} as const;

export interface AppPaths {
  dbPath: string;
  projectsDir: string;
  configDir: string;
}
