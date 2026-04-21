import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

type IconName = "check" | "alert" | "star" | "arrow";

/**
 * A solid-glyph badge. Style variants change the surround: A=filled disc,
 * B=outlined disc, C=rounded-square, D=chip with background halo.
 */
export function IconPopIn({ item, theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const color = currentColor ?? theme.colors.primary;
  const iconName = extractIconName(item.brief);
  const size = 120;

  switch (v) {
    case "A":
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.colors.background,
          }}
        >
          <Glyph name={iconName} size={size * 0.55} stroke={theme.colors.background} />
        </div>
      );
    case "B":
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            border: `3px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Glyph name={iconName} size={size * 0.55} stroke={color} />
        </div>
      );
    case "C":
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: 18,
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.colors.background,
          }}
        >
          <Glyph name={iconName} size={size * 0.6} stroke={theme.colors.background} />
        </div>
      );
    case "D":
    default:
      return (
        <div
          style={{
            width: size * 1.15,
            height: size * 1.15,
            borderRadius: "50%",
            background: `${color}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name={iconName} size={size * 0.55} stroke={theme.colors.background} />
          </div>
        </div>
      );
  }
}

function extractIconName(brief: string): IconName {
  const hay = brief.toLowerCase();
  if (/(warn|alert|vorsicht|achtung|danger|brand|feuer)/.test(hay)) return "alert";
  if (/(star|stern|bewert|highlight)/.test(hay)) return "star";
  if (/(pfeil|arrow|->|direction|zeig)/.test(hay)) return "arrow";
  return "check";
}

function Glyph({ name, size, stroke }: { name: IconName; size: number; stroke: string }) {
  const s = size;
  const sw = Math.max(2, size * 0.08);
  switch (name) {
    case "check":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l4.5 4.5L19 7"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "alert":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <circle cx="12" cy="19" r={sw / 2} fill={stroke} />
        </svg>
      );
    case "star":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill={stroke}>
          <path d="M12 2l2.95 6.28 6.55.7-4.75 4.66 1.25 6.86L12 17.28 5.5 20.5l1.25-6.86L2 8.98l6.55-.7L12 2z" />
        </svg>
      );
    case "arrow":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12h14M13 6l6 6-6 6"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}
