import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

/**
 * A loose hand-drawn-feeling circle drawn around a visual subject. The outer
 * wrapper is sized from the base state; stroke and shape come from the variant.
 */
export function HighlightCircle({ theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const color = currentColor ?? theme.colors.primary;
  const size = 220;

  const common = { width: size, height: size };

  switch (v) {
    case "A":
      // Clean oval, slight offset → looks confident.
      return (
        <svg {...common} viewBox="0 0 220 220">
          <ellipse
            cx="110"
            cy="110"
            rx="96"
            ry="76"
            transform="rotate(-4 110 110)"
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
          />
        </svg>
      );
    case "B":
      // Doubled stroke — stylized.
      return (
        <svg {...common} viewBox="0 0 220 220">
          <ellipse
            cx="110"
            cy="110"
            rx="96"
            ry="76"
            fill="none"
            stroke={color}
            strokeWidth={3}
          />
          <ellipse
            cx="110"
            cy="110"
            rx="102"
            ry="82"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="3 4"
            opacity={0.6}
          />
        </svg>
      );
    case "C":
      // Rough/sketchy — approximated with a dasharray.
      return (
        <svg {...common} viewBox="0 0 220 220">
          <ellipse
            cx="110"
            cy="110"
            rx="98"
            ry="74"
            transform="rotate(5 110 110)"
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeDasharray="12 6 4 8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "D":
    default:
      // Filled translucent background + ring.
      return (
        <svg {...common} viewBox="0 0 220 220">
          <ellipse cx="110" cy="110" rx="96" ry="76" fill={`${color}22`} />
          <ellipse
            cx="110"
            cy="110"
            rx="96"
            ry="76"
            fill="none"
            stroke={color}
            strokeWidth={4}
          />
        </svg>
      );
  }
}
