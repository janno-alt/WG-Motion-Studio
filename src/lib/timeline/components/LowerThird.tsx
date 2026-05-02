import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import type { BrandKit, LowerThirdData } from "@/types";
import { DEFAULT_LOWER_THIRD, readClipData } from "@/types";

export function LowerThird({
  data,
  brandKit,
}: {
  data: Record<string, unknown> | null;
  brandKit: BrandKit | null;
}) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const d = readClipData<LowerThirdData>(data, DEFAULT_LOWER_THIRD);
  const colors = brandKit?.colors ?? null;
  const bodyFont = brandKit?.typography.bodyFont ?? "Inter";

  const slideIn = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateRight: "clamp" });
  const offsetPx = (1 - slideIn) * width * (d.anchor === "left" ? -1 : 1);

  const padX = Math.round(width * 0.05);
  const padBottom = "10%";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: d.anchor === "left" ? "flex-start" : "flex-end",
        paddingBottom: padBottom,
        paddingLeft: d.anchor === "left" ? padX : 0,
        paddingRight: d.anchor === "right" ? padX : 0,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: colors?.primary ?? "#A8E544",
          borderRadius: 12,
          padding: "18px 28px",
          color: colors?.background ?? "#0B0C0F",
          transform: `translateX(${offsetPx}px)`,
          fontFamily: `"${bodyFont}", sans-serif`,
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{d.name}</div>
        {d.subtitle ? (
          <div style={{ marginTop: 8, fontSize: 30, fontWeight: 500, opacity: 0.8 }}>
            {d.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
