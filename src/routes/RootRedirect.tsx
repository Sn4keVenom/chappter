// src/routes/RootRedirect.tsx
//
// The auth gate, expressed as routing rather than as a conditionally rendered
// navigator. Three states, matching the mobile app's RootNavigator exactly:
//
//   no user             → /login
//   user, no chapter    → /join
//   user, has chapter   → the app
//
// Implemented as a guard component wrapping each branch (rather than one
// component that switches) so the URL always reflects the state. A signed-out
// user who opens a deep link lands on /login with `from` remembered, and is
// returned there after signing in — which a single-component switch cannot do.

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { LoadingState } from "../components/ui/Feedback";

/** Requires a signed-in user WITH a chapter membership. */
export function RequireChapter() {
  const { user, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) return <LoadingState label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!user.hasChapter) return <Navigate to="/join" replace />;
  return <Outlet />;
}

/** Requires a signed-in user who has NOT yet joined a chapter. */
export function RequireOnboarding() {
  const { user, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) return <LoadingState label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.hasChapter) return <Navigate to="/" replace />;
  // A user who already has an outstanding request shouldn't see the join
  // options again on every visit/reload — send them straight to the
  // "pending" screen instead. Only redirect away from /join, not away from
  // /pending itself (redirecting a route to itself is harmless but pointless).
  if (user.pendingJoinRequest?.status === "PENDING" && location.pathname !== "/pending") {
    return <Navigate to="/pending" replace />;
  }
  return <Outlet />;
}

/** Signed-out routes. A signed-in user visiting /login or /signup is sent
 * onward — except that "onward" used to mean straight into the app with no
 * way back, which is exactly wrong for /signup: "I just tried to have a
 * bunch of people sign up at once and now it's telling everyone 'You're
 * already signed in.'" On a shared device (a laptop passed around at a
 * table), the FIRST person's session is still alive when the SECOND person
 * opens /signup — this app only keeps one session per browser — so they'd
 * get silently dumped into the first person's dashboard with no obvious way
 * to sign out and actually reach the form they came for. /switch-account
 * (below) replaces that dead end with an explicit "sign out and continue"
 * step, while still preserving the normal, good case (a signed-in user who
 * bookmarked /login gets taken straight into the app) — see its own doc
 * comment for why it isn't a redirect loop. */
export function RequireSignedOut() {
  const { user, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) return <LoadingState label="Restoring your session…" />;
  if (user && location.pathname !== "/switch-account") {
    return <Navigate to="/switch-account" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
