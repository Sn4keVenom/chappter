// src/pages/auth/ResetPasswordPage.tsx — code + new password.
// See AuthForm.tsx for why submission explains rather than resetting.

import { useState } from "react";
import { Link } from "react-router-dom";

import { AuthBanner, AuthField, AuthLinks, AuthNotAvailableNotice, AuthSubmit } from "./AuthForm";

export default function ResetPasswordPage() {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (code.length !== 6) next.code = "Enter the 6-digit code from your email.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (password !== confirm) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBanner("Password reset isn't connected in this build — see the note below.");
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-lg)" }}>Choose a new password</h2>

      {banner ? <AuthBanner>{banner}</AuthBanner> : null}

      <form onSubmit={handleSubmit} noValidate>
        <AuthField
          label="Reset code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          error={errors.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
        />
        <AuthField
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
        />
        <AuthField
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          autoComplete="new-password"
        />
        <AuthSubmit>Set new password</AuthSubmit>
      </form>

      <AuthLinks>
        <Link to="/login">Back to sign in</Link>
      </AuthLinks>

      <div style={{ marginTop: "var(--space-6)" }}>
        <AuthNotAvailableNotice />
      </div>
    </div>
  );
}
