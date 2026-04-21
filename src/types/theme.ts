export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface ThemeTypography {
  headlineFont: string;
  bodyFont: string;
}

export type IconApproach = "angular" | "rounded" | "organic";
export type IconFillStyle = "solid" | "outline" | "duotone";

export interface ThemeIconStyle {
  approach: IconApproach;
  strokeWeight: number;
  fillStyle: IconFillStyle;
  referenceImages: string[];
}

export type EntryStyle = "fade" | "slide" | "pop" | "mixed";

export interface AnimationPersonality {
  speed: number;
  springiness: number;
  entryStyle: EntryStyle;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  iconStyle: ThemeIconStyle;
  animationPersonality: AnimationPersonality;
  preferredPresets: string[];
  styleNotes: string;
  createdAt: number;
  updatedAt: number;
}
