// src/theme/colors.ts
//
// `colors` is now a LIVE view onto the active palette rather than a frozen
// object literal. Reading `colors.primary` during render returns the current
// theme's primary — light or dark, with the chapter's branding applied.
//
// This keeps the import every screen already has (`import { colors } from
// "../theme/colors"`) working unchanged for inline color props such as
// `<ActivityIndicator color={colors.primary} />` and
// `placeholderTextColor={colors.textMuted}`.
//
// ⚠️ One rule: never destructure or copy this at module scope.
//
//     const C = { ...colors }                    // ✗ frozen at import time
//     const MAP = { PAID: colors.success }       // ✗ frozen at import time
//     function statusColor() { return colors.success }   // ✓ read at call time
//
// Module-scope reads happen before any theme is resolved, so they silently
// capture the default light palette forever. Wrap them in a function (see
// e.g. duesStatusColor in ProfileScreen) instead.
//
// For new code, prefer `const { colors } = useTheme()` — it's the same object,
// but going through the hook also subscribes the component to theme changes.

import { getActivePalette } from "./runtime";
import type { Palette } from "./palette";

export const colors: Palette = new Proxy({} as Palette, {
  get(_target, prop) {
    return (getActivePalette() as any)[prop];
  },
  has(_target, prop) {
    return prop in getActivePalette();
  },
  ownKeys() {
    return Reflect.ownKeys(getActivePalette());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getActivePalette(), prop);
  },
});

export type AppColors = Palette;
export type { Palette, ColorScheme } from "./palette";
