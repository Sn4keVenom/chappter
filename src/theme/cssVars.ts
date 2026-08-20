// src/theme/cssVars.ts
//
// Bridges the platform-agnostic palette (theme/palette.ts) into CSS custom
// properties. This is the ONLY place a color crosses from TypeScript into the
// stylesheet — every component then reads `var(--color-...)`, so no component
// imports a color value and nothing needs to re-render for a theme change.
//
// That last point is the whole reason to do it this way rather than passing a
// palette object down through context: writing ~50 custom properties on
// <html> repaints the entire app, including any part of the tree React isn't
// re-rendering, in a single style recalculation.

import type { Palette } from "./palette";

/** Palette key → CSS custom property name (without the leading `--`). */
const VAR_NAMES: Record<keyof Palette, string> = {
  scheme: "scheme",

  background: "color-bg",
  surface: "color-surface",
  surfaceAlt: "color-surface-alt",
  surfaceElevated: "color-surface-elevated",
  border: "color-border",
  divider: "color-divider",
  overlay: "color-overlay",
  shadow: "color-shadow",
  skeleton: "color-skeleton",

  textPrimary: "color-text",
  textSecondary: "color-text-secondary",
  textMuted: "color-text-muted",
  link: "color-link",

  primary: "color-primary",
  primaryText: "color-on-primary",
  primaryTint: "color-primary-tint",
  primarySoft: "color-primary-soft",
  primarySoftBorder: "color-primary-soft-border",

  accent: "color-accent",
  accentText: "color-on-accent",
  accentTint: "color-accent-tint",
  accentSoft: "color-accent-soft",
  accentSoftBorder: "color-accent-soft-border",

  headerBackground: "color-header-bg",
  headerText: "color-header-text",
  headerBorder: "color-header-border",
  tabBarBackground: "color-nav-bg",
  tabBarBorder: "color-nav-border",
  tabBarActive: "color-nav-active",
  tabBarInactive: "color-nav-inactive",

  inputBackground: "color-input-bg",
  inputBorder: "color-input-border",
  inputText: "color-input-text",
  inputPlaceholder: "color-input-placeholder",
  keyboardAppearance: "keyboard-appearance",

  success: "color-success",
  successSoft: "color-success-soft",
  warning: "color-warning",
  warningSoft: "color-warning-soft",
  danger: "color-danger",
  dangerSoft: "color-danger-soft",

  categoryBrotherhood: "color-category-brotherhood",
  categoryService: "color-category-service",
  categoryProfessional: "color-category-professional",
  categoryRush: "color-category-rush",
  categoryAdmin: "color-category-admin",
};

/** CSS var reference for a palette key, e.g. cssVar("primary") → "var(--color-primary)". */
export function cssVar(key: keyof Palette): string {
  return `var(--${VAR_NAMES[key]})`;
}

/**
 * Write the palette onto the document root and keep `color-scheme` in step so
 * the browser themes its own widgets — scrollbars, form controls, the caret,
 * and `prefers-color-scheme`-driven UA styles — to match. Without that last
 * bit a dark page still gets a white scrollbar and light-styled date pickers.
 */
export function applyPaletteToDocument(palette: Palette): void {
  const root = document.documentElement;
  for (const [key, name] of Object.entries(VAR_NAMES) as [keyof Palette, string][]) {
    root.style.setProperty(`--${name}`, String(palette[key]));
  }
  root.style.colorScheme = palette.scheme;
  root.dataset.theme = palette.scheme;

  // Match the browser/OS chrome (Safari's toolbar tint, Android's status bar)
  // to the app header rather than leaving it stark white.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", palette.headerBackground);
}
