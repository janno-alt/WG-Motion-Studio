import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import type { BrandKit, TitleCardData } from "@/types";
import { DEFAULT_TITLE_CARD, readClipData } from "@/types";

export function TitleCard({
  data,
  brandKit,
}: {
  data: Record<string, unknown> | null;
  brandKit: BrandKit | null;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = readClipData<TitleCardData>(data, DEFAULT_TITLE_CARD);
  const colors = brandKit?.colors ?? null;
  const headlineFont = brandKit?.typography.headlineFont ?? "Inter";
  const bodyFont = brandKit?.typography.bodyFont ?? "Inter";

  const reveal = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateRight: "clamp" });
  const scale = 0.95 + 0.05 * reveal;

  const justifyContent =
    d.anchor === "top" ? "flex-start" : d.anchor === "bottom" ? "flex-end" : "center";

  return (
    <AbsoluteFill
      style={{
        justifyContent,
        alignItems: "center",
        padding: "10%",
        opacity,
        background: colors ? `${colors.background}D0` : "rgba(0,0,0,0.8)",
      }}
    >
      <div
        style={{
          textAlign: "center",
          transform: `scale(${scale})`,
          color: colors?.primary ?? "#FFFFFF",
          fontFamily: `"${headlineFont}", sans-serif`,
        }}
      >
        <div style={{ fontSize: 100, fontWeight: 700, lineHeight: 1.05 }}>{d.title}</div>
        {d.subtitle ? (
          <div
            style={{
              marginTop: 24,
              fontSize: 44,
              fontWeight: 400,
              color: colors?.accent ?? "#FFFFFF",
              fontFamily: `"${bodyFont}", sans-serif`,
            }}
          >
            {d.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
