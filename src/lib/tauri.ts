import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

export interface UsageSummary {
  totalCostUsd: number;
  anthropicCostUsd: number;
  geminiCostUsd: number;
  since: number;
}

export interface PlanProgress {
  stage: "loading" | "calling" | "parsing" | "persisting" | "done";
  message: string;
}

export interface GeneratePlanResult {
  itemCount: number;
  droppedCount: number;
  costUsd: number;
  project: Project;
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

  // Usage
  getUsageSince: (sinceMs: number) =>
    invoke<UsageSummary>("get_usage_since", { sinceMs }),

  // Plan generation
  generatePlan: (projectId: string, planningPrompt: string) =>
    invoke<GeneratePlanResult>("generate_plan", { projectId, planningPrompt }),
} as const;

/** Subscribes to plan progress events. Returns an unlisten function. */
export async function onPlanProgress(
  handler: (p: PlanProgress) => void,
): Promise<() => void> {
  const un = await listen<PlanProgress>("plan:progress", (e) => handler(e.payload));
  return un;
}
