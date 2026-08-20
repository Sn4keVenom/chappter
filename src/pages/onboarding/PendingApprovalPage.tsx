// src/pages/onboarding/PendingApprovalPage.tsx
//
// Shown while a "Request to Join" is still pending, so someone who has already
// asked doesn't see the join options again every time they open the app.
// Re-checks on demand rather than polling — the wait is measured in hours.

import { useState } from "react";

import { getMyPendingJoinRequest } from "../../api/chapters";
import { useAppAuth } from "../../auth/useAppAuth";
import { AuthBanner, AuthSubmit, authStyles } from "../auth/AuthForm";

export default function PendingApprovalPage() {
  const { signOut } = useAppAuth();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function recheck() {
    setChecking(true);
    setMessage(null);
    try {
      const request = await getMyPendingJoinRequest();
      setMessage(
        request?.status === "PENDING"
          ? "Still pending — an officer hasn't reviewed it yet."
          : "Your request has been reviewed. Reloading…"
      );
      // A resolved request changes the auth gate's answer, so a reload is the
      // simplest correct way to re-enter the app.
      if (request?.status !== "PENDING") window.location.reload();
    } catch {
      setMessage("Couldn't check right now. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-lg)" }}>Request pending</h2>

      {message ? <AuthBanner>{message}</AuthBanner> : null}

      <p className={authStyles.notice} style={{ marginBottom: "var(--space-5)" }}>
        Your request to join has been sent. A chapter officer needs to approve
        it before you get access — you'll be able to sign straight in once they
        do.
      </p>

      <AuthSubmit onClick={recheck} disabled={checking}>
        {checking ? "Checking…" : "Check again"}
      </AuthSubmit>

      <button
        type="button"
        onClick={() => signOut()}
        style={{
          display: "block",
          width: "100%",
          marginTop: "var(--space-4)",
          textAlign: "center",
          color: "var(--color-on-primary)",
          textDecoration: "underline",
          fontSize: "var(--text-sm)",
          minHeight: "var(--tap)",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
