// src/navigation/ClerkTokenBridge.tsx
//
// Keeps api/client.ts's Authorization header supplied with a live, unexpired
// Clerk JWT for the lifetime of the session — see setTokenGetter's doc
// comment in api/client.ts for why a getter (not a cached token string) is
// required: Clerk session tokens expire in ~60 seconds and must be
// re-fetched via session.getToken() before each request.
//
// Only ever rendered inside <ClerkProvider> (see App.tsx), same as
// SessionRestore — useAuth() throws without that context, which is exactly
// why Demo Mode (no ClerkProvider mounted) must never render this component.
// Renders nothing itself; just wires the getter up/down as sign-in state
// changes and passes children through unchanged.

import React, { useEffect } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { setTokenGetter } from "../api/client";

export default function ClerkTokenBridge({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      setTokenGetter(() => getToken());
    } else {
      setTokenGetter(null);
    }
    return () => setTokenGetter(null);
  }, [isSignedIn, getToken]);

  return <>{children}</>;
}
