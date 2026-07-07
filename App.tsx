// App.tsx — Root entry point for ChapterHub
//
// Provider order matters:
//   1. "react-native-gesture-handler" side-effect import MUST be first
//   2. GestureHandlerRootView   — required by react-native-gesture-handler;
//        without it, bottom-tab navigation crashes on Android devices.
//   3. ClerkProvider            — required by @clerk/clerk-expo;
//        without it useSSO() throws "No Clerk context found".
//   4. SafeAreaProvider         — required by @react-navigation/bottom-tabs;
//        without it tab bar overlaps the home indicator on iPhone.
//   5. RootNavigator            — auth gate; routes to Login or App tabs.
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

import RootNavigator from "./src/navigation/RootNavigator";

enableScreens();

// Token cache backed by expo-secure-store — enables "stay logged in" across
// app restarts. Clerk writes and reads this automatically.
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

if (!PUBLISHABLE_KEY) {
  throw new Error(
    [
      "",
      "──────────────────────────────────────────────────",
      "  Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "",
      "  1. Copy .env.example → .env",
      "  2. Fill in your Clerk publishable key (pk_test_...)",
      "     from https://dashboard.clerk.com → API Keys",
      "──────────────────────────────────────────────────",
      "",
    ].join("\n")
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <SafeAreaProvider>
          <RootNavigator />
        </SafeAreaProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
