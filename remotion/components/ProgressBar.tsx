import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

export function ProgressBar({ item, theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const primary = currentColor ?? theme.colors.primary;
  const { value, label } = extract(item.brief);

  const width = 520;
  const height = 28;

  switch (v) {
    case "A":
      // Rounded bar
      return (
        <div style={{ width, fontFamily: theme.typography.bodyFont }}>
          {label ? (
            <div style={{ marginBottom: 6, fontSize: 14, color: theme.colors.accent }}>
              {label}
            </div>
          ) : null}
          <div
            style={{
              width: "100%",
              height,
              borderRadius: 999,
              background: `${primary}22`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${value}%`,
                height: "100%",
                background: primary,
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      );
    case "B":
      // Squared
      return (
        <div style={{ width, fontFamily: theme.typography.bodyFont }}>
          {label ? (
            <div style={{ marginBottom: 6, fontSize: 14, color: theme.colors.accent }}>
              {label}
            </div>
          ) : null}
          <div style={{ width: "100%", height, background: `${primary}22` }}>
            <div style={{ width: `${value}%`, height: "100%", background: primary }} />
          </div>
        </div>
      );
    case "C": {
      // Segmented — 10 cells
      const cells = 10;
      const filled = Math.round((value / 100) * cells);
      return (
        <div style={{ width, fontFamily: theme.typography.bodyFont }}>
          {label ? (
            <div style={{ marginBottom: 6, fontSize: 14, color: theme.colors.accent }}>
              {label}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: cells }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height,
                  borderRadius: 4,
                  background: i < filled ? primary : `${primary}22`,
                }}
              />
            ))}
          </div>
        </div>
      );
    }
    case "D":
    default:
      // Gradient-filled
      return (
        <div style={{ width, fontFamily: theme.typography.bodyFont }}>
          {label ? (
            <div style={{ marginBottom: 6, fontSize: 14, color: theme.colors.accent }}>
              {label}
            </div>
          ) : null}
          <div
            style={{
              width: "100%",
              height,
              borderRadius: 999,
              background: `${primary}22`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${value}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${primary}, ${theme.colors.accent})`,
              }}
            />
          </div>
          <div style={{ marginTop: 4, textAlign: "right", fontSize: 12, color: primary }}>
            {value}%
          </div>
        </div>
      );
  }
}

function extract(brief: string): { value: number; label?: string } {
  const match = brief.match(/(\d+)\s*%/);
  const value = match?.[1] ? Math.min(100, Math.max(0, Number(match[1]))) : 60;
  const label = brief.split(/[—:,.]/)[0]?.trim().slice(0, 40);
  return { value, label };
}
