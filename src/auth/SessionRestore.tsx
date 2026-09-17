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
//
// ── Why failed syncs retry instead of falling back to signed-out ──────────
// This used to treat ANY /auth/sync failure as "not signed in" and drop the
// user at /login. That's right for a genuine 401/403 (the token itself is
// bad — Clerk really doesn't consider them signed in), but wrong for a
// network blip, a timeout, or the backend being briefly overloaded — Clerk
// still very much has an active session in that case. Reported live: "when
// a bunch of people get on the app at the same time," a burst of concurrent
// /auth/sync calls (POST, so the shared axios retry in api/client.ts
// deliberately skips it) would occasionally fail for some of them, wrongly
// clearing `user` to null. RequireSignedOut (RootRedirect.tsx) then let the
// plain sign-in form render for someone Clerk still had signed in — and the
// instant they tried to sign in again, Clerk's own client SDK rejected it
// with "You're already signed in," landing them on that raw error with no
// path to the /switch-account recovery screen that's supposed to catch
// exactly this. Retrying first (with backoff) absorbs the transient case;
// setSyncError (only after retries are exhausted, and only for a non-401/403
// failure) tells RootRedirect to show a "couldn't connect" retry state
// instead — never /login — since Clerk's session is still real.

import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { ApiError } from "../api/client";
import { useAuthStore } from "../store/useAuthStore";
import { finishAuthSync } from "./finishAuthSync";
import type { ClerkUserLike } from "./finishAuthSync";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_ATTEMPTS = 5; // ~500ms, 1s, 2s, 4s, 8s — ~15.5s total, under a typical page-load patience budget

async function syncWithRetry(user: ClerkUserLike, attempt = 0): Promise<void> {
  try {
    await finishAuthSync(user);
  } catch (err) {
    // A definitive answer that this token/account isn't valid — no amount
    // of retrying changes that.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) throw err;
    if (attempt + 1 >= MAX_ATTEMPTS) throw err;
    await delay(500 * 2 ** attempt);
    return syncWithRetry(user, attempt + 1);
  }
}

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

    syncWithRetry(user).catch((err) => {
      ranFor.current = null;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        useAuthStore.getState().setUser(null);
      } else {
        useAuthStore.getState().setSyncError(true);
      }
    });
  }, [authLoaded, isSignedIn, userLoaded, user]);

  return null;
}
