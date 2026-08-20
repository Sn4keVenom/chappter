// src/components/ui/Badge.tsx
//
// Status pill. Tones map to semantic palette pairs (see theme/semantic.ts) so
// a badge always has enough contrast in both themes — the mobile app built
// these by concatenating an alpha suffix onto a hex, which produced washed-out
// badges in dark mode.

import styles from "./Badge.module.css";
import type { Tone } from "../../theme/semantic";

export function Badge({
  tone = "neutral",
  uppercase,
  pill,
  children,
}: {
  tone?: Tone;
  uppercase?: boolean;
  pill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        styles.badge,
        styles[tone],
        uppercase ? styles.uppercase : "",
        pill ? styles.pill : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
