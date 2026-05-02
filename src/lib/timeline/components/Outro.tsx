import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import type { BrandKit, OutroData } from "@/types";
import { DEFAULT_OUTRO, readClipData } from "@/types";

export function Outro({
  data,
  brandKit,
}: {
  data: Record<string, unknown> | null;
  brandKit: BrandKit | null;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = readClipData<OutroData>(data, DEFAULT_OUTRO);
  const colors = brandKit?.colors ?? null;
  const headlineFont = brandKit?.typography.headlineFont ?? "Inter";
  const bodyFont = brandKit?.typography.bodyFont ?? "Inter";

  const fade = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" });
  const popIn = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const scale = 0.85 + 0.15 * popIn;

  return (
    <AbsoluteFill
      style={{
        background: colors?.background ?? "#0B0C0F",
        justifyContent: "center",
        alignItems: "center",
        opacity: fade,
      }}
    >
      <div
        style={{
          textAlign: "center",
          transform: `scale(${scale})`,
          color: colors?.primary ?? "#A8E544",
          fontFamily: `"${headlineFont}", sans-serif`,
        }}
      >
        <div style={{ fontSize: 110, fontWeight: 700, lineHeight: 1 }}>{d.headline}</div>
        {d.cta ? (
          <div
            style={{
              marginTop: 36,
              fontSize: 52,
              fontWeight: 500,
              color: colors?.accent ?? "#FF7F50",
              fontFamily: `"${bodyFont}", sans-serif`,
            }}
          >
            {d.cta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
