export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface BrandTypography {
  headlineFont: string;
  bodyFont: string;
}

export type VoiceTone = "casual" | "professional" | "energetic" | "warm";

export interface VoiceProfile {
  tone: VoiceTone;
  notes: string;
}

export interface BrandKit {
  id: string;
  name: string;
  clientName: string | null;
  logoPath: string | null;
  colors: BrandColors;
  typography: BrandTypography;
  voiceProfile: VoiceProfile;
  lottieTemplatePaths: string[];
  musicStyles: string[];
  styleNotes: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_BRAND_COLORS: BrandColors = {
  primary: "#A8E544",
  secondary: "#1A1A1A",
  accent: "#FF7F50",
  background: "#0B0C0F",
};

export const DEFAULT_BRAND_TYPOGRAPHY: BrandTypography = {
  headlineFont: "Inter",
  bodyFont: "Inter",
};

export const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  tone: "professional",
  notes: "",
};

export function defaultBrandKit(id: string, name: string): BrandKit {
  const now = Date.now();
  return {
    id,
    name,
    clientName: null,
    logoPath: null,
    colors: { ...DEFAULT_BRAND_COLORS },
    typography: { ...DEFAULT_BRAND_TYPOGRAPHY },
    voiceProfile: { ...DEFAULT_VOICE_PROFILE },
    lottieTemplatePaths: [],
    musicStyles: [],
    styleNotes: "",
    createdAt: now,
    updatedAt: now,
  };
}
