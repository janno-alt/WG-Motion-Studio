import { AbsoluteFill } from "remotion";

import type { PlanItem, Preset, Theme } from "@/types";

import { GraphicRenderer } from "../components/GraphicRenderer";

export interface SingleGraphicCompositionProps {
  item: PlanItem;
  theme: Theme;
  presets: Record<string, Preset>;
  [key: string]: unknown;
}

const PLACEHOLDER_THEME: Theme = {
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

export const PLACEHOLDER_ITEM: PlanItem = {
  id: "placeholder",
  timestamp: 0,
  duration: 2,
  tier: 1,
  componentType: "IconPopIn",
  brief: "Placeholder",
  srtContext: "",
  status: "proposed",
  baseState: {
    position: { x: 540, y: 960 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    opacity: 1,
    anchorPoint: { x: 0.5, y: 0.5 },
  },
  animation: {
    enter: { motion: null, mask: null },
    idle: { motion: [], mask: null },
    exit: { motion: null, mask: null },
  },
};

/**
 * Composition used by the editor's player — renders one graphic on a
 * theme-colored background, starting at frame 0 for its `duration`.
 */
export function SingleGraphicComposition({ item, theme, presets }: SingleGraphicCompositionProps) {
  const resolved = theme ?? PLACEHOLDER_THEME;
  return (
    <AbsoluteFill style={{ background: resolved.colors.background }}>
      <GraphicRenderer item={item} theme={resolved} presets={presets} />
    </AbsoluteFill>
  );
}
