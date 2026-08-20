// src/pages/auth/LoginPage.tsx — email/username + password sign-in.
// See AuthForm.tsx for why submission explains rather than authenticates.

import { useState } from "react";
import { Link } from "react-router-dom";

import { rememberSession } from "../../auth/session";
import { AuthBanner, AuthField, AuthLinks, AuthNotAvailableNotice, AuthSubmit, authStyles } from "./AuthForm";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    // The remember-me choice is recorded now so it's already correct when a
    // real session provider is wired in.
    rememberSession(remember);
    setError(
      "Sign-in isn't connected in this build — see the note below. Demo Mode signs you in automatically."
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-lg)" }}>Sign in</h2>

      {error ? <AuthBanner>{error}</AuthBanner> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          label="Email or username"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          placeholder="you@university.edu"
        />
        <AuthField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <div className={authStyles.rememberRow}>
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <label htmlFor="remember" className={authStyles.rememberLabel}>
            Keep me signed in on this device
          </label>
        </div>

        <AuthSubmit>Sign in</AuthSubmit>
      </form>

      <AuthLinks>
        <Link to="/forgot-password">Forgot your password?</Link>
        <span>
          New here? <Link to="/signup">Create an account</Link>
        </span>
      </AuthLinks>

      <div style={{ marginTop: "var(--space-6)" }}>
        <AuthNotAvailableNotice />
      </div>
    </div>
  );
}
