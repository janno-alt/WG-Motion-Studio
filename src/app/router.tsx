import { createMemoryRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { TimelineScreen } from "@/features/timeline/TimelineScreen";

export const router = createMemoryRouter(
  [
    {
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: "dashboard", element: <DashboardScreen /> },
        { path: "projects/:id", element: <TimelineScreen /> },
        { path: "projects/:id/timeline", element: <TimelineScreen /> },
        { path: "settings", element: <SettingsScreen /> },
      ],
    },
  ],
  { initialEntries: ["/dashboard"] },
);
