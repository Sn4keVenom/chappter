// src/theme/useThemeStore.ts
//
// The one writer of theme state. Combines the two independent inputs the
// palette needs:
//
//   · appearance mode — PERSONAL and device-local ("system" | "light" |
//     "dark"), saved to localStorage so it survives a reload. Never sent to
//     the server: one member preferring Dark must not change what anyone
//     else sees.
//   · chapter branding — CHAPTER-WIDE and server-owned, fetched through
//     api/branding.ts (mocked in Demo Mode) and editable by admins with
//     settings.manage.
//
// Every write ends in applyPaletteToDocument(), which writes the resolved
// palette onto <html> as CSS custom properties. Components read those
// variables from CSS and never see a color value in JavaScript.

import { create } from "zustand";

import type { ChapterBranding } from "../types";
import {
  getChapterBranding,
  resetChapterBranding,
  updateChapterBranding,
  type ChapterBrandingUpdate,
} from "../api/branding";
import { DEFAULT_BRANDING } from "./branding";
import { buildPalette, type ColorScheme } from "./palette";
import { applyPaletteToDocument } from "./cssVars";

export type ThemeMode = "system" | "light" | "dark";

const MODE_STORAGE_KEY = "chapterhub.appearanceMode";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

/** Media query used to follow the OS setting when mode === "system". */
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemScheme(): ColorScheme {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

interface ThemeState {
  mode: ThemeMode;
  /** Whatever the OS currently reports — only used when mode === "system". */
  systemScheme: ColorScheme;
  /** What the app is currently painted with — this is the PREVIEWED value
   *  while the branding editor is open, not necessarily what's saved. */
  branding: ChapterBranding;
  /**
   * The last value the server confirmed. Kept separate from `branding`
   * because the editor's live preview overwrites `branding` on every
   * keystroke — comparing a draft against that would always report "no
   * changes" and leave Save permanently disabled.
   */
  committedBranding: ChapterBranding;
  brandingLoading: boolean;
  /** Set when branding couldn't be fetched — surfaces in the branding editor. */
  brandingError: string | null;

  resolvedScheme: () => ColorScheme;
  init: () => void;
  setMode: (mode: ThemeMode) => void;
  setSystemScheme: (scheme: ColorScheme) => void;
  fetchBranding: (chapterId: string) => Promise<void>;
  saveBranding: (chapterId: string, patch: ChapterBrandingUpdate) => Promise<ChapterBranding>;
  resetBranding: (chapterId: string) => Promise<ChapterBranding>;
  /** Local-only preview used by the branding editor while it's being edited. */
  previewBranding: (branding: ChapterBranding | null) => void;
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    // Private browsing / storage disabled — follow the system for this
    // session rather than failing to boot.
    return "system";
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  function apply(mode: ThemeMode, system: ColorScheme, branding: ChapterBranding) {
    applyPaletteToDocument(buildPalette(mode === "system" ? system : mode, branding));
  }

  return {
    // Read synchronously at store creation — localStorage is synchronous, so
    // the very first paint already has the right theme and there's no
    // light-to-dark flash on load. (index.html also runs an inline script
    // that sets the background before any JS bundle parses.)
    mode: readStoredMode(),
    systemScheme: systemScheme(),
    branding: DEFAULT_BRANDING,
    committedBranding: DEFAULT_BRANDING,
    brandingLoading: false,
    brandingError: null,

    resolvedScheme() {
      const { mode, systemScheme: sys } = get();
      return mode === "system" ? sys : mode;
    },

    init() {
      const { mode, systemScheme: sys, branding } = get();
      apply(mode, sys, branding);
    },

    setMode(mode) {
      const { systemScheme: sys, branding } = get();
      apply(mode, sys, branding);
      set({ mode });
      try {
        localStorage.setItem(MODE_STORAGE_KEY, mode);
      } catch {
        // Preference still applies for this session; it just won't persist.
      }
    },

    setSystemScheme(next) {
      if (get().systemScheme === next) return;
      const { mode, branding } = get();
      apply(mode, next, branding);
      set({ systemScheme: next });
    },

    async fetchBranding(chapterId) {
      if (!chapterId) return;
      set({ brandingLoading: true, brandingError: null });
      try {
        const branding = await getChapterBranding(chapterId);
        apply(get().mode, get().systemScheme, branding);
        set({ branding, committedBranding: branding, brandingLoading: false });
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
      apply(get().mode, get().systemScheme, branding);
      set({ branding, committedBranding: branding, brandingError: null });
      return branding;
    },

    async resetBranding(chapterId) {
      const branding = await resetChapterBranding(chapterId);
      apply(get().mode, get().systemScheme, branding);
      set({ branding, committedBranding: branding, brandingError: null });
      return branding;
    },

    previewBranding(branding) {
      // Passing null reverts to the last server-committed branding — this is
      // what the editor's "discard" path and unmount cleanup use so an
      // abandoned edit never leaks into the rest of the app.
      const next = branding ?? get().committedBranding;
      apply(get().mode, get().systemScheme, next);
      set({ branding: next });
    },
  };
});
