// src/theme/useThemeStore.ts
//
// The one writer of theme state. Combines the two independent inputs the
// palette needs:
//
//   · appearance mode — PERSONAL and device-local ("system" | "light" |
//     "dark"), saved with expo-secure-store so it survives relaunch. Never
//     sent to the server: one member preferring Dark must not change what
//     anyone else sees.
//   · chapter branding — CHAPTER-WIDE and server-owned, fetched through
//     api/branding.ts (mocked in Demo Mode) and editable by admins with
//     settings.manage.
//
// Every write ends in applyTheme(), which pushes the resolved palette into
// runtime.ts and notifies subscribers. Nothing else in the app calls
// setActiveTheme directly.

import { create } from "zustand";
import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { ChapterBranding } from "../types";
import {
  getChapterBranding,
  resetChapterBranding,
  updateChapterBranding,
  type ChapterBrandingUpdate,
} from "../api/branding";
import { DEFAULT_BRANDING } from "./branding";
import { setActiveTheme } from "./runtime";
import type { ColorScheme } from "./palette";

export type ThemeMode = "system" | "light" | "dark";

const MODE_STORAGE_KEY = "chapterhub.appearanceMode";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

interface ThemeState {
  mode: ThemeMode;
  /** Whatever the OS currently reports — only used when mode === "system". */
  systemScheme: ColorScheme;
  branding: ChapterBranding;
  /** True once the persisted mode has been read; gates the first paint. */
  hydrated: boolean;
  brandingLoading: boolean;
  /** Set when branding couldn't be fetched — surfaces in the branding editor. */
  brandingError: string | null;

  resolvedScheme: () => ColorScheme;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => void;
  setSystemScheme: (scheme: ColorScheme) => void;
  fetchBranding: (chapterId: string) => Promise<void>;
  saveBranding: (chapterId: string, patch: ChapterBrandingUpdate) => Promise<ChapterBranding>;
  resetBranding: (chapterId: string) => Promise<ChapterBranding>;
  /** Local-only preview used by the branding editor while dragging sliders. */
  previewBranding: (branding: ChapterBranding | null) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  function apply(mode: ThemeMode, systemScheme: ColorScheme, branding: ChapterBranding) {
    setActiveTheme(mode === "system" ? systemScheme : mode, branding);
  }

  let committedBranding: ChapterBranding | null = null;

  return {
    mode: "system",
    systemScheme: (Appearance.getColorScheme() ?? "light") as ColorScheme,
    branding: DEFAULT_BRANDING,
    hydrated: false,
    brandingLoading: false,
    brandingError: null,

    resolvedScheme() {
      const { mode, systemScheme } = get();
      return mode === "system" ? systemScheme : mode;
    },

    async hydrate() {
      let stored: string | null = null;
      try {
        stored = await SecureStore.getItemAsync(MODE_STORAGE_KEY);
      } catch {
        // Keychain unavailable (rare, e.g. a locked device on first launch) —
        // fall back to following the system rather than blocking startup.
      }
      const mode = isThemeMode(stored) ? stored : "system";
      const systemScheme = (Appearance.getColorScheme() ?? "light") as ColorScheme;
      apply(mode, systemScheme, get().branding);
      set({ mode, systemScheme, hydrated: true });
    },

    setMode(mode) {
      const { systemScheme, branding } = get();
      apply(mode, systemScheme, branding);
      set({ mode });
      SecureStore.setItemAsync(MODE_STORAGE_KEY, mode).catch(() => {
        // Preference still applies for this session; it just won't persist.
      });
    },

    setSystemScheme(systemScheme) {
      const { mode, branding } = get();
      if (get().systemScheme === systemScheme) return;
      apply(mode, systemScheme, branding);
      set({ systemScheme });
    },

    async fetchBranding(chapterId) {
      if (!chapterId) return;
      set({ brandingLoading: true, brandingError: null });
      try {
        const branding = await getChapterBranding(chapterId);
        committedBranding = branding;
        apply(get().mode, get().systemScheme, branding);
        set({ branding, brandingLoading: false });
      } catch (e: any) {
        // A backend without the branding routes yet (see api/branding.ts) must
        // not break the app — keep whatever branding we have and note why.
        set({
          brandingLoading: false,
          brandingError: e?.message ?? "Could not load chapter branding.",
        });
      }
    },

    async saveBranding(chapterId, patch) {
      const branding = await updateChapterBranding(chapterId, patch);
      committedBranding = branding;
      apply(get().mode, get().systemScheme, branding);
      set({ branding, brandingError: null });
      return branding;
    },

    async resetBranding(chapterId) {
      const branding = await resetChapterBranding(chapterId);
      committedBranding = branding;
      apply(get().mode, get().systemScheme, branding);
      set({ branding, brandingError: null });
      return branding;
    },

    previewBranding(branding) {
      // Passing null reverts to the last server-committed branding — this is
      // what the editor's "discard" path and unmount cleanup use so an
      // abandoned edit never leaks into the rest of the app.
      const next = branding ?? committedBranding ?? get().branding;
      apply(get().mode, get().systemScheme, next);
      set({ branding: next });
    },
  };
});
