// src/pages/auth/LoginPage.tsx — email/username + password sign-in.

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClerk, useSignIn } from "@clerk/clerk-react";

import { rememberSession } from "../../auth/session";
import { finishAuthSync } from "../../auth/finishAuthSync";
import { clerkErrorMessage } from "../../auth/clerkError";
import { AuthBanner, AuthField, AuthLinks, AuthSubmit, authStyles } from "./AuthForm";

export default function LoginPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (!isLoaded) return;

    setBusy(true);
    setError(null);
    try {
      const result = await signIn.create({ identifier: identifier.trim(), password });
      if (result.status !== "complete" || !result.createdSessionId) {
        // Clerk instances with additional sign-in factors (MFA, etc.) would
        // land here — not configured for this app today, so treat it as an
        // unexpected failure rather than building a second-factor UI.
        setError("Couldn't finish signing in. Please try again.");
        return;
      }
      rememberSession(remember);
      await setActive({ session: result.createdSessionId });
      // clerk.user is the singleton's own state, not a React hook value — it
      // reflects the session set above as soon as setActive() resolves, no
      // extra render needed to read it here.
      if (clerk.user) await finishAuthSync(clerk.user);
      const from = (location.state as { from?: Location } | null)?.from;
      navigate(from ? `${from.pathname}${from.search}` : "/", { replace: true });
    } catch (e: any) {
      setError(clerkErrorMessage(e, "Incorrect email/username or password."));
    } finally {
      setBusy(false);
    }
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
          placeholder="you@example.com"
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

        <AuthSubmit disabled={busy}>{busy ? "Signing in…" : "Sign in"}</AuthSubmit>
      </form>

      <AuthLinks>
        <Link to="/forgot-password">Forgot your password?</Link>
        <span>
          New here? <Link to="/signup">Create an account</Link>
        </span>
      </AuthLinks>
    </div>
  );
}
