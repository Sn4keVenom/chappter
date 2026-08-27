// src/pages/auth/ForgotPasswordPage.tsx — request a password-reset code.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSignIn } from "@clerk/clerk-react";

import { AuthBanner, AuthField, AuthLinks, AuthSubmit } from "./AuthForm";

export default function ForgotPasswordPage() {
  const { isLoaded, signIn } = useSignIn();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !isLoaded) return;

    setBusy(true);
    setBanner(null);
    try {
      // ResetPasswordPage continues this same in-progress attempt via its
      // own useSignIn() — Clerk keeps it live client-side across the route
      // change, no need to pass the email along ourselves.
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      navigate("/reset-password");
    } catch (e: any) {
      setBanner(e?.errors?.[0]?.message ?? "Couldn't send a reset code. Check the email and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-lg)" }}>Reset your password</h2>
      <p style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-sm)", opacity: 0.8 }}>
        We'll email you a code to set a new password.
      </p>

      {banner ? <AuthBanner>{banner}</AuthBanner> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@university.edu"
        />
        <AuthSubmit disabled={!email.trim() || busy}>{busy ? "Sending…" : "Send reset code"}</AuthSubmit>
      </form>

      <AuthLinks>
        <Link to="/login">Back to sign in</Link>
      </AuthLinks>
    </div>
  );
}
