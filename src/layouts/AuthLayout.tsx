// src/layouts/AuthLayout.tsx
//
// Shell for the signed-out routes. Painted in the chapter's primary color so
// branding is visible before sign-in, with all foregrounds derived from
// `--color-on-primary` — a chapter that brands itself in a pale color gets
// dark text here automatically rather than white-on-white.

import { Outlet } from "react-router-dom";
import { useThemeStore } from "../theme/useThemeStore";
import styles from "./AuthLayout.module.css";

export default function AuthLayout() {
  const branding = useThemeStore((s) => s.branding);

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        <div className={styles.hero}>
          <div className={styles.mark} aria-hidden="true">
            {branding.logoEmoji || branding.chapterLetters || "ΘΤ"}
          </div>
          <h1 className={styles.appName}>ChapterHub</h1>
          <p className={styles.tagline}>{branding.chapterName}</p>
        </div>
        <div className={styles.panel}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
