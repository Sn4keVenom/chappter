// src/theme/ThemeProvider.tsx
//
// Mounts once, at the top of the app. Three jobs:
//
//   1. Push the resolved palette onto <html> as CSS custom properties, so
//      every stylesheet in the app reads `var(--color-...)`.
//   2. Follow the OS appearance setting while mode === "system", via a
//      matchMedia listener.
//   3. Fetch the chapter's branding once we know which chapter the signed-in
//      user belongs to.
//
// Note what this component does NOT do: it doesn't provide colors through
// React context. Because the palette lives in CSS variables, a theme change
// repaints the whole document without re-rendering a single component. The
// hooks below exist only for the handful of places that genuinely need a
// color value in JavaScript (the branding previews, which render candidate
// palettes that aren't the active one).

import { useEffect } from "react";

import { useThemeStore, DARK_QUERY, type ThemeMode } from "./useThemeStore";
import { buildPalette, type ColorScheme, type Palette } from "./palette";
import { useAuthStore } from "../store/useAuthStore";
import type { ChapterBranding } from "../types";

export interface ThemeValue {
  /** The active palette as plain values. Prefer CSS variables in components. */
  colors: Palette;
  scheme: ColorScheme;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  branding: ChapterBranding;
}

/**
 * For components that need palette values in JS rather than CSS — currently
 * only the Appearance and Chapter Branding previews, which draw miniatures of
 * schemes other than the active one.
 */
export function useTheme(): ThemeValue {
  const mode = useThemeStore((s) => s.mode);
  const sys = useThemeStore((s) => s.systemScheme);
  const branding = useThemeStore((s) => s.branding);
  const setMode = useThemeStore((s) => s.setMode);

  const scheme: ColorScheme = mode === "system" ? sys : mode;
  return {
    colors: buildPalette(scheme, branding),
    scheme,
    isDark: scheme === "dark",
    mode,
    setMode,
    branding,
  };
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const init = useThemeStore((s) => s.init);
  const setSystemScheme = useThemeStore((s) => s.setSystemScheme);
  const fetchBranding = useThemeStore((s) => s.fetchBranding);
  const chapterId = useAuthStore((s) => s.user?.chapterId);

  // Paint the stored preference immediately on mount.
  useEffect(() => {
    init();
  }, [init]);

  // Follow the OS setting live. Fires whether or not mode === "system"; the
  // store ignores it unless the resolved scheme actually changes.
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemScheme(e.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [setSystemScheme]);

  // Branding is chapter-scoped, so it can only be fetched once we know which
  // chapter the signed-in user belongs to. Before that the app renders in
  // DEFAULT_BRANDING, which is exactly the stock ChapterHub palette.
  useEffect(() => {
    if (chapterId) fetchBranding(chapterId);
  }, [chapterId, fetchBranding]);

  return <>{children}</>;
}
