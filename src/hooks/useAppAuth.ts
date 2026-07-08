// src/hooks/useAppAuth.ts
//
// Thin wrapper around Clerk's useAuth() so screens don't need to know Demo
// Mode exists. In demo mode there is no ClerkProvider in the tree at all
// (see App.tsx), so calling Clerk's useAuth() directly would throw "No
// Clerk context found" — this hook returns a demo-safe stand-in instead.
//
// DEMO_MODE is fixed for the lifetime of the app (it's read once from an
// env var at module load, never toggled at runtime), so which branch this
// hook takes never changes across a component's renders — safe despite
// looking like a conditional hook call.

import { useAuth as useClerkAuth } from "@clerk/clerk-expo";
import { DEMO_MODE } from "../config/demo";

export function useAppAuth(): { signOut: () => Promise<void> } {
  if (DEMO_MODE) {
    return { signOut: async () => {} };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkAuth();
}
