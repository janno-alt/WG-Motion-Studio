import type { Direction8 } from "@/types";
import { DEFAULT_VARIANT, type Tier1ComponentProps } from "./types";

/**
 * Arrow pointing at an adjacent subject. Direction is read from the item's
 * enter-motion instance if it carries one (sensible default for a directional
 * preset); otherwise "right".
 */
export function ArrowPointer({ item, theme, currentColor, variant }: Tier1ComponentProps) {
  const v = variant ?? DEFAULT_VARIANT;
  const color = currentColor ?? theme.colors.primary;
  const direction =
    (item.animation.enter.motion?.direction as Direction8 | undefined) ?? "right";
  const length = lengthFrom(item.brief);

  const angleDeg = directionToAngle(direction);

  const width = length;
  const height = 48;
  const tipSize = v === "B" ? 22 : 16;
  const strokeW = v === "A" ? 3 : v === "B" ? 6 : v === "C" ? 3 : 3;

  const dashArray = v === "D" ? "8 6" : undefined;
  const curved = v === "C";

  return (
    <div
      style={{
        width,
        height,
        transform: `rotate(${angleDeg}deg)`,
        transformOrigin: "50% 50%",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        preserveAspectRatio="none"
      >
        {curved ? (
          <path
            d={`M 4 ${height / 2 + 8} Q ${width / 2} ${height / 2 - 18}, ${width - tipSize} ${height / 2}`}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={dashArray}
            fill="none"
          />
        ) : (
          <line
            x1={4}
            y1={height / 2}
            x2={width - tipSize}
            y2={height / 2}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={dashArray}
          />
        )}
        {/* Tip */}
        <polygon
          points={`${width - tipSize},${height / 2 - tipSize * 0.7} ${width},${height / 2} ${
            width - tipSize
          },${height / 2 + tipSize * 0.7}`}
          fill={color}
        />
      </svg>
    </div>
  );
}

function directionToAngle(direction: Direction8): number {
  const map: Record<Direction8, number> = {
    right: 0,
    downRight: 45,
    down: 90,
    downLeft: 135,
    left: 180,
    upLeft: 225,
    up: 270,
    upRight: 315,
  };
  return map[direction] ?? 0;
}

function lengthFrom(brief: string): number {
  const m = brief.match(/(short|medium|long)/i);
  const pick = m?.[1]?.toLowerCase();
  if (pick === "short") return 140;
  if (pick === "long") return 320;
  return 220;
}
