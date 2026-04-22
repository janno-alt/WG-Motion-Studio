import { SvgAssetRenderer } from "./SvgAssetRenderer";
import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

/**
 * Container for a larger illustration. If the plan item has a finalAssetUrl
 * or previewUrl pointing at an SVG, we render that inline; otherwise we fall
 * back to an ornamental frame that communicates the intent at phase-1
 * fidelity.
 */
export function SlideInIllustration({ item, theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const primary = currentColor ?? theme.colors.primary;
  const asset = item.finalAssetUrl ?? item.previewUrl;
  const w = 360;
  const h = 360;

  const inner = asset ? (
    <SvgAssetRenderer src={asset} currentColor={primary} />
  ) : (
    <div
      style={{
        width: w * 0.72,
        height: h * 0.72,
        borderRadius: 12,
        background: `${primary}33`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: primary,
        fontFamily: theme.typography.headlineFont,
        fontSize: 13,
        letterSpacing: "0.02em",
      }}
    >
      Illustration
    </div>
  );

  switch (v) {
    case "A":
      // Framed — thick primary border
      return (
        <div
          style={{
            width: w,
            height: h,
            padding: 12,
            borderRadius: 14,
            background: theme.colors.background,
            border: `3px solid ${primary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {inner}
        </div>
      );
    case "B":
      // Borderless — just the subject
      return (
        <div style={{ width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {inner}
        </div>
      );
    case "C":
      // Shadow-box — translucent backdrop behind subject
      return (
        <div
          style={{
            width: w,
            height: h,
            padding: 16,
            borderRadius: 16,
            background: `${primary}15`,
            boxShadow: `0 18px 48px ${primary}25`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {inner}
        </div>
      );
    case "D":
    default:
      // Cutout — ring + inner disk
      return (
        <div
          style={{
            width: w,
            height: h,
            padding: 18,
            borderRadius: "50%",
            background: primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: theme.colors.background,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {inner}
          </div>
        </div>
      );
  }
}
