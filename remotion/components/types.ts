import type { PlanItem, StyleVariant, Theme } from "@/types";

export interface Tier1ComponentProps {
  item: PlanItem;
  theme: Theme;
  /** Live-animated color override; falls back to theme.primary. */
  currentColor?: string | undefined;
  variant?: StyleVariant | undefined;
}

export const DEFAULT_VARIANT: StyleVariant = "A";
