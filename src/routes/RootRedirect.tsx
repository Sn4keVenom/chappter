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

  if (isLoading) return <LoadingState label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.hasChapter) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Signed-out routes. A signed-in user visiting /login is sent onward. */
export function RequireSignedOut() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) return <LoadingState label="Restoring your session…" />;
  if (user) return <Navigate to={user.hasChapter ? "/" : "/join"} replace />;
  return <Outlet />;
}
