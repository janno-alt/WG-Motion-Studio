import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

export function NumberEmphasis({ item, theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const color = currentColor ?? theme.colors.primary;
  const { value, unit } = extract(item.brief);
  const fontFamily = theme.typography.headlineFont || "Inter";

  switch (v) {
    case "A":
      return (
        <div
          style={{
            fontFamily,
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            color,
          }}
        >
          <span style={{ fontSize: 180, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em" }}>
            {value}
          </span>
          {unit ? <span style={{ fontSize: 70, fontWeight: 700 }}>{unit}</span> : null}
        </div>
      );
    case "B":
      return (
        <div
          style={{
            fontFamily,
            padding: "24px 32px",
            background: color,
            color: theme.colors.background,
            borderRadius: 18,
            display: "flex",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 140, fontWeight: 900, lineHeight: 1 }}>{value}</span>
          {unit ? <span style={{ fontSize: 56, fontWeight: 700 }}>{unit}</span> : null}
        </div>
      );
    case "C":
      // Ghosted giant + sharp foreground.
      return (
        <div style={{ position: "relative", fontFamily, color }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              fontSize: 220,
              fontWeight: 900,
              color: `${color}22`,
              lineHeight: 1,
            }}
          >
            {value}
          </div>
          <div style={{ position: "relative", fontSize: 150, fontWeight: 800, lineHeight: 1 }}>
            {value}
            {unit ? <span style={{ fontSize: 60, marginLeft: 6 }}>{unit}</span> : null}
          </div>
        </div>
      );
    case "D":
    default:
      return (
        <div
          style={{
            fontFamily,
            color: theme.colors.accent,
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            borderLeft: `6px solid ${color}`,
            paddingLeft: 18,
          }}
        >
          <span style={{ fontSize: 160, fontWeight: 800, lineHeight: 1 }}>{value}</span>
          {unit ? <span style={{ fontSize: 64, fontWeight: 700, color }}>{unit}</span> : null}
        </div>
      );
  }
}

function extract(brief: string): { value: string; unit?: string } {
  const match = brief.match(/(\d[\d.,]*)\s*(%|€|\$|mal|jahre?|minuten|sekunden)?/i);
  if (!match) return { value: "42" };
  return { value: match[1]!, unit: match[2] };
}
