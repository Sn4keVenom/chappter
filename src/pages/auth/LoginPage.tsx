// src/pages/auth/LoginPage.tsx — email/username + password sign-in.
//
// ── Why this is two steps, not one ───────────────────────────────────────
// signIn.create({ identifier, password }) does NOT always finish the job.
// Clerk returns a `status`, and only "complete" means signed in. The others
// are Clerk asking for one more thing:
//
//   needs_first_factor   the password alone wasn't accepted as the first
//                        factor — typically Clerk wants an emailed code,
//                        which is what "verify new devices" produces
//   needs_second_factor  MFA is on for this account (authenticator app,
//                        SMS, or backup code)
//   needs_new_password   the password is expired/must be reset
//   needs_identifier     Clerk didn't recognise the identifier at all
//
// This page previously treated every non-complete status as a single
// unexplained "Couldn't finish signing in", which made the common
// new-device case indistinguishable from a real failure and impossible to
// diagnose from the message alone. It now drives the code-entry step to
// completion, and any status it genuinely can't resolve says which one it
// was.

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClerk, useSignIn } from "@clerk/clerk-react";
import type { SignInResource } from "@clerk/shared/types";

import { rememberSession } from "../../auth/session";
import { finishAuthSync } from "../../auth/finishAuthSync";
import { clerkErrorMessage } from "../../auth/clerkError";
import { AuthBanner, AuthField, AuthLinks, AuthSubmit, authStyles } from "./AuthForm";

/** Which verification we asked Clerk to send, so the second step knows
 * whether to complete it as a first or second factor. `label` is what the
 * code was sent to (Clerk's already-redacted `safeIdentifier`, e.g.
 * "w•••@gmail.com") — never the full address, which we shouldn't reveal to
 * someone holding only a password. */
type PendingVerification =
  | { factor: "first"; strategy: "email_code" | "phone_code"; label: string }
  | { factor: "second"; strategy: "phone_code" | "totp" | "backup_code"; label: string };

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

  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [code, setCode] = useState("");

  /** Shared tail of every successful path: persist the remember-me choice,
   * activate the session, sync our own User row, then go where the user was
   * originally headed. */
  async function completeSignIn(sessionId: string) {
    // Unreachable in practice — every caller has already passed the
    // `isLoaded` check — but that narrowing doesn't cross a function
    // boundary, and useSignIn() genuinely types these as optional.
    if (!setActive) return;
    rememberSession(remember);
    await setActive({ session: sessionId });
    // clerk.user is the singleton's own state, not a React hook value — it
    // reflects the session set above as soon as setActive() resolves, no
    // extra render needed to read it here.
    if (clerk.user) await finishAuthSync(clerk.user);
    const from = (location.state as { from?: Location } | null)?.from;
    navigate(from ? `${from.pathname}${from.search}` : "/", { replace: true });
  }

  /** Turns a non-complete SignIn into either a code-entry step or a clear
   * message. Returns nothing — it sets state. */
  async function handleIncompleteStatus(result: SignInResource) {
    if (!signIn) return; // see completeSignIn — narrowing doesn't cross scopes
    if (result.status === "needs_new_password") {
      setError("Your password needs to be reset before you can sign in. Use “Forgot your password?” below.");
      return;
    }
    if (result.status === "needs_identifier") {
      setError("We didn't recognise that email or username.");
      return;
    }

    if (result.status === "needs_first_factor") {
      // Prefer an emailed code; fall back to SMS if that's what the account
      // has. Anything else (passkey, OAuth, magic link) needs a different UI
      // than a code box, so it's reported rather than half-handled.
      const email = result.supportedFirstFactors?.find((f) => f.strategy === "email_code");
      if (email && "emailAddressId" in email) {
        await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: email.emailAddressId });
        setPending({ factor: "first", strategy: "email_code", label: email.safeIdentifier });
        return;
      }
      const phone = result.supportedFirstFactors?.find((f) => f.strategy === "phone_code");
      if (phone && "phoneNumberId" in phone) {
        await signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId: phone.phoneNumberId });
        setPending({ factor: "first", strategy: "phone_code", label: phone.safeIdentifier });
        return;
      }
      const available = result.supportedFirstFactors?.map((f) => f.strategy).join(", ") || "none";
      setError(`This account needs a different sign-in method (${available}), which isn't supported here yet.`);
      return;
    }

    if (result.status === "needs_second_factor") {
      const phone = result.supportedSecondFactors?.find((f) => f.strategy === "phone_code");
      if (phone && "phoneNumberId" in phone) {
        await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: phone.phoneNumberId });
        setPending({ factor: "second", strategy: "phone_code", label: phone.safeIdentifier });
        return;
      }
      // TOTP and backup codes need no prepare step — the user already has
      // the code in their authenticator app or on paper.
      if (result.supportedSecondFactors?.some((f) => f.strategy === "totp")) {
        setPending({ factor: "second", strategy: "totp", label: "your authenticator app" });
        return;
      }
      if (result.supportedSecondFactors?.some((f) => f.strategy === "backup_code")) {
        setPending({ factor: "second", strategy: "backup_code", label: "your backup codes" });
        return;
      }
      setError("This account has two-factor authentication enabled in a form this app can't complete yet.");
      return;
    }

    // Genuinely unexpected — name the status so it's diagnosable rather than
    // hidden behind "please try again".
    setError(`Couldn't finish signing in (${result.status}). Please try again.`);
  }

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
      if (result.status === "complete" && result.createdSessionId) {
        await completeSignIn(result.createdSessionId);
        return;
      }
      await handleIncompleteStatus(result);
    } catch (e: any) {
      setError(clerkErrorMessage(e, "Incorrect email/username or password."));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || !code.trim() || !isLoaded) return;

    setBusy(true);
    setError(null);
    try {
      const result =
        pending.factor === "first"
          ? await signIn.attemptFirstFactor({ strategy: pending.strategy, code: code.trim() })
          : await signIn.attemptSecondFactor({ strategy: pending.strategy, code: code.trim() });

      if (result.status === "complete" && result.createdSessionId) {
        await completeSignIn(result.createdSessionId);
        return;
      }
      await handleIncompleteStatus(result);
    } catch (e: any) {
      setError(clerkErrorMessage(e, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div>
        <h2 style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-lg)" }}>Verify it's you</h2>

        {error ? <AuthBanner>{error}</AuthBanner> : null}

        <p style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
          {pending.strategy === "totp" || pending.strategy === "backup_code"
            ? `Enter the code from ${pending.label}.`
            : `We sent a code to ${pending.label}. Enter it below to finish signing in.`}
        </p>

        <form onSubmit={handleVerify}>
          <AuthField
            label="Verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={pending.strategy === "backup_code" ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoFocus
          />
          <AuthSubmit disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</AuthSubmit>
        </form>

        <AuthLinks>
          <button
            type="button"
            className={authStyles.linkButton}
            onClick={() => {
              setPending(null);
              setCode("");
              setError(null);
            }}
          >
            Back to sign in
          </button>
        </AuthLinks>
      </div>
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
