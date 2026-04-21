import type { Project } from "@/types";

export const EMPTY_PROJECT: Project = {
  id: "empty",
  name: "Empty",
  clientId: "none",
  srtPath: "",
  videoFormat: "9:16",
  videoDuration: 10,
  fps: 30,
  settings: {
    graphicsDensity: "balanced",
    styleIntensity: "balanced",
    allowedTiers: { tier1: true, tier2: true, tier3: true },
  },
  status: "draft",
  planItems: [],
  createdAt: 0,
  updatedAt: 0,
};

export type ProjectCompositionProps = {
  project: Project;
  [key: string]: unknown;
};

export const ProjectComposition: React.FC<ProjectCompositionProps> = () => {
  // Filled in phase 3 — renders all PlanItems with Sequences.
  return <div style={{ width: "100%", height: "100%", background: "transparent" }} />;
};
