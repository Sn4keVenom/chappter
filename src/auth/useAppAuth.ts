// src/auth/useAppAuth.ts
//
// Sign-out, without callers needing to know whether Clerk exists.
//
// In Demo Mode there is no auth provider in the tree at all, so this is a
// no-op that only clears the per-user caches. When the real backend is
// reconnected, the marked seam below is where @clerk/clerk-react's
// useAuth().signOut() gets called — no page changes.

import { DEMO_MODE } from "../config/demo";
import { usePointsStore } from "../store/usePointsStore";
import { useMessagesStore } from "../store/useMessagesStore";
import { useAuthStore } from "../store/useAuthStore";
import { setAuthToken, setTokenGetter } from "../api/client";
import { clearSession } from "./session";

export function useAppAuth(): { signOut: () => Promise<void> } {
  return {
    signOut: async () => {
      if (!DEMO_MODE) {
        // ── Real-backend seam ──────────────────────────────────────────
        // await clerk.signOut();
        // Left unwired deliberately: adding @clerk/clerk-react is a
        // dependency decision for whoever reconnects the backend, and
        // stubbing it with a fake would hide that. Everything below still
        // runs, so the local session is fully torn down either way.
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
