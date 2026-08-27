// src/pages/auth/ResetPasswordPage.tsx — code + new password.
// Continues the in-progress attempt ForgotPasswordPage started; Clerk keeps
// that resource live client-side across the route change.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClerk, useSignIn } from "@clerk/clerk-react";

import { finishAuthSync } from "../../auth/finishAuthSync";
import { clerkErrorMessage } from "../../auth/clerkError";
import { AuthBanner, AuthField, AuthLinks, AuthSubmit } from "./AuthForm";

const MIN_PASSWORD_LENGTH = 10;

export default function ResetPasswordPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (code.length !== 6) next.code = "Enter the 6-digit code from your email.";
    if (password.length < MIN_PASSWORD_LENGTH) next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password !== confirm) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !isLoaded) return;

    setBusy(true);
    setBanner(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      });
      if (result.status !== "complete" || !result.createdSessionId) {
        setBanner("That code didn't work. Check it and try again.");
        return;
      }
      await setActive({ session: result.createdSessionId });
      if (clerk.user) await finishAuthSync(clerk.user);
      navigate("/", { replace: true });
    } catch (e: any) {
      setBanner(clerkErrorMessage(e, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(false);
    }
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
        <AuthSubmit disabled={busy}>{busy ? "Saving…" : "Set new password"}</AuthSubmit>
      </form>

      <AuthLinks>
        <Link to="/login">Back to sign in</Link>
      </AuthLinks>
    </div>
  );
}
