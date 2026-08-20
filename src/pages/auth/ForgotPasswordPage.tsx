// src/pages/auth/ForgotPasswordPage.tsx — request a password-reset code.
// See AuthForm.tsx for why submission explains rather than sending.

import { useState } from "react";
import { Link } from "react-router-dom";

import { AuthBanner, AuthField, AuthLinks, AuthNotAvailableNotice, AuthSubmit } from "./AuthForm";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-lg)" }}>Reset your password</h2>
      <p style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-sm)", opacity: 0.8 }}>
        We'll email you a code to set a new password.
      </p>

      {banner ? <AuthBanner>{banner}</AuthBanner> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBanner("Password reset isn't connected in this build — see the note below.");
        }}
      >
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@university.edu"
        />
        <AuthSubmit disabled={!email.trim()}>Send reset code</AuthSubmit>
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
