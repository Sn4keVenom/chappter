// src/components/ui/Feedback.tsx
//
// Loading / empty / error states. Every asynchronous surface in the app uses
// these three, so a page is never blank and never silently fails.

import styles from "./Feedback.module.css";

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span
      className={[styles.spinner, small ? styles.spinnerSm : ""].filter(Boolean).join(" ")}
      role="status"
      aria-label={label ?? "Loading"}
    />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.center}>
      <Spinner />
      {/* Announced once rather than on every frame of the animation. */}
      <p className={styles.body} role="status">
        {label}
      </p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.center}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className={styles.title}>{title}</p>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.center} role="alert">
      <span className={styles.icon} aria-hidden="true">
        ⚠️
      </span>
      <p className={styles.title}>{title}</p>
      {body ? <p className={styles.body}>{body}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} style={{ color: "var(--color-link)", fontWeight: 700 }}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Inline, non-blocking failure — used when partial content is still useful. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={styles.errorBanner} role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} style={{ fontWeight: 800, color: "inherit" }}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ height = 64, width = "100%" }: { height?: number | string; width?: number | string }) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden="true" />;
}
