interface Props {
  tier: 1 | 2 | 3;
  size?: "sm" | "md";
}

const LABEL: Record<1 | 2 | 3, string> = { 1: "H", 2: "S", 3: "I" };

const TIER_BG: Record<1 | 2 | 3, string> = {
  1: "bg-tier-1 text-surface-0",
  2: "bg-tier-2 text-surface-0",
  3: "bg-tier-3 text-surface-0",
};

export function TierBadge({ tier, size = "sm" }: Props) {
  const dims = size === "sm" ? "h-4 w-4 text-2xs" : "h-5 w-5 text-xs";
  return (
    <span
      title={`Tier ${tier}`}
      className={[
        "inline-flex items-center justify-center rounded-full font-mono font-bold",
        TIER_BG[tier],
        dims,
      ].join(" ")}
    >
      {LABEL[tier]}
    </span>
  );
}
