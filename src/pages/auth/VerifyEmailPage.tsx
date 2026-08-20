// src/pages/auth/VerifyEmailPage.tsx — 6-digit email verification code.
// See AuthForm.tsx for why submission explains rather than verifying.

import { useState } from "react";
import { Link } from "react-router-dom";

import { AuthBanner, AuthField, AuthLinks, AuthNotAvailableNotice, AuthSubmit } from "./AuthForm";

export default function VerifyEmailPage() {
  const [code, setCode] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-lg)" }}>Verify your email</h2>
      <p style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-sm)", opacity: 0.8 }}>
        Enter the 6-digit code we sent to your email address.
      </p>

      {banner ? <AuthBanner>{banner}</AuthBanner> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBanner("Email verification isn't connected in this build — see the note below.");
        }}
      >
        <AuthField
          label="Verification code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          style={{ letterSpacing: "0.4em", textAlign: "center" }}
        />
        <AuthSubmit disabled={code.length !== 6}>Verify email</AuthSubmit>
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
