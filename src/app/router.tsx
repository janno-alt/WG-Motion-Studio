import { createMemoryRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { NewProjectScreen } from "@/features/setup/NewProjectScreen";
import { PlanReviewScreen } from "@/features/planReview/PlanReviewScreen";
import { EditorScreen } from "@/features/editor/EditorScreen";
import { GenerationProgressScreen } from "@/features/generation/GenerationProgressScreen";
import { AssetGenerationScreen } from "@/features/generation/AssetGenerationScreen";
import { ExportScreen } from "@/features/export/ExportScreen";
import { ThemesScreen } from "@/features/themes/ThemesScreen";
import { PresetsScreen } from "@/features/presets/PresetsScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";

export const router = createMemoryRouter(
  [
    {
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: "dashboard", element: <DashboardScreen /> },
        { path: "projects/new", element: <NewProjectScreen /> },
        { path: "projects/:id", element: <PlanReviewScreen /> },
        { path: "projects/:id/editor/:itemId", element: <EditorScreen /> },
        { path: "projects/:id/generating", element: <GenerationProgressScreen /> },
        { path: "projects/:id/generating-assets", element: <AssetGenerationScreen /> },
        { path: "projects/:id/export", element: <ExportScreen /> },
        { path: "themes", element: <ThemesScreen /> },
        { path: "themes/:themeId", element: <ThemesScreen /> },
        { path: "presets", element: <PresetsScreen /> },
        { path: "settings", element: <SettingsScreen /> },
      ],
    },
  ],
  { initialEntries: ["/dashboard"] },
);
