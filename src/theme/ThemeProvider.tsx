// src/theme/ThemeProvider.tsx
//
// Mounts once, directly under SafeAreaProvider in App.tsx. Three jobs:
//
//   1. Hydrate the persisted appearance mode before the first real paint, so
//      a user pinned to Dark never sees a white flash on cold start.
//   2. Keep useThemeStore in sync with the OS appearance switch while the app
//      is running (Appearance.addChangeListener).
//   3. Expose useTheme() — the hook every screen calls. Besides handing back
//      the palette, calling it SUBSCRIBES the component to theme changes,
//      which is what makes a Light→Dark switch repaint the tree without
//      remounting the navigation stack (see runtime.ts for the full story).

import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { Appearance, StatusBar, View } from "react-native";
import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavLightTheme,
  type Theme as NavigationTheme,
} from "@react-navigation/native";

import { getActivePalette, getThemeVersion, subscribeToTheme } from "./runtime";
import { useThemeStore, type ThemeMode } from "./useThemeStore";
import { luminance } from "./contrast";
import { useAuthStore } from "../store/useAuthStore";
import type { ColorScheme, Palette } from "./palette";
import type { ChapterBranding } from "../types";

export interface ThemeContextValue {
  colors: Palette;
  scheme: ColorScheme;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  branding: ChapterBranding;
}

/**
 * The hook screens use. Reading the palette through here (rather than the
 * `colors` proxy in theme/colors.ts) also subscribes the calling component to
 * theme changes — a component that only reads the proxy will show stale colors
 * until something else re-renders it.
 */
export function useTheme(): ThemeContextValue {
  // useSyncExternalStore over the runtime version counter: the snapshot is a
  // number, so React can compare it cheaply and skip re-rendering when the
  // theme hasn't actually moved.
  useSyncExternalStore(subscribeToTheme, getThemeVersion, getThemeVersion);

  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const branding = useThemeStore((s) => s.branding);

  const colors = getActivePalette();
  return useMemo(
    () => ({
      colors,
      scheme: colors.scheme,
      isDark: colors.scheme === "dark",
      mode,
      setMode,
      branding,
    }),
    [colors, mode, setMode, branding]
  );
}

/**
 * React Navigation's own theme, so the container background behind/between
 * screens (visible during push/pop transitions and behind a translucent
 * modal) matches instead of flashing white in dark mode.
 */
export function useNavigationTheme(): NavigationTheme {
  const { colors, isDark } = useTheme();
  return useMemo(() => {
    const base = isDark ? NavDarkTheme : NavLightTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: colors.primaryTint,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.accent,
      },
    };
  }, [colors, isDark]);
}

/**
 * Status bar content color, chosen from the luminance of whatever is actually
 * behind it — the branded header on app screens, the plain background on
 * auth/onboarding screens. Derived rather than hard-coded so a chapter that
 * brands itself in a pale color still gets legible clock/battery glyphs.
 */
export function ThemedStatusBar({ behind = "header" }: { behind?: "header" | "background" }) {
  useTheme();
  const colors = getActivePalette();
  const surface = behind === "header" ? colors.headerBackground : colors.background;
  return (
    <StatusBar
      barStyle={luminance(surface) < 0.5 ? "light-content" : "dark-content"}
      backgroundColor={surface}
      animated
    />
  );
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useThemeStore((s) => s.hydrate);
  const hydrated = useThemeStore((s) => s.hydrated);
  const setSystemScheme = useThemeStore((s) => s.setSystemScheme);
  const fetchBranding = useThemeStore((s) => s.fetchBranding);
  const chapterId = useAuthStore((s) => s.user?.chapterId);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Branding is chapter-scoped, so it can only be fetched once we know which
  // chapter the signed-in user belongs to. Runs on sign-in and on any chapter
  // change; before that the app renders in DEFAULT_BRANDING (which is exactly
  // the stock ChapterHub palette, so login/onboarding look unchanged).
  useEffect(() => {
    if (chapterId) fetchBranding(chapterId);
  }, [chapterId, fetchBranding]);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme((colorScheme ?? "light") as ColorScheme);
    });
    return () => sub.remove();
  }, [setSystemScheme]);

  // Reading the version here means the provider itself re-renders on a theme
  // change, which repaints the root fill below.
  useSyncExternalStore(subscribeToTheme, getThemeVersion, getThemeVersion);
  const colors = getActivePalette();

  // Hold the first frame until the persisted mode is known. This is a single
  // SecureStore read (a few ms), and the fill is already the correct color, so
  // there's nothing to see — it just prevents a light→dark flip on launch.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {hydrated ? children : null}
    </View>
  );
}
