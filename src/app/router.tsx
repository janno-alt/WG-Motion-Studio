import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/app/AppLayout";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { SetupScreen } from "@/features/setup/SetupScreen";
import { PlanReviewScreen } from "@/features/planReview/PlanReviewScreen";
import { EditorScreen } from "@/features/editor/EditorScreen";
import { ExportScreen } from "@/features/export/ExportScreen";
import { ThemesScreen } from "@/features/themes/ThemesScreen";
import { PresetsScreen } from "@/features/presets/PresetsScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardScreen /> },
      { path: "projects/new", element: <SetupScreen /> },
      { path: "projects/:projectId/setup", element: <SetupScreen /> },
      { path: "projects/:projectId/review", element: <PlanReviewScreen /> },
      { path: "projects/:projectId/editor/:planItemId?", element: <EditorScreen /> },
      { path: "projects/:projectId/export", element: <ExportScreen /> },
      { path: "themes", element: <ThemesScreen /> },
      { path: "themes/:themeId", element: <ThemesScreen /> },
      { path: "presets", element: <PresetsScreen /> },
      { path: "settings", element: <SettingsScreen /> },
    ],
  },
]);
