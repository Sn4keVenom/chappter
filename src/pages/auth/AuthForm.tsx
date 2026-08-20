// src/pages/auth/AuthForm.tsx
//
// Shared field and layout pieces for the five auth screens, plus the one
// honest explanation of what auth does and doesn't do right now.
//
// ── Why these screens don't sign anyone in ──────────────────────────────
// Authentication was Clerk's `@clerk/clerk-expo`, which has no browser build.
// The web equivalent is `@clerk/clerk-react` — adding it is a real dependency
// and configuration decision (publishable key, allowed origins, session
// handling) that belongs to whoever reconnects the backend, not to this
// frontend migration. Stubbing it with a fake sign-in would be worse: it would
// look like it worked and silently let anyone in.
//
// So the forms are complete, validated, accessible, and wired to the point of
// submission — and then they say plainly that credentials aren't connected
// yet, and point at Demo Mode, which is how the app is actually used today.

import { useId } from "react";
import styles from "./AuthForm.module.css";

export function AuthField({
  label,
  error,
  ...rest
}: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...rest}
      />
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.banner} role="alert">
      {children}
    </p>
  );
}

export function AuthSubmit({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="submit" className={styles.submit} {...rest}>
      {children}
    </button>
  );
}

export function AuthLinks({ children }: { children: React.ReactNode }) {
  return <div className={styles.links}>{children}</div>;
}

/**
 * Shown on every auth screen. Says exactly what is and isn't wired up, so
 * nobody spends time wondering why a correct password doesn't work.
 */
export function AuthNotAvailableNotice() {
  return (
    <p className={styles.notice}>
      <strong>Accounts aren't connected in this build.</strong> ChapterHub runs
      in Demo Mode, which signs you in automatically with sample data — no
      password needed. Reconnecting real accounts means adding the Clerk web
      SDK and pointing the app at the backend; see <code>docs/WEB_MIGRATION.md</code>.
    </p>
  );
}

export { styles as authStyles };
