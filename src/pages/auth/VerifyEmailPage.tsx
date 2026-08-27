// src/pages/auth/VerifyEmailPage.tsx — 6-digit email verification code.
//
// Where a fresh sign-up actually finishes. SignUpPage only gets as far as
// creating the Clerk account and firing off the code — there's no live
// session yet at that point (Clerk doesn't hand back a session until the
// email is verified), so the atomic roster claim (POST
// /chapters/claim-role-number) can't happen there. It happens here, right
// after setActive(), back-to-back with the identity sync — from the user's
// perspective this is all one continuous "sign up" action, just split across
// two screens because Clerk's own verification step sits in the middle.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClerk, useSignUp } from "@clerk/clerk-react";

import { finishAuthSync } from "../../auth/finishAuthSync";
import { readPendingSignup, clearPendingSignup } from "../../auth/pendingSignup";
import { claimRoleNumber } from "../../api/roster";
import { useAuthStore } from "../../store/useAuthStore";
import { AuthBanner, AuthField, AuthLinks, AuthSubmit } from "./AuthForm";

export default function VerifyEmailPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const clerk = useClerk();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isLoaded || code.length !== 6) return;

    setBusy(true);
    setBanner(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status !== "complete" || !result.createdSessionId) {
        setBanner("That code didn't work. Check it and try again.");
        return;
      }

      await setActive({ session: result.createdSessionId });
      const pending = readPendingSignup();
      clearPendingSignup();

      // clerk.user is the singleton's own state, not a React hook value — it
      // reflects the session set above as soon as setActive() resolves. The
      // null check is a defensive fallback for a genuinely unexpected state,
      // not an expected branch.
      const clerkUser = clerk.user;
      if (!clerkUser) {
        setBanner("Your email is verified, but we couldn't finish setting up your account. Try signing in.");
        navigate("/login");
        return;
      }

      await finishAuthSync(clerkUser, { phone: pending?.phone, username: signUp.username ?? undefined });

      if (pending && pending.status !== "PNM" && pending.roleNumber != null) {
        try {
          const joinRequest = await claimRoleNumber({
            firstName: clerkUser.firstName ?? "",
            roleNumber: pending.roleNumber,
            status: pending.status,
          });
          const current = useAuthStore.getState().user;
          if (current) useAuthStore.getState().setUser({ ...current, pendingJoinRequest: joinRequest });
          navigate("/pending");
          return;
        } catch (e: any) {
          navigate("/join", { state: { error: e?.message ?? "That role number was just claimed by someone else — you can still request to join below." } });
          return;
        }
      }

      navigate("/join");
    } catch (e: any) {
      setBanner(e?.errors?.[0]?.message ?? "That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-lg)" }}>Verify your email</h2>
      <p style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-sm)", opacity: 0.8 }}>
        Enter the 6-digit code we sent to your email address.
      </p>

      {banner ? <AuthBanner>{banner}</AuthBanner> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          label="Verification code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          style={{ letterSpacing: "0.4em", textAlign: "center" }}
        />
        <AuthSubmit disabled={code.length !== 6 || busy}>{busy ? "Verifying…" : "Verify email"}</AuthSubmit>
      </form>

      <AuthLinks>
        <Link to="/login">Back to sign in</Link>
      </AuthLinks>
    </div>
  );
}
