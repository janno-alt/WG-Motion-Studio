import type { Tier1ComponentType } from "@/types";
import type { ComponentType } from "react";

import { IconPopIn } from "./IconPopIn";
import { HighlightCircle } from "./HighlightCircle";
import { TextCallout } from "./TextCallout";
import { NumberEmphasis } from "./NumberEmphasis";
import type { Tier1ComponentProps } from "./types";

/**
 * Phase-3 base set. Remaining components (SlideInIllustration, ProgressBar,
 * LowerThird, ArrowPointer) land in phase 5.
 */
export const TIER1_COMPONENTS: Partial<
  Record<Tier1ComponentType, ComponentType<Tier1ComponentProps>>
> = {
  IconPopIn,
  HighlightCircle,
  TextCallout,
  NumberEmphasis,
};

export { IconPopIn, HighlightCircle, TextCallout, NumberEmphasis };
export type { Tier1ComponentProps } from "./types";
