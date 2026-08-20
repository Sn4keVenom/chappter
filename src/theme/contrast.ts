// src/theme/contrast.ts
//
// Small, dependency-free color math used by the palette builder. Everything
// here is pure — no React, no RN — so it can be unit-tested or reused by the
// backend later if chapter branding ever needs server-side validation.
//
// The two jobs this file exists for:
//   1. Chapter branding lets an admin pick ANY primary/accent color. We can't
//      hard-code "white text on primary" — a chapter that picks pale yellow
//      would get invisible labels. readableTextOn() picks black or white by
//      measured contrast instead.
//   2. A brand color that reads well on a white background can vanish on a
//      near-black one (and vice versa). ensureContrast() nudges lightness
//      until the WCAG contrast ratio clears a floor, preserving hue so the
//      chapter still recognizably "looks like" their brand in both themes.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** Parse "#RGB" / "#RRGGBB" (with or without "#") → {r,g,b} 0-255. */
export function hexToRgb(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return { r: 0, g: 0, b: 0 };
  let body = match[1];
  if (body.length === 3) {
    body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  }
  const int = parseInt(body, 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** Normalize any accepted hex form to "#RRGGBB" uppercase. */
export function normalizeHex(hex: string): string {
  return rgbToHex(hexToRgb(hex));
}

/** WCAG 2.1 relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors — 1 (identical) to 21 (black/white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Blend two colors — amount 0 returns `from`, 1 returns `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, "#FFFFFF", amount);
}

export function darken(hex: string, amount: number): string {
  return mix(hex, "#000000", amount);
}

/**
 * Append an 8-bit alpha channel. RN understands #RRGGBBAA, and this is safer
 * than the `colors.primary + "22"` string concatenation the screens used
 * before, which silently produced garbage for 3-digit or already-aliased hex.
 */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const byte = Math.round(a * 255).toString(16).padStart(2, "0");
  return `${normalizeHex(hex)}${byte}`.toUpperCase();
}

/**
 * Pick the foreground (text/icon) color to place ON TOP of `background`.
 * Returns the candidate with the higher measured contrast, so a chapter that
 * brands itself pale gold gets near-black labels and one that brands itself
 * deep navy gets white ones — automatically, with no per-screen overrides.
 */
export function readableTextOn(
  background: string,
  options: { light?: string; dark?: string } = {}
): string {
  const light = options.light ?? "#FFFFFF";
  const dark = options.dark ?? "#10141A";
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/**
 * Nudge `color` toward white or black (whichever direction helps) until it
 * clears `minRatio` against `against`, preserving hue as much as possible.
 * Used so a brand color stays legible as a link/active-tab tint on both a
 * near-white and a near-black background.
 */
export function ensureContrast(
  color: string,
  against: string,
  minRatio: number
): string {
  if (contrastRatio(color, against) >= minRatio) return normalizeHex(color);

  // Move away from the background: lighten on a dark background, darken on a
  // light one. Step in small increments so we stop at the first passing shade
  // rather than jumping straight to pure white/black.
  // 40 steps rather than a coarser sweep: stopping at the FIRST passing shade
  // matters, because every extra step washes more of the chapter's hue out
  // toward white. Coarse steps overshoot badly on deep brand colors — a navy
  // that needs a 5% lift shouldn't come back 25% lighter and desaturated.
  const towards = luminance(against) < 0.5 ? "#FFFFFF" : "#0A0D12";
  const STEPS = 40;
  for (let step = 1; step <= STEPS; step++) {
    const candidate = mix(color, towards, step / STEPS);
    if (contrastRatio(candidate, against) >= minRatio) return candidate;
  }
  return towards;
}
