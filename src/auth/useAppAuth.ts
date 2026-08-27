// src/auth/useAppAuth.ts
//
// Sign-out, without callers needing to know whether Clerk exists.
//
// In Demo Mode there is no auth provider in the tree at all, so this is a
// no-op that only clears the per-user caches. In real mode it also tears
// down the Clerk session — useClerk() is safe to call unconditionally here
// because useAppAuth() itself is only ever invoked from a mounted component,
// and Demo Mode's <ClerkProvider>-free tree never reaches this hook's
// real-mode branch (DEMO_MODE guards it below).

import { useClerk } from "@clerk/clerk-react";
import { DEMO_MODE } from "../config/demo";
import { usePointsStore } from "../store/usePointsStore";
import { useMessagesStore } from "../store/useMessagesStore";
import { useAuthStore } from "../store/useAuthStore";
import { setAuthToken, setTokenGetter } from "../api/client";
import { clearSession } from "./session";

export function useAppAuth(): { signOut: () => Promise<void> } {
  // Calling useClerk() only makes sense once <ClerkProvider> is mounted
  // (real mode) — DEMO_MODE is a build-time-stable flag, so this
  // conditional hook call never flips between renders.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const clerk = DEMO_MODE ? null : useClerk();

  return {
    signOut: async () => {
      if (clerk) {
        await clerk.signOut();
      }

      setTokenGetter(null);
      setAuthToken(null);
      clearSession();

      // useAuthStore is cleared by the caller (which then re-renders into the
      // auth routes), but these per-user caches are not — without clearing
      // them, a second account signing in on the same device could briefly
      // render the previous user's points ledger or messages, including
      // private DMs.
      usePointsStore.getState().resetLedger();
      useMessagesStore.getState().reset();
      useAuthStore.getState().setUser(null);
    },
  };
}
