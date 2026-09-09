// src/pages/auth/SwitchAccountPage.tsx
//
// "I just tried to have a bunch of people sign up at once and now it's
// telling everyone 'You're already signed in.'" On a shared device — a
// laptop passed around at a table for a bunch of people to sign up one
// after another — this app's single-session-per-browser model means the
// PREVIOUS person's session is still alive when the NEXT person opens
// /signup. RequireSignedOut (routes/RootRedirect.tsx) used to handle that
// by silently redirecting straight into the first person's dashboard, with
// no obvious way back to the form the next person actually came for. This
// page is that "obvious way back": sign out and land right back where you
// were headed, or continue into the app as whoever's already signed in.
//
// Reachable only via RequireSignedOut's redirect (it carries `from` in
// route state) — visited directly with no state, it just falls back to
// sending you into the app, which is still correct.

import { useNavigate, useLocation, Link } from "react-router-dom";
import { useState } from "react";

import { useAuthStore } from "../../store/useAuthStore";
import { useAppAuth } from "../../auth/useAppAuth";
import { AuthBanner, AuthLinks, AuthSubmit } from "./AuthForm";

export default function SwitchAccountPage() {
  const user = useAuthStore((s) => s.user);
  const { signOut } = useAppAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  const continueTo = user?.hasChapter ? "/" : "/join";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // Land back on whatever signed-out page they were actually headed
      // to (e.g. /signup) — now genuinely signed out, so the next person
      // just picks up filling out the form. Falls back to /login if they
      // reached this page some other way.
      navigate(from ?? "/login", { replace: true });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-5)", fontSize: "var(--text-lg)" }}>Already signed in</h2>
      <AuthBanner>
        {user ? `You're signed in as ${user.firstName} on this device.` : "You're signed in on this device."} Sign
        out first if you meant to create a new account or sign in as someone else — handy when passing a laptop
        around for a bunch of people to sign up in a row.
      </AuthBanner>
      <AuthSubmit type="button" disabled={signingOut} onClick={handleSignOut}>
        {signingOut ? "Signing out…" : "Sign out"}
      </AuthSubmit>
      <AuthLinks>
        <Link to={continueTo}>Continue to the app instead</Link>
      </AuthLinks>
    </div>
  );
}
