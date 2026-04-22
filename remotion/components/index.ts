import type { Tier1ComponentType } from "@/types";
import type { ComponentType } from "react";

import { IconPopIn } from "./IconPopIn";
import { HighlightCircle } from "./HighlightCircle";
import { TextCallout } from "./TextCallout";
import { NumberEmphasis } from "./NumberEmphasis";
import { SlideInIllustration } from "./SlideInIllustration";
import { ProgressBar } from "./ProgressBar";
import { LowerThird } from "./LowerThird";
import { ArrowPointer } from "./ArrowPointer";
import type { Tier1ComponentProps } from "./types";

export const TIER1_COMPONENTS: Record<
  Tier1ComponentType,
  ComponentType<Tier1ComponentProps>
> = {
  IconPopIn,
  HighlightCircle,
  TextCallout,
  NumberEmphasis,
  SlideInIllustration,
  ProgressBar,
  LowerThird,
  ArrowPointer,
};

export {
  IconPopIn,
  HighlightCircle,
  TextCallout,
  NumberEmphasis,
  SlideInIllustration,
  ProgressBar,
  LowerThird,
  ArrowPointer,
};
export type { Tier1ComponentProps } from "./types";
