// src/pages/auth/AuthForm.tsx
//
// Shared field and layout pieces for the auth screens — Login, SignUp,
// VerifyEmail, ForgotPassword, ResetPassword — all backed by
// @clerk/clerk-react (see App.tsx's ClerkProvider, gated by DEMO_MODE).
// Demo Mode never reaches these: RequireSignedOut redirects away from every
// route under this layout as soon as the demo session bootstraps.

import { useId } from "react";
import styles from "./AuthForm.module.css";

export function AuthField({
  label,
  error,
  hint,
  ...rest
}: { label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId ?? hintId}
        {...rest}
      />
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
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

export { styles as authStyles };
