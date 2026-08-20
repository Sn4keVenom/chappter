// src/theme/palette.ts
//
// The single source of truth for every color in the app. Two inputs, one
// output:
//
//   buildPalette(scheme, branding) → Palette
//
//   · scheme   — "light" | "dark", resolved from the user's personal
//                appearance preference (System/Light/Dark). See useThemeStore.
//   · branding — the CHAPTER's brand config (primary/accent/name/logo), which
//                is deliberately separate from the personal preference: a
//                member picking Dark Mode must not change their chapter's
//                colors for anyone, and an admin re-branding the chapter must
//                not force anyone out of their chosen appearance.
//
// Neutrals (backgrounds, surfaces, borders, text) are hand-picked per scheme
// rather than algorithmically inverted — inverting produces the muddy
// "negative photo" look and destroys the hierarchy between background,
// surface, and border. Brand-derived colors ARE computed, because they have
// to adapt to an arbitrary admin-chosen hex while staying legible.

import type { ChapterBranding } from "../types";
import {
  contrastRatio,
  ensureContrast,
  mix,
  readableTextOn,
  withAlpha,
} from "./contrast";

export type ColorScheme = "light" | "dark";

export interface Palette {
  scheme: ColorScheme;

  // ── Surfaces ───────────────────────────────────────────────────────────
  background: string;
  /** Cards, rows, tab bar, compose bar — one step above `background`. */
  surface: string;
  /** Inset fills: inputs, unselected chips, message list gutters. */
  surfaceAlt: string;
  /** Modals/dialogs, which float above everything else. */
  surfaceElevated: string;
  border: string;
  divider: string;
  /** Scrim behind modals. */
  overlay: string;
  shadow: string;
  /** Placeholder blocks while content loads. */
  skeleton: string;

  // ── Text ───────────────────────────────────────────────────────────────
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Text drawn on top of `background` when it must read as a link/action. */
  link: string;

  // ── Brand ──────────────────────────────────────────────────────────────
  /** Chapter primary — solid fills (buttons, avatars, selected chips). */
  primary: string;
  /** Foreground for anything sitting on `primary`. Auto-contrasted. */
  primaryText: string;
  /** Primary at a legible strength for text/icons ON the background. */
  primaryTint: string;
  /** Faint primary wash for chip/icon backgrounds. */
  primarySoft: string;
  primarySoftBorder: string;

  /** Chapter accent — highlights, active tab, rank badges. */
  accent: string;
  accentText: string;
  accentTint: string;
  accentSoft: string;
  accentSoftBorder: string;

  // ── Navigation chrome ──────────────────────────────────────────────────
  headerBackground: string;
  headerText: string;
  headerBorder: string;
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;

  // ── Inputs ─────────────────────────────────────────────────────────────
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  /** Feed to <TextInput keyboardAppearance> so the iOS keyboard matches. */
  keyboardAppearance: ColorScheme;

  // ── Status ─────────────────────────────────────────────────────────────
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;

  // ── Event categories ───────────────────────────────────────────────────
  categoryBrotherhood: string;
  categoryService: string;
  categoryProfessional: string;
  categoryRush: string;
  categoryAdmin: string;
}

// ── Neutral ramps ─────────────────────────────────────────────────────────
// Dark values are cool-neutral (a trace of blue) rather than pure gray, which
// reads as "deliberate dark theme" instead of "lights off".

const LIGHT_NEUTRALS = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F3F6",
  surfaceElevated: "#FFFFFF",
  border: "#E3E6EA",
  divider: "#ECEFF3",
  overlay: "rgba(9, 12, 18, 0.45)",
  shadow: "#0B1220",
  skeleton: "#E7EAEF",
  textPrimary: "#13181F",
  textSecondary: "#5C6470",
  textMuted: "#8B94A1",
};

const DARK_NEUTRALS = {
  background: "#0E1116",
  surface: "#171C24",
  surfaceAlt: "#1F2530",
  surfaceElevated: "#212833",
  border: "#2C3543",
  divider: "#242C38",
  overlay: "rgba(0, 0, 0, 0.62)",
  shadow: "#000000",
  skeleton: "#232A35",
  textPrimary: "#F1F4F8",
  textSecondary: "#A9B2BF",
  textMuted: "#78828F",
};

// Status hues, tuned per scheme. The dark variants are lifted in lightness so
// they clear 4.5:1 against the dark background — the light-mode greens/reds
// are far too deep to read there.
const STATUS = {
  light: { success: "#1E7F4F", warning: "#B5790A", danger: "#B23A3A" },
  dark: { success: "#3FBE84", warning: "#E0A93A", danger: "#F1706E" },
};

const CATEGORY = {
  light: {
    categoryBrotherhood: "#5B6CC0",
    categoryService: "#2F8F6E",
    categoryProfessional: "#3C4E75",
    categoryRush: "#B98F35",
    categoryAdmin: "#5C6470",
  },
  dark: {
    categoryBrotherhood: "#8B99E0",
    categoryService: "#4FB894",
    categoryProfessional: "#8FA5D6",
    categoryRush: "#D9B460",
    categoryAdmin: "#98A2B0",
  },
};

/**
 * Adapt an admin-chosen brand color into a solid fill for this scheme.
 *
 * In light mode a brand color is used as-is (a chapter's navy should look like
 * their navy). In dark mode the same navy would be nearly indistinguishable
 * from the background, so it's lifted just enough to read as a distinct
 * surface — but no further, so the hue survives.
 */
