// src/auth/ClerkTokenBridge.tsx
//
// Mounted inside <ClerkProvider> (see App.tsx) — hands api/client.ts a live
// () => session.getToken() closure the moment a Clerk session exists, and
// clears it on sign-out. This is the seam client.ts's doc comment names
// (setTokenGetter) — see there for why a getter, not a cached token string.

import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setTokenGetter } from "../api/client";

export function ClerkTokenBridge(): null {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    setTokenGetter(isSignedIn ? () => getToken() : null);
    return () => setTokenGetter(null);
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
