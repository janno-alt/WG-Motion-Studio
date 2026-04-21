import { Img, useCurrentFrame, useVideoConfig } from "remotion";

import type { PlanItem, Preset, Theme } from "@/types";

import { composeForPlanItem } from "../presets/engine";
import { TIER1_COMPONENTS } from "./index";
import { SvgAssetRenderer } from "./SvgAssetRenderer";

interface Props {
  item: PlanItem;
  theme: Theme;
  presets: Record<string, Preset>;
}

/**
 * Tier-dispatching renderer for a single plan item. Owns the transform /
 * opacity / clip-path wrappers computed by the preset engine.
 */
export function GraphicRenderer({ item, theme, presets }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const state = composeForPlanItem(item, presets, frame, fps);

  const { position, rotation, scale, opacity, color, clipPath } = state;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        transform: `translate(${position.x}px, ${position.y}px)`,
        opacity,
        clipPath,
      }}
    >
      <div
        style={{
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale.x}, ${scale.y})`,
          transformOrigin: `${item.baseState.anchorPoint.x * 100}% ${item.baseState.anchorPoint.y * 100}%`,
          display: "inline-block",
        }}
      >
        <TierContent item={item} theme={theme} color={color} />
      </div>
    </div>
  );
}

function TierContent({
  item,
  theme,
  color,
}: {
  item: PlanItem;
  theme: Theme;
  color: string | undefined;
}) {
  if (item.tier === 1) {
    const Component = item.componentType ? TIER1_COMPONENTS[item.componentType] : undefined;
    if (!Component) {
      return <Placeholder tier={1} label={item.componentType ?? "Tier 1"} />;
    }
    return (
      <Component item={item} theme={theme} currentColor={color} variant={item.styleVariant} />
    );
  }
  if (item.tier === 2) {
    return <SvgAssetRenderer src={item.finalAssetUrl ?? item.previewUrl} currentColor={color} />;
  }
  // Tier 3 — raster image.
  const src = item.finalAssetUrl ?? item.previewUrl;
  if (!src) return <Placeholder tier={3} label="Tier 3" />;
  return <Img src={src} style={{ maxWidth: 480, maxHeight: 480 }} />;
}

function Placeholder({ tier, label }: { tier: 1 | 2 | 3; label: string }) {
  const color = tier === 1 ? "#3FC27D" : tier === 2 ? "#F5A623" : "#C8FF00";
  return (
    <div
      style={{
        width: 260,
        height: 180,
        borderRadius: 12,
        background: "rgba(20,20,20,0.85)",
        border: `2px dashed ${color}`,
        color: "#F0F0F0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ color, fontWeight: 700, fontSize: 14 }}>Tier {tier}</div>
      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{label}</div>
    </div>
  );
}