function adaptFill(brand: string, background: string, scheme: ColorScheme): string {
  if (scheme === "light") {
    // A near-white brand color can't be a button fill — it would vanish
    // against the light background and its label would have nothing to sit on.
    return ensureContrast(brand, background, 1.9);
  }
  // Deliberately a low floor. A filled button only needs to read as a distinct
  // SURFACE against the background — its label's legibility is guaranteed
  // separately by readableTextOn(). Pushing for more here is what turns a
  // chapter's deep navy into a washed-out slate that no longer looks branded.
  return ensureContrast(brand, background, 1.9);
}

export function buildPalette(scheme: ColorScheme, branding: ChapterBranding): Palette {
  const isDark = scheme === "dark";
  const neutrals = isDark ? DARK_NEUTRALS : LIGHT_NEUTRALS;
  const status = isDark ? STATUS.dark : STATUS.light;
  const category = isDark ? CATEGORY.dark : CATEGORY.light;

  // Optional per-chapter background wash. Kept very subtle (8% in light, 12%
  // in dark) — enough to feel branded, never enough to hurt text contrast.
  const tintHex = isDark ? branding.backgroundTintDark : branding.backgroundTintLight;
  const background = tintHex ? mix(neutrals.background, tintHex, isDark ? 0.12 : 0.08) : neutrals.background;
  const surface = tintHex ? mix(neutrals.surface, tintHex, isDark ? 0.09 : 0.05) : neutrals.surface;
  const surfaceAlt = tintHex ? mix(neutrals.surfaceAlt, tintHex, isDark ? 0.09 : 0.05) : neutrals.surfaceAlt;
  const surfaceElevated = tintHex
    ? mix(neutrals.surfaceElevated, tintHex, isDark ? 0.09 : 0.05)
    : neutrals.surfaceElevated;

  const primary = adaptFill(branding.primaryColor, background, scheme);
  const accent = adaptFill(branding.accentColor, background, scheme);

  // Text/icon strengths of the brand colors, guaranteed readable on the
  // background (4.5:1 for the link color, 3:1 for the larger accent
  // treatments like rank badges and active tab labels).
  const primaryTint = ensureContrast(branding.primaryColor, background, 4.5);
  const accentTint = ensureContrast(branding.accentColor, background, 3.2);

  // Header keeps the chapter's color front-and-center in light mode. In dark
  // mode a full-strength brand bar next to a near-black body looks like an
  // unstyled leftover, so the brand is mixed into a dark chrome surface
  // instead — still recognizably the chapter's hue, correct for the theme.
  const headerBackground = isDark ? mix(neutrals.surface, branding.primaryColor, 0.34) : primary;
  const headerText = readableTextOn(headerBackground);

  const tabBarBackground = surface;

  return {
    scheme,

    background,
    surface,
    surfaceAlt,
    surfaceElevated,
    border: neutrals.border,
    divider: neutrals.divider,
    overlay: neutrals.overlay,
    shadow: neutrals.shadow,
    skeleton: neutrals.skeleton,

    textPrimary: neutrals.textPrimary,
    textSecondary: neutrals.textSecondary,
    textMuted: neutrals.textMuted,
    link: primaryTint,

    primary,
    primaryText: readableTextOn(primary),
    primaryTint,
    primarySoft: withAlpha(primaryTint, isDark ? 0.18 : 0.1),
    primarySoftBorder: withAlpha(primaryTint, isDark ? 0.34 : 0.22),

    accent,
    accentText: readableTextOn(accent),
    accentTint,
    accentSoft: withAlpha(accentTint, isDark ? 0.2 : 0.13),
    accentSoftBorder: withAlpha(accentTint, isDark ? 0.38 : 0.3),

    headerBackground,
    headerText,
    headerBorder: isDark ? neutrals.border : withAlpha(headerBackground, 0.001),
    tabBarBackground,
    tabBarBorder: neutrals.border,
    tabBarActive: ensureContrast(branding.accentColor, tabBarBackground, 3.2),
    tabBarInactive: neutrals.textMuted,

    inputBackground: isDark ? neutrals.surfaceAlt : neutrals.background,
    inputBorder: neutrals.border,
    inputText: neutrals.textPrimary,
    inputPlaceholder: neutrals.textMuted,
    keyboardAppearance: scheme,

    success: status.success,
    successSoft: withAlpha(status.success, isDark ? 0.2 : 0.12),
    warning: status.warning,
    warningSoft: withAlpha(status.warning, isDark ? 0.2 : 0.12),
    danger: status.danger,
    dangerSoft: withAlpha(status.danger, isDark ? 0.2 : 0.12),

    ...category,
  };
}

/**
 * How legible a candidate brand color will be, for the live preview in the
 * branding editor. Returns the worst-case body-text ratio across both themes
 * so an admin sees a warning before saving something unreadable.
 */
export function brandContrastReport(branding: ChapterBranding): {
  scheme: ColorScheme;
  primaryOnBackground: number;
  textOnPrimary: number;
  textOnAccent: number;
}[] {
  return (["light", "dark"] as ColorScheme[]).map((scheme) => {
    const p = buildPalette(scheme, branding);
    return {
      scheme,
      primaryOnBackground: contrastRatio(p.primaryTint, p.background),
      textOnPrimary: contrastRatio(p.primaryText, p.primary),
      textOnAccent: contrastRatio(p.accentText, p.accent),
    };
  });
}
