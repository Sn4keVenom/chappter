// src/navigation/AuthNavigator.tsx
//
// Single-screen auth flow using Clerk's SSO (Google OAuth).
//
// Auth flow (order is critical):
//   1. startSSOFlow()     — opens Google OAuth sheet
//   2. setActive()        — activates the Clerk session; makes clerk.session live
//   3. clerk.session.getToken()  — retrieves a short-lived JWT
//   4. setAuthToken(jwt)  — injects it into all future apiClient requests
//   5. syncUser()         — calls POST /auth/sync with the JWT to upsert the DB row
//   6. setUser()          — tells RootNavigator to switch to the App stack
//
// Steps 3–6 MUST happen after step 2. getToken() on a non-active session
// returns null and step 4 would send "Bearer null" to the backend.
//
// Integration points:
//   · @clerk/clerk-expo — useSSO, useClerk
//   · api/client.ts     — setAuthToken()
//   · api/auth.ts       — syncUser()
//   · useAuthStore      — setUser()

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSSO, useClerk } from "@clerk/clerk-expo";
import { setAuthToken } from "../api/client";
import { syncUser } from "../api/auth";
import { useAuthStore } from "../store/useAuthStore";
import { colors } from "../theme/colors";
import type { AuthStackParamList } from "./types";

const Stack = createNativeStackNavigator<AuthStackParamList>();

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const { setUser } = useAuthStore();

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await startSSOFlow({ strategy: "oauth_google" });

      // startSSOFlow completes when the OAuth sheet closes. If the user
      // cancelled, createdSessionId is null/undefined — bail out gracefully.
      if (!result.createdSessionId) {
        Alert.alert("Sign in cancelled", "Please try again.");
        return;
      }

      // ── Step 1: activate the session so clerk.session becomes available ──
      await clerk.setActive({ session: result.createdSessionId });

      // ── Step 2: get a short-lived JWT for our backend ────────────────────
      // clerk.session is now set because we called setActive above.
      // getToken() returns the JWT that POST /auth/sync and authMiddleware
      // expect in the Authorization: Bearer header.
      const jwt = await clerk.session?.getToken();
      if (!jwt) throw new Error("Could not retrieve session token from Clerk.");

      // ── Step 3: wire token into all future API calls ──────────────────────
      setAuthToken(jwt);

      // ── Step 4: provision or refresh the DB User row ─────────────────────
      // clerk.user is populated after setActive.
      const clerkUser = clerk.user;
      const user = await syncUser({
        firstName: clerkUser?.firstName ?? "Member",
        lastName: clerkUser?.lastName ?? "",
        email:
          clerkUser?.primaryEmailAddress?.emailAddress ??
          clerkUser?.emailAddresses[0]?.emailAddress ??
          "",
        avatarUrl: clerkUser?.imageUrl ?? undefined,
      });

      // ── Step 5: update auth store → RootNavigator switches to App stack ──
      setUser({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        committeeChairOf: user.committeeChairOf,
      });
    } catch (err: any) {
      // Reset the token if login failed mid-flow so the next attempt starts
      // from a clean state.
      setAuthToken(null);
      Alert.alert(
        "Sign in failed",
        err?.message ?? "Couldn't connect — check your network and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoMark}>ΘΤ</Text>
        </View>
        <Text style={styles.appName}>ChapterHub</Text>
        <Text style={styles.tagline}>Theta Tau Chapter Operations</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          )}
        </Pressable>

        <Text style={styles.disclaimer}>
          Sign in with your chapter Google account. Contact your Exec board if
          you're locked out.
        </Text>
      </View>
    </View>
  );
}

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: "space-between",
    paddingBottom: 48,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoMark: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1,
  },
  appName: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.primaryText,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.2,
  },
  actions: {
    paddingHorizontal: 28,
  },
  googleButton: {
    backgroundColor: colors.surface,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  disclaimer: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 18,
  },
});
