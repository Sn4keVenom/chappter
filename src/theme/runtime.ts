// src/theme/runtime.ts
//
// A module-level holder for the palette that is active RIGHT NOW, plus a
// monotonic version counter that changes whenever it does.
//
// ── Why this exists ───────────────────────────────────────────────────────
// Every screen in this app declares its styles at module scope:
//
//     const styles = StyleSheet.create({ screen: { backgroundColor: ... } })
//
// That runs once, at import time — long before any React provider mounts and
// with no way to read context. Rewriting ~45 screens to build styles inside
// their render function would be a very large, very mechanical change with a
// lot of room for regressions.
//
// Instead, makeStyles.ts and colors.ts hand back Proxy objects that resolve
// each property read against whatever this module currently holds. Property
// reads happen during render, so they always see the live theme. This module
// is the one piece of mutable global state that makes that work; useThemeStore
// is its only writer.
//
// Components still have to RE-RENDER for a theme change to be visible, which
// a proxy can't cause on its own — that's what useThemeSubscription() in
// ThemeProvider.tsx is for (every screen calls useTheme(), which subscribes).

import { buildPalette, type ColorScheme, type Palette } from "./palette";
import { DEFAULT_BRANDING } from "./branding";
import type { ChapterBranding } from "../types";

let activePalette: Palette = buildPalette("light", DEFAULT_BRANDING);
let activeScheme: ColorScheme = "light";
let activeBranding: ChapterBranding = DEFAULT_BRANDING;
let version = 0;

type Listener = () => void;
const listeners = new Set<Listener>();

export function getActivePalette(): Palette {
  return activePalette;
}

export function getActiveScheme(): ColorScheme {
  return activeScheme;
}

export function getActiveBranding(): ChapterBranding {
  return activeBranding;
}

/** Cache key for makeStyles — changes exactly when the palette does. */
export function getThemeVersion(): number {
  return version;
}

export function setActiveTheme(scheme: ColorScheme, branding: ChapterBranding): void {
  const next = buildPalette(scheme, branding);
  // Cheap identity guard: skip the notify (and the stylesheet cache miss) when
  // nothing actually changed, e.g. a branding refetch that returned the same
  // values, or an OS appearance event while the user is pinned to Light.
  if (
    activeScheme === scheme &&
    activeBranding.primaryColor === branding.primaryColor &&
    activeBranding.accentColor === branding.accentColor &&
    activeBranding.backgroundTintLight === branding.backgroundTintLight &&
    activeBranding.backgroundTintDark === branding.backgroundTintDark &&
    version > 0
  ) {
    activeBranding = branding; // name/logo can still differ; no repaint needed
    return;
  }
  activeScheme = scheme;
  activeBranding = branding;
  activePalette = next;
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribeToTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
