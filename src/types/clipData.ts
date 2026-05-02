/**
 * Per-graphic-clip data shapes. Stored in `clip.data` JSON. Each shape is
 * keyed by a literal `kind` string for runtime narrowing.
 */

export type TitleAnchor = "top" | "center" | "bottom";

export interface TitleCardData {
  title: string;
  subtitle: string;
  anchor: TitleAnchor;
}

export type LowerThirdAnchor = "left" | "right";

export interface LowerThirdData {
  name: string;
  subtitle: string;
  anchor: LowerThirdAnchor;
}

export interface OutroData {
  headline: string;
  cta: string;
}

export interface LottieData {
  /** Absolute path to a JSON Lottie animation. */
  templatePath: string;
  /** Map of color hex strings to override (raw → replacement). */
  colorOverrides: Record<string, string>;
}

export interface CaptionData {
  text: string;
}

export const DEFAULT_TITLE_CARD: TitleCardData = {
  title: "Headline",
  subtitle: "Subtitle",
  anchor: "center",
};

export const DEFAULT_LOWER_THIRD: LowerThirdData = {
  name: "Speaker name",
  subtitle: "Role / company",
  anchor: "left",
};

export const DEFAULT_OUTRO: OutroData = {
  headline: "Thanks for watching",
  cta: "@yourhandle",
};

export const DEFAULT_LOTTIE: LottieData = {
  templatePath: "",
  colorOverrides: {},
};

export function readClipData<T>(data: Record<string, unknown> | null, fallback: T): T {
  if (!data) return fallback;
  return { ...fallback, ...data } as T;
}
