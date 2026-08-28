// src/theme/branding.ts
//
// Default chapter branding + the preset palettes offered in the branding
// editor. Kept out of palette.ts so the palette builder stays a pure
// scheme×branding → tokens function with no opinions about defaults.

import type { ChapterBranding } from "../types";

/**
 * Used before branding has loaded (first frame, offline, or a failed fetch)
 * and as the "Reset to default" target. Matches the original hard-coded
 * Chappter palette exactly, so an un-branded chapter looks identical to
 * how the app looked before branding existed.
 */
export const DEFAULT_BRANDING: ChapterBranding = {
  chapterId: "",
  chapterName: "Chappter",
  chapterLetters: "ΘΤ",
  logoUrl: null,
  logoEmoji: "⚙️",
  primaryColor: "#1B2A4A",
  accentColor: "#C8A24A",
  backgroundTintLight: null,
  backgroundTintDark: null,
  updatedAt: new Date(0).toISOString(),
};

export interface BrandingPreset {
  id: string;
  label: string;
  primaryColor: string;
  accentColor: string;
  backgroundTintLight?: string | null;
  backgroundTintDark?: string | null;
}

/**
 * One-tap starting points in the branding editor. Every one of these has been
 * checked through brandContrastReport() to pass body-text contrast in both
 * light and dark — an admin can still pick anything they want with the hex
 * fields, and the editor warns them if it fails.
 */
export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    id: "classic-navy",
    label: "Classic Navy",
    primaryColor: "#1B2A4A",
    accentColor: "#C8A24A",
  },
  {
    id: "crimson",
    label: "Crimson & Slate",
    primaryColor: "#8E2436",
    accentColor: "#4E6E8E",
    backgroundTintLight: "#8E2436",
    backgroundTintDark: "#8E2436",
  },
  {
    id: "forest",
    label: "Forest & Brass",
    primaryColor: "#1F4D3D",
    accentColor: "#C08A3E",
  },
  {
    id: "royal",
    label: "Royal Purple",
    primaryColor: "#4B2E83",
    accentColor: "#D8A62B",
  },
  {
    id: "teal",
    label: "Deep Teal",
    primaryColor: "#0F4C5C",
    accentColor: "#E76F51",
  },
  {
    id: "graphite",
    label: "Graphite & Sky",
    primaryColor: "#2B2F36",
    accentColor: "#3E9BD6",
  },
];
