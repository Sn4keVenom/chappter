// src/theme/makeStyles.ts
//
// Theme-aware replacement for module-scope StyleSheet.create.
//
//   Before:  const styles = StyleSheet.create({ screen: { backgroundColor: colors.background } })
//   After:   const styles = makeStyles((colors) => ({ screen: { backgroundColor: colors.background } }))
//
// Usage inside components is completely unchanged — `styles.screen` still
// works — but the value is now resolved against the ACTIVE palette at the
// moment of the property read (i.e. during render) instead of being frozen at
// import time. See runtime.ts for why this indirection exists.
//
// Each theme gets its own StyleSheet.create() result, computed once and
// cached, so switching between Light and Dark is a map lookup after the first
// switch — not a re-flatten of every style object on every render.

import { StyleSheet } from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getActivePalette, getThemeVersion } from "./runtime";
import type { Palette } from "./palette";

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (colors: Palette) => T
): T {
  const cache = new Map<number, T>();

  function resolve(): T {
    const version = getThemeVersion();
    let sheet = cache.get(version);
    if (!sheet) {
      sheet = StyleSheet.create(factory(getActivePalette())) as T;
      // Only ever two live entries matter (the current theme and the one
      // being animated away from); clear rather than grow unbounded across a
      // long session of branding tweaks.
      if (cache.size > 4) cache.clear();
      cache.set(version, sheet);
    }
    return sheet;
  }

  return new Proxy({} as T, {
    get(_target, prop) {
      return (resolve() as any)[prop];
    },
    has(_target, prop) {
      return prop in (resolve() as object);
    },
    ownKeys() {
      return Reflect.ownKeys(resolve() as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(resolve() as object, prop);
    },
  });
}
