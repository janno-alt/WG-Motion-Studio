import { AbsoluteFill, OffthreadVideo, Sequence } from "remotion";

import type { PlanItem, Preset, Project, Theme } from "@/types";
import { GraphicRenderer } from "../components/GraphicRenderer";

export interface ProjectCompositionProps {
  project: Project;
  theme: Theme;
  presets: Record<string, Preset>;
  /** Optional absolute asset:// URL for a background video reference. */
  videoSrc?: string | null;
  [key: string]: unknown;
}

const DEFAULT_THEME: Theme = {
  id: "__empty",
  name: "Empty",
  colors: { primary: "#C8FF00", secondary: "#141414", accent: "#F0F0F0", background: "#0A0A0A" },
  typography: { headlineFont: "Inter", bodyFont: "Inter" },
  iconStyle: { approach: "angular", strokeWeight: 2, fillStyle: "solid", referenceImages: [] },
  animationPersonality: { speed: 50, springiness: 50, entryStyle: "mixed" },
  preferredPresets: [],
  styleNotes: "",
  createdAt: 0,
  updatedAt: 0,
};

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

export function ProjectComposition({
  project,
  theme,
  presets,
  videoSrc,
}: ProjectCompositionProps) {
  const resolvedTheme = theme ?? DEFAULT_THEME;
  const fps = project.fps ?? 30;

  return (
    <AbsoluteFill style={{ background: resolvedTheme.colors.background }}>
      {videoSrc ? (
        <OffthreadVideo
          src={videoSrc}
          volume={0}
          style={{ position: "absolute", inset: 0, objectFit: "cover", opacity: 0.75 }}
        />
      ) : null}
      {project.planItems.map((item) => (
        <ItemSequence
          key={item.id}
          item={item}
          theme={resolvedTheme}
          presets={presets}
          fps={fps}
        />
      ))}
    </AbsoluteFill>
  );
}

function ItemSequence({
  item,
  theme,
  presets,
  fps,
}: {
  item: PlanItem;
  theme: Theme;
  presets: Record<string, Preset>;
  fps: number;
}) {
  const from = Math.round(item.timestamp * fps);
  const durationInFrames = Math.max(1, Math.round(item.duration * fps));
  return (
    <Sequence from={from} durationInFrames={durationInFrames}>
      <AbsoluteFill>
        <GraphicRenderer item={item} theme={theme} presets={presets} />
      </AbsoluteFill>
    </Sequence>
  );
}
