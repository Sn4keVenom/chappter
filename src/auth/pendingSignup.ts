// src/auth/pendingSignup.ts
//
// Carries the sign-up form's extra fields (phone, status, role number) across
// the SignUpPage → /verify-email redirect. Clerk's `signUp` resource doesn't
// have room for arbitrary app fields, so this rides in sessionStorage instead
// — same storage tier auth/session.ts already uses for remember-me, and it's
// the right lifetime: gone once the tab closes, and never meant to survive
// longer than the single sign-up attempt it belongs to.

const KEY = "chapterhub.pendingSignup";

export interface PendingSignup {
  phone: string;
  status: "PNM" | "ACTIVE" | "ALUMNI";
  roleNumber: number | null;
}

export function stashPendingSignup(value: PendingSignup): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode, embedded browser) — VerifyEmailPage
    // falls back to treating this as a PNM signup with no phone, which is
    // safe (just less complete) rather than throwing mid-flow.
  }
}

export function readPendingSignup(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingSignup) : null;
  } catch {
    return null;
  }
}

export function clearPendingSignup(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
