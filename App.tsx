// App.tsx — Root entry point for ChapterHub
//
// Provider order matters:
//   1. "react-native-gesture-handler" side-effect import MUST be first
//   2. GestureHandlerRootView   — required by react-native-gesture-handler;
//        without it, bottom-tab navigation crashes on Android devices.
//   3. ClerkProvider            — required by @clerk/clerk-expo;
//        without it useSSO() throws "No Clerk context found".
//        SKIPPED ENTIRELY in Demo Mode (default) — see src/config/demo.ts.
//        Nothing in the component tree calls a Clerk hook in demo mode
//        (src/hooks/useAppAuth.ts guards the one place that would).
//   4. SafeAreaProvider         — required by @react-navigation/bottom-tabs;
//        without it tab bar overlaps the home indicator on iPhone.
//   5. RootNavigator            — auth gate; routes to Login or App tabs.
//        In Demo Mode, bootstrapDemoSession() below pre-populates the auth
//        store before first render, so RootNavigator routes straight past
//        Login into the app — no sign-in step at all.
//
// enableScreens() activates react-native-screens' native screen primitives.
// Called at module scope so it runs once before any navigation renders.

import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import React from "react";
import { StyleSheet } from "react-native";
import { enableScreens } from "react-native-screens";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

import RootNavigator from "./src/navigation/RootNavigator";
import SessionRestore from "./src/navigation/SessionRestore";
import ClerkTokenBridge from "./src/navigation/ClerkTokenBridge";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { DEMO_MODE } from "./src/config/demo";
import { bootstrapDemoSession } from "./src/mocks/bootstrap";

enableScreens();

// Required by Clerk's Expo OAuth flow (useSSO/startSSOFlow — Google/Apple
// sign-in on LoginScreen): without this, the in-app browser session opened
// for the OAuth redirect never signals completion back to the app, so the
// promise from startSSOFlow can hang or the browser tab can fail to
// auto-dismiss after the provider redirects back. Must be called once, at
// module scope, before any component calls useSSO.
WebBrowser.maybeCompleteAuthSession();

// Demo Mode (default, no env vars required): populate the auth store with a
// mock user before the first render, so the app launches straight into the
// Home Dashboard instead of a login screen. Runs once at module load, before
// React renders anything.
bootstrapDemoSession();

// Token cache backed by expo-secure-store — enables "stay logged in" across
// app restarts. Clerk writes and reads this automatically. Unused in Demo
// Mode (ClerkProvider isn't mounted at all).
const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Fail silently — user will need to re-login next launch
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!DEMO_MODE && !PUBLISHABLE_KEY) {
  throw new Error(
    [
      "",
      "──────────────────────────────────────────────────",
      "  Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "",
      "  You've set EXPO_PUBLIC_DEMO_MODE=false, which requires",
      "  a real Clerk account:",
      "  1. Copy .env.example → .env",
      "  2. Fill in your Clerk publishable key (pk_test_...)",
      "     from https://dashboard.clerk.com → API Keys",
      "",
      "  Or remove EXPO_PUBLIC_DEMO_MODE to go back to Demo Mode,",
      "  which needs no environment variables at all.",
      "──────────────────────────────────────────────────",
      "",
    ].join("\n")
  );
}

export default function App() {
  const content = (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        {DEMO_MODE ? (
          content
        ) : (
          <ClerkProvider publishableKey={PUBLISHABLE_KEY!} tokenCache={tokenCache}>
            {/* Keeps every API request's Authorization header on a live,
                unexpired JWT for the whole session — see ClerkTokenBridge's
                doc comment for why this can't just be a token cached once
                at sign-in. */}
            <ClerkTokenBridge>
              {/* Restores an existing Clerk session on cold start — see
                  SessionRestore.tsx doc comment. Only ever rendered here,
                  inside ClerkProvider; Demo Mode never mounts it. */}
              <SessionRestore>{content}</SessionRestore>
            </ClerkTokenBridge>
          </ClerkProvider>
        )}
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
