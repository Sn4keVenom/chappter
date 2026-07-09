// src/navigation/SessionRestore.tsx
//
// Restores an existing Clerk session on cold start (real/non-Demo Mode
// only). Without this, useAuthStore.user starts null on every launch and
// RootNavigator always shows the Login screen — even though Clerk's
// tokenCache (SecureStore, wired up in App.tsx) already has a valid
// refresh token. Users would have to re-authenticate every time they
// force-quit the app. This was tracked as a "Phase 3" TODO in
// useAuthStore.ts; this component is that phase.
//
// Only ever rendered inside <ClerkProvider> (see App.tsx) — useAuth()/
// useClerk() throw without that context, which is exactly why Demo Mode
// (no ClerkProvider mounted) must never render this component.
//
// Integration points:
//   · @clerk/clerk-expo useAuth() — isLoaded/isSignedIn from the cached session
//   · api/client.ts setAuthToken() — same wiring AuthNavigator's login flow uses
//   · api/users.ts getMe() — read-only profile fetch; deliberately NOT
//     syncUser(), which upserts — no need to write to the DB on every cold
//     start, only on first login (AuthNavigator already does that)
//   · store/useAuthStore.ts setUser()

import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth, useClerk } from "@clerk/clerk-expo";
import { setAuthToken } from "../api/client";
import { getMe } from "../api/users";
import { useAuthStore } from "../store/useAuthStore";
import { shouldRestoreSession } from "../auth/rememberMe";
import { colors } from "../theme/colors";

export default function SessionRestore({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const setUser = useAuthStore((s) => s.setUser);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    if (!isLoaded) return; // Clerk hasn't finished its own bootstrap yet

    if (!isSignedIn) {
      setUser(null);
      setRestoring(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Honor a previous "Remember Me" opt-out — see auth/rememberMe.ts.
        // Clerk's own tokenCache still has the session at this point (that's
        // why isSignedIn is true above); we deliberately sign out of it now
        // rather than continue restoring, so the session doesn't survive
        // this app restart.
        if (!(await shouldRestoreSession())) {
          await clerk.signOut();
          if (!cancelled) setUser(null);
          return;
        }

        const jwt = await clerk.session?.getToken();
        if (!jwt) throw new Error("Clerk session has no token");
        setAuthToken(jwt);

        const me = await getMe();
        if (cancelled) return;

        setUser({
          id: me.id,
          username: me.username,
          firstName: me.firstName,
          lastName: me.lastName,
          hasChapter: me.hasChapter,
          chapterId: me.chapterId,
          pendingJoinRequest: me.pendingJoinRequest,
          role: me.role,
          office: me.office,
          status: me.status,
          roleNumber: me.roleNumber,
          major: me.major,
          graduationYear: me.graduationYear,
          committeeChairOf: me.committeeChairOf,
          teamId: me.teamId,
        });
      } catch {
        // Clerk thinks we're signed in but our side couldn't restore
        // (backend unreachable, user row deleted, expired token) — fall
        // back to the login screen instead of getting stuck on a spinner.
        if (!cancelled) {
          setAuthToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || restoring) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
