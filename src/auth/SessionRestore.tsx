// src/auth/SessionRestore.tsx
//
// Real-mode counterpart to mocks/bootstrap.ts's bootstrapDemoSession(): turns
// "Clerk has (or doesn't have) a persisted session" into useAuthStore being
// populated, on cold start / page refresh. Mounted once inside <ClerkProvider>
// (see App.tsx) — renders nothing, just resolves the store's initial
// isLoading:true (see useAuthStore.ts) so RootRedirect can render the real
// route instead of a loading spinner.
//
// Sign-in and sign-up call finishAuthSync() themselves right after producing
// a session, same as this does — this component only covers the "already
// had a session before this page load" case.

import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useAuthStore } from "../store/useAuthStore";
import { finishAuthSync } from "./finishAuthSync";

export function SessionRestore(): null {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoaded) return;

    if (!isSignedIn) {
      ranFor.current = null;
      useAuthStore.getState().setUser(null);
      return;
    }

    if (!userLoaded || !user) return;
    if (ranFor.current === user.id) return; // already synced this session
    ranFor.current = user.id;

    finishAuthSync(user).catch(() => {
      // /auth/sync failing here (network blip, backend down) shouldn't trap
      // the user on an infinite spinner — fall through to signed-out so
      // RootRedirect sends them to /login, where retrying is obvious.
      ranFor.current = null;
      useAuthStore.getState().setUser(null);
    });
  }, [authLoaded, isSignedIn, userLoaded, user]);

  return null;
}
