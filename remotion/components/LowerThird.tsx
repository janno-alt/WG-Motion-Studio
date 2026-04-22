import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

export function LowerThird({ item, theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const primary = currentColor ?? theme.colors.primary;
  const { primaryText, secondaryText } = extract(item.brief);
  const fontFamily = theme.typography.headlineFont;

  const w = 760;

  switch (v) {
    case "A":
      // Left-aligned — classic broadcast
      return (
        <div
          style={{
            width: w,
            padding: "18px 22px",
            background: theme.colors.background,
            borderLeft: `6px solid ${primary}`,
            fontFamily,
          }}
        >
          <div style={{ fontSize: 38, fontWeight: 700, color: theme.colors.accent }}>
            {primaryText}
          </div>
          {secondaryText ? (
            <div style={{ fontSize: 22, color: primary, marginTop: 4 }}>{secondaryText}</div>
          ) : null}
        </div>
      );
    case "B":
      // Centered
      return (
        <div
          style={{
            width: w,
            padding: "18px 24px",
            background: primary,
            color: theme.colors.background,
            textAlign: "center" as const,
            fontFamily,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700 }}>{primaryText}</div>
          {secondaryText ? (
            <div style={{ fontSize: 20, opacity: 0.85, marginTop: 4 }}>{secondaryText}</div>
          ) : null}
        </div>
      );
    case "C":
      // Dual-line split with separator
      return (
        <div
          style={{
            width: w,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 22px",
            background: theme.colors.background,
            border: `1px solid ${primary}55`,
            fontFamily,
          }}
        >
          <div
            style={{
              width: 4,
              height: 48,
              background: primary,
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: theme.colors.accent }}>
              {primaryText}
            </div>
            {secondaryText ? (
              <div style={{ fontSize: 18, color: primary }}>{secondaryText}</div>
            ) : null}
          </div>
        </div>
      );
    case "D":
    default:
      // Minimal — underline only
      return (
        <div style={{ width: w, padding: "10px 0", fontFamily }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: theme.colors.accent,
              paddingBottom: 6,
              borderBottom: `3px solid ${primary}`,
            }}
          >
            {primaryText}
          </div>
          {secondaryText ? (
            <div style={{ fontSize: 18, color: primary, marginTop: 4 }}>{secondaryText}</div>
          ) : null}
        </div>
      );
  }
}

function extract(brief: string): { primaryText: string; secondaryText?: string } {
  // Split on ";" or "—" if present; otherwise take brief as single line.
  const split = brief.split(/\s*[;—]\s*/, 2);
  return {
    primaryText: (split[0] ?? brief).trim().slice(0, 40) || "Lower third",
    secondaryText: split[1]?.trim().slice(0, 60),
  };
}
