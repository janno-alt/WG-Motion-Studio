import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

export function TextCallout({ item, theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const color = currentColor ?? theme.colors.primary;
  const text = extractText(item.brief);
  const fontFamily = theme.typography.headlineFont || "Inter";
  const common = {
    fontFamily,
    fontWeight: 700 as const,
    fontSize: 72,
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap" as const,
  };

  switch (v) {
    case "A":
      // Pill
      return (
        <div
          style={{
            ...common,
            padding: "16px 28px",
            borderRadius: 999,
            background: color,
            color: theme.colors.background,
          }}
        >
          {text}
        </div>
      );
    case "B":
      // Brackets
      return (
        <div
          style={{
            ...common,
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: theme.colors.accent,
          }}
        >
          <span style={{ color, fontWeight: 500 }}>[</span>
          <span>{text}</span>
          <span style={{ color, fontWeight: 500 }}>]</span>
        </div>
      );
    case "C":
      // Underline swoop
      return (
        <div
          style={{
            ...common,
            color: theme.colors.accent,
            paddingBottom: 6,
            borderBottom: `4px solid ${color}`,
          }}
        >
          {text}
        </div>
      );
    case "D":
    default:
      // Solid background chip
      return (
        <div
          style={{
            ...common,
            padding: "12px 22px",
            borderRadius: 10,
            background: theme.colors.background,
            color,
            border: `2px solid ${color}`,
          }}
        >
          {text}
        </div>
      );
  }
}

/**
 * Very pragmatic extractor: take the brief's first quoted segment, else its
 * leading noun/phrase up to ~28 chars. Production phase-5 will pass an
 * explicit `text` field through the plan-item schema.
 */
function extractText(brief: string): string {
  const quoted = brief.match(/["„»]([^"«»]+)["«»]/);
  if (quoted?.[1]) return quoted[1];
  const comma = brief.split(/[:,—.]/)[0] ?? brief;
  return comma.trim().slice(0, 28);
}
