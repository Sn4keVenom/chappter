// src/components/PageHeader.tsx
//
// Every page opens with one of these. The heading is a real <h1> so the
// document has exactly one top-level heading per route, which is what screen
// readers and the browser's own outline rely on.

import { Link } from "react-router-dom";
import styles from "./PageHeader.module.css";

export function PageHeader({
  title,
  subtitle,
  backTo,
  backLabel = "Back",
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Renders an explicit back link. Browser Back always works regardless. */
  backTo?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        {backTo ? (
          <Link to={backTo} className={styles.back}>
            <span aria-hidden="true">‹</span> {backLabel}
          </Link>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  children,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      {title ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
